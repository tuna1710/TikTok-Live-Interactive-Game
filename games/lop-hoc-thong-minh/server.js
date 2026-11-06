require('dotenv').config();
const https = require('https');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const { TikTokLiveConnection, WebcastEvent } = require('tiktok-live-connector');

const PORT = Number(process.env.PORT) || 3006;
let TIKTOK_USERNAME = process.env.TIKTOK_USERNAME || '@2166541467';
let TIKTOK_SESSION_ID = process.env.TIKTOK_SESSION_ID || '';
let tiktokConn = null;

const QUESTION_DURATION = 20; // 20 giây mỗi câu hỏi
const REVEAL_DURATION = 7;    // 7 giây công bố kết quả
const INTERMISSION_DURATION = 4; // 4 giây chuẩn bị câu mới

// Thư mục lưu cache âm thanh TTS
const TTS_CACHE_DIR = path.join(__dirname, 'data', 'tts-cache');
if (!fs.existsSync(TTS_CACHE_DIR)) {
  fs.mkdirSync(TTS_CACHE_DIR, { recursive: true });
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Proxy Google TTS Tiếng Việt
app.get('/api/tts', (req, res) => {
  const text = (req.query.text || '').toString().trim();
  if (!text) {
    return res.status(400).send('Missing text parameter');
  }

  const cleanText = text
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
    .slice(0, 180)
    .trim();

  if (!cleanText) {
    return res.status(400).send('Empty clean text');
  }

  const hash = crypto.createHash('md5').update(cleanText).digest('hex');
  const cacheFile = path.join(TTS_CACHE_DIR, `${hash}.mp3`);

  if (fs.existsSync(cacheFile)) {
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=604800');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return fs.createReadStream(cacheFile).pipe(res);
  }

  const googleTtsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=${encodeURIComponent(cleanText)}`;
  const reqOptions = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  };

  https.get(googleTtsUrl, reqOptions, (gRes) => {
    if (gRes.statusCode !== 200) {
      return res.status(gRes.statusCode).send('TTS service unavailable');
    }
    res.writeHead(200, {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'public, max-age=604800',
      'Access-Control-Allow-Origin': '*'
    });
    const fileStream = fs.createWriteStream(cacheFile);
    gRes.pipe(fileStream);
    gRes.pipe(res);
  }).on('error', (err) => {
    res.status(500).send('TTS error: ' + err.message);
  });
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// ==========================================
// CẤU HÌNH PHÒNG HỌC & GHẾ NGỒI
// ==========================================
// Lớp học gồm 40 bàn học (2 dãy lớn: dãy Trái và dãy Phải, mỗi dãy 2 cột x 10 hàng)
const TOTAL_DESKS = 40;
const desks = [];
for (let i = 0; i < TOTAL_DESKS; i++) {
  const isRightSide = i >= 20;
  const localIndex = i % 20;
  const col = isRightSide ? 2 + (localIndex % 2) : (localIndex % 2);
  const row = Math.floor(localIndex / 2);
  desks.push({
    id: i,
    side: isRightSide ? 'RIGHT' : 'LEFT',
    col,
    row,
    student: null
  });
}

// Bảng màu cặp sách học sinh (đỏ, hồng, xanh ngọc, vàng, cam...)
const BAG_COLORS = ['#3b82f6', '#ec4899', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4'];

// Quản lý học sinh trên bàn học (Map: username -> Desk Index & Info)
const studentsMap = new Map();

// Bảng xếp hạng điểm bền vững (Map: username -> Player Info)
const playerScores = new Map();

function getOrCreatePlayer(user) {
  const username = user.uniqueId || user.username || `user_${Date.now()}`;
  if (!playerScores.has(username)) {
    playerScores.set(username, {
      username,
      nickname: user.nickname || user.user || username,
      avatar: user.profilePictureUrl || user.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${username}`,
      score: 0,
      correctCount: 0,
      streak: 0,
      roses: 0,
      lastActive: Date.now()
    });
  }
  const player = playerScores.get(username);
  if (user.nickname && user.nickname !== player.nickname) player.nickname = user.nickname;
  if (user.profilePictureUrl && !player.avatar.includes('tiktokcdn')) player.avatar = user.profilePictureUrl;
  player.lastActive = Date.now();
  return player;
}

function getLeaderboard(limit = 10) {
  return Array.from(playerScores.values())
    .sort((a, b) => b.score - a.score || b.correctCount - a.correctCount)
    .slice(0, limit)
    .map((p, idx) => ({
      rank: idx + 1,
      username: p.username,
      nickname: p.nickname,
      avatar: p.avatar,
      score: p.score,
      streak: p.streak || 0,
      correctCount: p.correctCount || 0
    }));
}

// Lớp trưởng hiện tại
let classPresident = {
  username: null,
  nickname: 'Đang trống',
  avatar: 'https://p16-sign-va.tiktokcdn.com/tos-maliva-avt-0068/default.jpeg',
  expiresAt: 0,
  totalRoses: 0,
  title: 'LỚP TRƯỞNG'
};

// ==========================================
// NGÂN HÀNG CÂU HỎI
// ==========================================
let questionsBank = [];
try {
  questionsBank = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'questions.json'), 'utf8'));
} catch (e) {
  console.error('Không load được questions.json:', e);
}

let currentQuestionIndex = 0;
let roundNumber = 1;
let currentQuestion = null;
let gameState = 'QUESTION'; // 'QUESTION' | 'REVEAL' | 'INTERMISSION'
let timerCountdown = QUESTION_DURATION;
let timerInterval = null;
let totalLikes = 0;
let answerStats = { A: 0, B: 0, C: 0, D: 0, total: 0, correctCount: 0 };
let teacherSpeech = { text: 'Chào mừng các em đến với lớp học!', time: Date.now() };

// Gửi cập nhật riêng lẻ từng bàn học cho client theo thời gian thực
function emitDeskUpdate(desk) {
  if (!desk) return;
  io.emit('desk_updated', {
    deskId: desk.id,
    student: desk.student ? {
      username: desk.student.username,
      nickname: desk.student.nickname,
      avatar: desk.student.avatar,
      bagColor: desk.student.bagColor,
      score: desk.student.score,
      pointsEarned: desk.student.pointsEarned || 0,
      currentAnswer: desk.student.currentAnswer,
      isCorrect: desk.student.isCorrect,
      chatMsg: desk.student.chatMsg,
      chatTime: desk.student.chatTime
    } : null
  });
}

// Xếp chỗ ngồi cho người xem
function seatStudent(user) {
  const username = user.uniqueId || user.username || `user_${Date.now()}`;
  if (studentsMap.has(username)) {
    const existing = studentsMap.get(username);
    existing.student.lastActive = Date.now();
    if (user.profilePictureUrl) existing.student.avatar = user.profilePictureUrl;
    if (user.nickname) existing.student.nickname = user.nickname;
    emitDeskUpdate(existing);
    return existing;
  }

  // Tìm bàn trống đầu tiên
  let targetDesk = desks.find(d => d.student === null);
  if (!targetDesk) {
    // Nếu hết bàn trống, thay thế học sinh ít hoạt động nhất
    let oldestDesk = desks[0];
    let oldestTime = Date.now();
    for (const d of desks) {
      if (d.student && d.student.lastActive < oldestTime) {
        oldestTime = d.student.lastActive;
        oldestDesk = d;
      }
    }
    if (oldestDesk && oldestDesk.student) {
      studentsMap.delete(oldestDesk.student.username);
    }
    targetDesk = oldestDesk;
  }

  const player = getOrCreatePlayer(user);

  const studentObj = {
    username,
    nickname: user.nickname || username,
    avatar: user.profilePictureUrl || user.avatar || player.avatar,
    bagColor: BAG_COLORS[targetDesk.id % BAG_COLORS.length],
    score: player.score,
    pointsEarned: 0,
    currentAnswer: null,
    answerTime: 0,
    isCorrect: null,
    lastActive: Date.now(),
    chatMsg: null,
    chatTime: 0
  };

  targetDesk.student = studentObj;
  studentsMap.set(username, targetDesk);
  emitDeskUpdate(targetDesk);
  return targetDesk;
}

// Bắt đầu câu hỏi mới
function startNewQuestion() {
  if (questionsBank.length === 0) return;

  currentQuestion = questionsBank[currentQuestionIndex % questionsBank.length];
  currentQuestionIndex++;
  roundNumber++;
  gameState = 'QUESTION';
  timerCountdown = QUESTION_DURATION;
  answerStats = { A: 0, B: 0, C: 0, D: 0, total: 0, correctCount: 0 };

  // Xóa đáp án vòng trước của học sinh
  desks.forEach(d => {
    if (d.student) {
      d.student.currentAnswer = null;
      d.student.isCorrect = null;
      d.student.pointsEarned = 0;
      d.student.answerTime = 0;
    }
  });

  const quotes = [
    `Câu ${roundNumber}: ${currentQuestion.subject} cấp ${currentQuestion.grade}. Các em suy nghĩ kỹ nhé!`,
    currentQuestion.teacherQuote || 'Hãy nhanh tay bình luận đáp án A, B, C hoặc D nào!',
    'Cô mời cả lớp cùng suy nghĩ và đưa ra câu trả lời!',
    'Bạn nào trả lời nhanh và chính xác nhất sẽ được cô khen!'
  ];
  const quote = quotes[Math.floor(Math.random() * quotes.length)];
  teacherSpeech = { text: quote, time: Date.now(), priority: 3 };

  io.emit('round_question', {
    roundNumber,
    question: {
      id: currentQuestion.id,
      subject: currentQuestion.subject,
      grade: currentQuestion.grade,
      question: currentQuestion.question,
      options: currentQuestion.options
    },
    duration: QUESTION_DURATION,
    teacherSpeech
  });

  broadcastState();
}

// Công bố kết quả câu hỏi & Tính điểm học sinh
function revealAnswer() {
  gameState = 'REVEAL';
  timerCountdown = REVEAL_DURATION;

  let correctCount = 0;
  let totalAnswered = 0;
  const correctStudents = [];

  desks.forEach(d => {
    if (d.student && d.student.currentAnswer) {
      totalAnswered++;
      if (d.student.currentAnswer === currentQuestion.correct) {
        d.student.isCorrect = true;
        correctCount++;
        correctStudents.push(d.student);
      } else {
        d.student.isCorrect = false;
        d.student.pointsEarned = 0;
        const player = getOrCreatePlayer(d.student);
        player.streak = 0; // Trả lời sai reset chuỗi combo
      }
    } else if (d.student) {
      d.student.pointsEarned = 0;
    }
  });

  // Xếp thứ tự trả lời đúng theo thời gian (ai chọn trước được thưởng nhanh tay)
  correctStudents.sort((a, b) => (a.answerTime || 0) - (b.answerTime || 0));

  correctStudents.forEach((student, index) => {
    const player = getOrCreatePlayer(student);
    const isFastest = index === 0; // Nhanh nhất lớp

    // Logic tính điểm:
    // +15đ cho bạn nhanh nhất, +10đ cho các bạn sau
    // +5đ streak bonus nếu đúng liên tiếp >= 3 câu
    player.streak = (player.streak || 0) + 1;
    let earned = isFastest ? 15 : 10;
    if (player.streak >= 3) {
      earned += 5;
    }

    player.score += earned;
    player.correctCount++;
    student.score = player.score;
    student.pointsEarned = earned;
  });

  answerStats.correctCount = correctCount;
  answerStats.total = totalAnswered;

  const top1Student = correctStudents[0];
  let praise = `Đáp án đúng là ${currentQuestion.correct}! Có ${correctCount}/${totalAnswered} bạn đúng 👏`;
  if (totalAnswered === 0) {
    praise = `Hết giờ! Đáp án đúng là ${currentQuestion.correct}: ${currentQuestion.options[currentQuestion.correct]}!`;
  } else if (top1Student) {
    praise = `Đáp án đúng là ${currentQuestion.correct}! Bạn ${top1Student.nickname} nhanh tay nhất nhận +15 điểm! 🎉`;
  }

  teacherSpeech = { text: praise, time: Date.now(), priority: 3 };

  const leaderboard = getLeaderboard(5);

  io.emit('round_reveal', {
    correct: currentQuestion.correct,
    explanation: currentQuestion.explanation,
    stats: answerStats,
    teacherSpeech,
    leaderboard,
    desks: desks.map(d => ({
      id: d.id,
      student: d.student ? {
        username: d.student.username,
        currentAnswer: d.student.currentAnswer,
        isCorrect: d.student.isCorrect,
        score: d.student.score,
        pointsEarned: d.student.pointsEarned || 0
      } : null
    }))
  });

  broadcastState();
}

// Gửi trạng thái toàn phòng học cho client
function broadcastState() {
  io.emit('game_state_update', {
    gameState,
    timerCountdown,
    roundNumber,
    totalLikes,
    answerStats,
    leaderboard: getLeaderboard(5),
    classPresident: {
      ...classPresident,
      remainingSec: Math.max(0, Math.ceil((classPresident.expiresAt - Date.now()) / 1000))
    },
    teacherSpeech,
    desks: desks.map(d => ({
      id: d.id,
      col: d.col,
      row: d.row,
      side: d.side,
      student: d.student ? {
        username: d.student.username,
        nickname: d.student.nickname,
        avatar: d.student.avatar,
        bagColor: d.student.bagColor,
        score: d.student.score,
        pointsEarned: d.student.pointsEarned || 0,
        currentAnswer: d.student.currentAnswer,
        isCorrect: d.student.isCorrect,
        chatMsg: d.student.chatMsg,
        chatTime: d.student.chatTime
      } : null
    }))
  });
}

// Bộ đếm thời gian chính của vòng chơi
timerInterval = setInterval(() => {
  if (timerCountdown > 0) {
    timerCountdown--;
  }

  // Cập nhật lớp trưởng
  if (classPresident.expiresAt > 0 && Date.now() > classPresident.expiresAt) {
    classPresident.username = null;
    classPresident.nickname = 'Đang trống';
    classPresident.avatar = 'https://p16-sign-va.tiktokcdn.com/tos-maliva-avt-0068/default.jpeg';
    classPresident.expiresAt = 0;
    io.emit('president_expired');
  }

  if (timerCountdown <= 0) {
    if (gameState === 'QUESTION') {
      revealAnswer();
    } else if (gameState === 'REVEAL') {
      gameState = 'INTERMISSION';
      timerCountdown = INTERMISSION_DURATION;
      teacherSpeech = { text: 'Chuẩn bị sang câu hỏi tiếp theo nhé!', time: Date.now(), priority: 3 };
      broadcastState();
    } else if (gameState === 'INTERMISSION') {
      startNewQuestion();
    }
  }

  io.emit('timer_tick', {
    timerCountdown,
    gameState,
    presidentRemaining: Math.max(0, Math.ceil((classPresident.expiresAt - Date.now()) / 1000))
  });
}, 1000);

// ==========================================
// XỬ LÝ SỰ KIỆN TƯƠNG TÁC TIKTOK LIVE
// ==========================================
function handleUserComment(data) {
  const desk = seatStudent(data);
  const commentText = (data.comment || '').trim();
  const upper = commentText.toUpperCase();

  // Nhận diện đáp án A, B, C, D (hoặc 1, 2, 3, 4)
  let answerChosen = null;
  if (/^[A-D]$/.test(upper)) {
    answerChosen = upper;
  } else if (/^ĐÁP ÁN [A-D]$/i.test(commentText)) {
    answerChosen = commentText.slice(-1).toUpperCase();
  } else if (/^[1-4]$/.test(upper)) {
    const mapNum = { '1': 'A', '2': 'B', '3': 'C', '4': 'D' };
    answerChosen = mapNum[upper];
  }

  if (answerChosen && gameState === 'QUESTION') {
    // Nếu học sinh chưa chọn hoặc đổi đáp án
    const prev = desk.student.currentAnswer;
    if (prev) {
      answerStats[prev] = Math.max(0, answerStats[prev] - 1);
    } else {
      answerStats.total++;
    }
    desk.student.currentAnswer = answerChosen;
    desk.student.answerTime = Date.now();
    answerStats[answerChosen] = (answerStats[answerChosen] || 0) + 1;

    emitDeskUpdate(desk);

    io.emit('student_answered', {
      deskId: desk.id,
      username: desk.student.username,
      student: desk.student,
      answer: answerChosen,
      stats: answerStats
    });
  } else {
    // Bình luận giao lưu thông thường -> hiện bong bóng thoại trên đầu học sinh
    desk.student.chatMsg = commentText.slice(0, 40);
    desk.student.chatTime = Date.now();

    emitDeskUpdate(desk);

    io.emit('student_chat', {
      deskId: desk.id,
      username: desk.student.username,
      nickname: desk.student.nickname,
      student: desk.student,
      message: desk.student.chatMsg
    });
  }
}

function handleUserGift(data) {
  const desk = seatStudent(data);
  const giftName = data.giftName || 'Gift';
  const repeatCount = data.repeatCount || 1;
  const diamondCount = data.diamondCount || 1;
  const totalCoins = diamondCount * repeatCount;

  // Tính thời gian làm lớp trưởng dựa theo quà tặng
  // 1 bông hồng (1 xu) = 20 giây; Quà >= 10 xu = 60s; Quà >= 50 xu = 180s
  let durationSec = 20;
  if (totalCoins >= 50) durationSec = 180;
  else if (totalCoins >= 10) durationSec = 60;
  else durationSec = Math.min(120, 20 * repeatCount);

  // Cộng điểm thi đua quà tặng: 1 xu = +10 điểm
  const player = getOrCreatePlayer(desk.student);
  const giftPoints = totalCoins * 10;
  player.score += giftPoints;
  player.roses = (player.roses || 0) + repeatCount;
  desk.student.score = player.score;
  desk.student.pointsEarned = giftPoints;

  classPresident = {
    username: desk.student.username,
    nickname: desk.student.nickname,
    avatar: desk.student.avatar,
    expiresAt: Date.now() + durationSec * 1000,
    totalRoses: (classPresident.totalRoses || 0) + repeatCount,
    title: 'LỚP TRƯỞNG'
  };

  const teacherAnnounce = `Cô mời bạn ${desk.student.nickname} lên làm lớp trưởng nhé! 🎉`;
  teacherSpeech = { text: teacherAnnounce, time: Date.now(), priority: 1 };

  io.emit('new_class_president', {
    president: classPresident,
    giftName,
    repeatCount,
    durationSec,
    teacherSpeech
  });

  io.emit('celebration_effect', {
    type: 'CONFETTI_GIFT',
    sender: desk.student.nickname,
    giftName,
    count: repeatCount
  });

  broadcastState();
}

// Quản lý sự kiện Follow (Ưu tiên đọc #2)
const recentFollowers = new Map();

function handleUserFollow(data) {
  const desk = seatStudent(data);
  const username = data.uniqueId || data.username || `follower_${Date.now()}`;
  const nickname = data.nickname || (desk && desk.student ? desk.student.nickname : username);
  const avatar = data.profilePictureUrl || data.avatar || (desk && desk.student ? desk.student.avatar : '');

  const now = Date.now();
  const lastFollow = recentFollowers.get(username) || 0;
  if (now - lastFollow < 15000) {
    return null;
  }
  recentFollowers.set(username, now);
  if (recentFollowers.size > 200) {
    const firstKey = recentFollowers.keys().next().value;
    recentFollowers.delete(firstKey);
  }

  // Cộng +10 điểm quà nhập học cho tân học sinh
  const player = getOrCreatePlayer(data);
  const followPoints = 10;
  player.score += followPoints;
  if (desk && desk.student) {
    desk.student.score = player.score;
    desk.student.pointsEarned = followPoints;
  }

  const quotes = [
    `Cảm ơn bạn ${nickname} đã follow kênh! Chào mừng em gia nhập lớp học nhé! 💖`,
    `Hoan hô bạn ${nickname} vừa follow kênh! Chúc em học thật giỏi và đạt điểm cao! ✨`,
    `Chào mừng tân học sinh ${nickname} đã theo dõi lớp học thông minh! 🎉`
  ];
  const teacherAnnounce = quotes[Math.floor(Math.random() * quotes.length)];
  teacherSpeech = { text: teacherAnnounce, time: Date.now(), priority: 2 };

  const payload = {
    user: {
      username,
      nickname,
      avatar,
      deskId: desk ? desk.id : null,
      score: player.score
    },
    teacherSpeech
  };

  io.emit('user_follow', payload);
  broadcastState();
  return payload;
}

function handleUserLike(data) {
  const likeCount = data.likeCount || 1;
  totalLikes += likeCount;
  io.emit('likes_update', {
    totalLikes,
    added: likeCount,
    username: data.uniqueId || data.nickname
  });
}

// Kết nối TikTok Live
function connectTikTokLive(username) {
  if (tiktokConn) {
    try { tiktokConn.disconnect(); } catch (e) {}
  }

  TIKTOK_USERNAME = username.replace(/^@/, '');
  console.log(`[TikTok] Đang kết nối tới Live của @${TIKTOK_USERNAME}...`);

  tiktokConn = new TikTokLiveConnection(TIKTOK_USERNAME, {
    processInitialData: false,
    enableExtendedGiftInfo: true,
    sessionId: TIKTOK_SESSION_ID || undefined
  });

  tiktokConn.connect().then(state => {
    console.log(`[TikTok] Đã kết nối Live thành công tới phòng ${state.roomId}!`);
    io.emit('tiktok_status', { connected: true, username: TIKTOK_USERNAME, roomId: state.roomId });
  }).catch(err => {
    console.warn(`[TikTok] Không thể kết nối tới @${TIKTOK_USERNAME}:`, err.message);
    io.emit('tiktok_status', { connected: false, error: err.message, username: TIKTOK_USERNAME });
  });

  tiktokConn.on(WebcastEvent.CHAT, data => handleUserComment(data));
  tiktokConn.on(WebcastEvent.GIFT, data => handleUserGift(data));
  tiktokConn.on(WebcastEvent.LIKE, data => handleUserLike(data));
  tiktokConn.on(WebcastEvent.MEMBER, data => {
    const desk = seatStudent(data);
    if (desk) emitDeskUpdate(desk);
  });
  tiktokConn.on(WebcastEvent.FOLLOW, data => handleUserFollow(data));
  tiktokConn.on(WebcastEvent.SOCIAL, data => {
    const action = String(data?.action || '');
    const disp = String(data?.common?.displayText?.displayType || data?.displayType || '').toLowerCase();
    if (action === '1' || disp.includes('follow')) {
      handleUserFollow(data);
    }
  });
}

// ==========================================
// REST API & ADMIN CONTROLS
// ==========================================
app.get('/api/state', (req, res) => {
  res.json({
    gameState,
    timerCountdown,
    roundNumber,
    currentQuestion: currentQuestion ? {
      id: currentQuestion.id,
      subject: currentQuestion.subject,
      grade: currentQuestion.grade,
      question: currentQuestion.question,
      options: currentQuestion.options
    } : null,
    totalLikes,
    answerStats,
    classPresident,
    leaderboard: getLeaderboard(10),
    desksCount: desks.length,
    activeStudents: Array.from(studentsMap.values()).length
  });
});

// Giả lập tương tác để test không cần phát live thật
app.post('/api/simulate', (req, res) => {
  const { type, username, nickname, comment, giftName, count, answer } = req.body;
  const mockUser = {
    uniqueId: username || `hoc_sinh_${Math.floor(Math.random() * 30 + 1)}`,
    nickname: nickname || `Bạn Học ${Math.floor(Math.random() * 30 + 1)}`,
    profilePictureUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${username || Math.random()}`
  };

  if (type === 'join') {
    const desk = seatStudent(mockUser);
    emitDeskUpdate(desk);
  } else if (type === 'comment') {
    handleUserComment({ ...mockUser, comment: comment || 'Em chào cô ạ!' });
  } else if (type === 'answer') {
    handleUserComment({ ...mockUser, comment: answer || 'A' });
  } else if (type === 'gift') {
    handleUserGift({
      ...mockUser,
      giftName: giftName || 'Hoa Hồng',
      repeatCount: Number(count) || 1,
      diamondCount: 1
    });
  } else if (type === 'follow') {
    handleUserFollow(mockUser);
  } else if (type === 'like') {
    handleUserLike({ ...mockUser, likeCount: Number(count) || 5 });
  }

  res.json({ success: true });
});

app.post('/api/control/next', (req, res) => {
  startNewQuestion();
  res.json({ success: true, message: 'Đã chuyển sang câu tiếp theo' });
});

app.post('/api/control/connect-tiktok', (req, res) => {
  const { username } = req.body;
  if (username) {
    connectTikTokLive(username);
  }
  res.json({ success: true });
});

// Socket.io client connections
io.on('connection', socket => {
  socket.emit('init_game', {
    gameState,
    timerCountdown,
    roundNumber,
    currentQuestion: currentQuestion ? {
      id: currentQuestion.id,
      subject: currentQuestion.subject,
      grade: currentQuestion.grade,
      question: currentQuestion.question,
      options: currentQuestion.options
    } : null,
    totalLikes,
    answerStats,
    leaderboard: getLeaderboard(5),
    classPresident,
    teacherSpeech,
    desks
  });

  // Tương tác trực tiếp từ Web Client (cho người xem bấm trực tiếp trên trình duyệt)
  socket.on('join_class', data => {
    const user = {
      uniqueId: data?.username || `web_${socket.id.slice(0, 6)}`,
      nickname: data?.nickname || 'Bạn Học',
      profilePictureUrl: data?.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${socket.id}`
    };
    const desk = seatStudent(user);
    emitDeskUpdate(desk);
  });

  socket.on('submit_answer', data => {
    handleUserComment({
      uniqueId: data?.username || `web_${socket.id.slice(0, 6)}`,
      nickname: data?.nickname || 'Bạn Học',
      profilePictureUrl: data?.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${socket.id}`,
      comment: data?.answer || 'A'
    });
  });

  socket.on('send_chat', data => {
    handleUserComment({
      uniqueId: data?.username || `web_${socket.id.slice(0, 6)}`,
      nickname: data?.nickname || 'Bạn Học',
      profilePictureUrl: data?.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${socket.id}`,
      comment: data?.message || 'Em chào cô ạ!'
    });
  });
});

// Khởi chạy server
server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🎓 GAME LỚP HỌC THÔNG MINH ĐÃ KHỞI CHẠY TRÊN PORT ${PORT}`);
  console.log(`👉 Màn hình game 9:16: http://localhost:${PORT}`);
  console.log(`👉 Trang Quản trị & Test giả lập: http://localhost:${PORT}/admin.html`);
  console.log(`=======================================================`);

  // Bắt đầu ngay câu hỏi đầu tiên
  startNewQuestion();

  // Tự động kết nối TikTok Live nếu có username
  if (TIKTOK_USERNAME) {
    connectTikTokLive(TIKTOK_USERNAME);
  }
});
