require('dotenv').config();
const https = require('https');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const { TikTokLiveConnection, WebcastEvent, ControlEvent } = require('tiktok-live-connector');

const PORT = Number(process.env.PORT) || 3006;
let TIKTOK_USERNAME = process.env.TIKTOK_USERNAME || '@2166541467';
let TIKTOK_SESSION_ID = process.env.TIKTOK_SESSION_ID || '';
let tiktokConn = null;
let reconnectTimer = null;

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

// Chuẩn hóa thông tin người xem từ TikTok Live Connector (v2.x / v3 proto)
function extractUser(data) {
  const u = data?.user || data?.userDetails || data || {};
  const uniqueId = String(u.uniqueId || u.displayId || data?.uniqueId || u.id || '').trim();
  const rawNick = u.nickname || data?.nickname || uniqueId || 'Bạn Học';
  const nickname = String(rawNick).trim();
  const avatar =
    u.profilePictureUrl ||
    u.avatarThumb?.urlList?.[0] ||
    u.avatarMedium?.urlList?.[0] ||
    u.avatarLarge?.urlList?.[0] ||
    data?.profilePictureUrl ||
    data?.avatar ||
    `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(uniqueId || nickname || Math.random())}`;

  const cleanUid = uniqueId || (nickname && nickname !== 'Bạn Học' ? `user_${nickname.toLowerCase().replace(/[^a-z0-9_]/gi, '')}` : `user_${Date.now()}`);

  return {
    uniqueId: cleanUid,
    username: cleanUid,
    nickname: nickname || 'Bạn Học',
    avatar,
    profilePictureUrl: avatar
  };
}

// Bảng xếp hạng điểm bền vững (Map: username -> Player Info)
const playerScores = new Map();

function getOrCreatePlayer(rawUser) {
  const user = extractUser(rawUser);
  const username = user.uniqueId;
  if (!playerScores.has(username)) {
    playerScores.set(username, {
      username,
      nickname: user.nickname,
      avatar: user.avatar,
      score: 0,
      correctCount: 0,
      streak: 0,
      roses: 0,
      lastActive: Date.now()
    });
  }
  const player = playerScores.get(username);
  if (user.nickname && user.nickname !== 'Bạn Học' && player.nickname !== user.nickname) {
    player.nickname = user.nickname;
  }
  if (user.avatar && !player.avatar.includes('tiktokcdn') && user.avatar.includes('tiktokcdn')) {
    player.avatar = user.avatar;
  }
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

// Thuật toán xáo trộn Fisher-Yates
function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

let shuffledDeck = [];
let deckIndex = 0;

function refillAndShuffleDeck() {
  if (questionsBank.length === 0) return;
  shuffledDeck = shuffle(questionsBank);
  deckIndex = 0;
  console.log(`[Lớp Học] 🔀 Đã đảo lộn thứ tự ngẫu nhiên ${shuffledDeck.length} câu hỏi mới!`);
}

// Xáo trộn toàn bộ câu hỏi ngay lần đầu khởi động
refillAndShuffleDeck();

let roundNumber = 0;
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
      streak: desk.student.streak || 0,
      pointsEarned: desk.student.pointsEarned || 0,
      currentAnswer: desk.student.currentAnswer,
      isCorrect: desk.student.isCorrect,
      chatMsg: desk.student.chatMsg,
      chatTime: desk.student.chatTime
    } : null
  });
}

// Xếp chỗ ngồi cho người xem
function seatStudent(rawUser) {
  const user = extractUser(rawUser);
  const username = user.uniqueId;
  if (studentsMap.has(username)) {
    const existing = studentsMap.get(username);
    existing.student.lastActive = Date.now();
    if (user.avatar && !user.avatar.includes('dicebear')) existing.student.avatar = user.avatar;
    if (user.nickname && user.nickname !== 'Bạn Học') existing.student.nickname = user.nickname;
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
    nickname: user.nickname,
    avatar: user.avatar || player.avatar,
    bagColor: BAG_COLORS[targetDesk.id % BAG_COLORS.length],
    score: player.score,
    streak: player.streak || 0,
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

// Bộ sưu tập câu thoại phong phú của cô giáo khi ra đề
function getQuestionTeacherSpeech(q, round) {
  const subject = q.subject || 'Kiến thức';
  const grade = q.grade || 'Tiểu học';
  const customQuote = q.teacherQuote;

  const subjectQuotes = {
    'Toán': [
      `Câu số ${round}, môn Toán ${grade}! Thần đồng tính nhẩm hãy cho cô thấy đáp án nào!`,
      `Bài toán này ai giải đúng đầu tiên cô thưởng ngay điểm 10 vào sổ nhé!`,
      `Đề bài môn Toán ${grade} đã lên bảng, suy nghĩ kỹ kẻo nhầm phép tính nha!`,
      `Câu đố toán học cực kỳ hóc búa, xem bạn nào nhanh trí nhất lớp mình nhé!`
    ],
    'Tiếng Việt': [
      `Câu số ${round}, môn Tiếng Việt ${grade}! Chú ý chính tả và từ ngữ nha cả lớp!`,
      `Đọc kỹ câu hỏi Tiếng Việt kẻo bị cô gài bẫy đó nhé các em!`,
      `Một câu đố Tiếng Việt rất giàu đẹp và thú vị, đáp án là gì nhỉ?`,
      `Ai tự tin vốn từ vựng phong phú thì chọn nhanh đáp án cho cô xem nào!`
    ],
    'Khoa học': [
      `Câu số ${round}, môn Khoa học ${grade}! Cùng khám phá bí ẩn tự nhiên nào!`,
      `Một câu hỏi Khoa học đời sống cực kỳ thú vị, xem ai biết đáp án nào!`,
      `Khoa học muôn màu, các nhà bác học nhí hãy chốt đáp án A, B, C hay D nhé!`
    ],
    'Lịch sử': [
      `Câu số ${round}, môn Lịch sử ${grade}! Tự hào truyền thống non sông Việt Nam!`,
      `Cùng ôn lại những trang sử hào hùng nào, đáp án chính xác là gì các em?`
    ],
    'Địa lý': [
      `Câu số ${round}, môn Địa lý ${grade}! Chu du khắp mọi miền đất nước cùng cô nhé!`,
      `Khám phá danh lam thắng cảnh quê hương Việt Nam nào cả lớp!`
    ],
    'Đạo đức': [
      `Câu số ${round}, bài học Đạo đức ý nghĩa! Hãy chọn hành vi chuẩn mực nhất nhé!`,
      `Bé ngoan học giỏi, cùng làm bài tập Đạo đức cùng cô nào các em!`
    ]
  };

  const genericQuotes = [
    `Câu ${round}: Cả lớp trật tự nhìn lên bảng đen và chọn nhanh đáp án nào!`,
    `Câu số ${round}! Nhanh tay bình luận A, B, C hoặc D để giành vị trí Top 1 nhé!`,
    `Cô mời cả lớp cùng suy nghĩ và đưa ra câu trả lời thật chính xác!`,
    `Bạn nào trả lời nhanh và chuẩn nhất sẽ được cô xướng tên bảng vàng nhé!`,
    `Bút sa gà chết, suy nghĩ thật kỹ trước khi chốt đáp án nhé các trò!`
  ];

  const pool = [...(subjectQuotes[subject] || []), ...genericQuotes];
  if (customQuote) pool.unshift(customQuote);

  return pool[Math.floor(Math.random() * pool.length)];
}

// Bộ sưu tập câu thoại phong phú của cô giáo khi công bố kết quả
function getRevealTeacherSpeech(q, correctCount, totalAnswered, top1Student, topStreakStudent) {
  const correctOpt = q.correct;
  const correctText = q.options ? q.options[correctOpt] : '';

  if (totalAnswered === 0) {
    const noAnswerQuotes = [
      `Hết giờ rồi mà chưa bạn nào trả lời! Đáp án đúng là ${correctOpt}: ${correctText} nhé!`,
      `Hết giờ! Câu này hơi khó đúng không cả lớp? Đáp án chính xác là ${correctOpt}: ${correctText}!`,
      `Thời gian đã hết! Hãy nhớ đáp án chuẩn là ${correctOpt} nhé các em, câu sau cố gắng lên nào!`
    ];
    return noAnswerQuotes[Math.floor(Math.random() * noAnswerQuotes.length)];
  }

  if (correctCount === 0) {
    const allWrongQuotes = [
      `Ôi tiếc quá, cả lớp đều chưa đoán đúng câu này rồi! Đáp án chuẩn phải là ${correctOpt}: ${correctText} cơ!`,
      `Không bạn nào đoán trúng đáp án ${correctOpt} rồi! Câu này cô gài bẫy hơi kỹ, câu sau gỡ lại nhé!`,
      `Học tài thi phận, đáp án đúng là ${correctOpt}! Đừng nản lòng, chúng ta cùng cố gắng ở câu tiếp theo!`
    ];
    return allWrongQuotes[Math.floor(Math.random() * allWrongQuotes.length)];
  }

  // Ưu tiên khen ngợi học sinh có chuỗi winstreak khủng (từ 3 câu liên tiếp trở lên)
  if (topStreakStudent && topStreakStudent.streak >= 3) {
    const streakQuotes = [
      `Không thể cản phá! Bạn ${topStreakStudent.nickname} vừa đạt chuỗi ${topStreakStudent.streak} câu đúng liên tiếp! Quá siêu!`,
      `Đỉnh nóc kịch trần! Bạn ${topStreakStudent.nickname} bùng nổ với chuỗi ${topStreakStudent.streak} câu đúng liên tiếp!`,
      `Cả lớp vỗ tay chúc mừng bạn ${topStreakStudent.nickname} đang có chuỗi thắng ${topStreakStudent.streak} câu liên tục nào!`,
      `Phong độ quá đỉnh cao! Bạn ${topStreakStudent.nickname} nối dài chuỗi đúng lên con số ${topStreakStudent.streak}!`
    ];
    if (topStreakStudent.streak >= 5 || Math.random() < 0.6) {
      return streakQuotes[Math.floor(Math.random() * streakQuotes.length)];
    }
  }

  const ratio = correctCount / totalAnswered;
  if (ratio >= 0.7) {
    const praiseHigh = [
      `Tuyệt vời! Lớp mình hôm nay học giỏi quá, có tận ${correctCount} bạn trả lời đúng đáp án ${correctOpt}!`,
      `Hoan hô cả lớp! Đa số các em đều chọn chuẩn đáp án ${correctOpt}: ${correctText}! Cô có lời khen!`,
      top1Student
        ? `Xuất sắc! Đáp án chuẩn là ${correctOpt}! Bạn ${top1Student.nickname} nhanh như chớp nhận ngay 15 điểm!`
        : `Đáp án chính xác là ${correctOpt}! Cả lớp học rất chăm chú và xuất sắc!`
    ];
    return praiseHigh[Math.floor(Math.random() * praiseHigh.length)];
  }

  const normalQuotes = [
    `Đáp án đúng là ${correctOpt}: ${correctText}! Có ${correctCount} trên ${totalAnswered} bạn ghi điểm xuất sắc!`,
    top1Student
      ? `Chúc mừng bạn ${top1Student.nickname} đã nhanh tay nhất chọn đúng ${correctOpt} và nhận 15 điểm!`
      : `Đáp án chính xác là ${correctOpt}! Chúc mừng các bạn đã trả lời đúng nhé!`,
    `Đáp án chuẩn là ${correctOpt}! Các bạn chưa đúng đừng buồn, tích cực giơ tay ở câu tiếp theo nhé!`
  ];
  return normalQuotes[Math.floor(Math.random() * normalQuotes.length)];
}

// Bắt đầu câu hỏi mới
function startNewQuestion() {
  if (questionsBank.length === 0) return;

  // Nếu đã chơi hết một vòng danh sách hoặc chưa khởi tạo, đảo lộn danh sách mới
  if (shuffledDeck.length === 0 || deckIndex >= shuffledDeck.length) {
    refillAndShuffleDeck();
  }

  currentQuestion = shuffledDeck[deckIndex];
  deckIndex++;
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

  const quote = getQuestionTeacherSpeech(currentQuestion, roundNumber);
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
        d.student.streak = 0;
        const player = getOrCreatePlayer(d.student);
        player.streak = 0; // Trả lời sai reset chuỗi combo
      }
    } else if (d.student) {
      d.student.pointsEarned = 0;
      d.student.streak = 0;
      const player = getOrCreatePlayer(d.student);
      player.streak = 0;
    }
  });

  // Xếp thứ tự trả lời đúng theo thời gian (ai chọn trước được thưởng nhanh tay)
  correctStudents.sort((a, b) => (a.answerTime || 0) - (b.answerTime || 0));

  let topStreakStudent = null;

  correctStudents.forEach((student, index) => {
    const player = getOrCreatePlayer(student);
    const isFastest = index === 0; // Nhanh nhất lớp

    // Thưởng chuỗi thắng (winstreak):
    // - Streak 2: +2đ (Combo x2)
    // - Streak 3-4: +5đ (Combo x3-x4)
    // - Streak 5+: +10đ (Siêu Combo x5+ 🔥)
    player.streak = (player.streak || 0) + 1;
    let streakBonus = 0;
    if (player.streak >= 5) {
      streakBonus = 10;
    } else if (player.streak >= 3) {
      streakBonus = 5;
    } else if (player.streak === 2) {
      streakBonus = 2;
    }

    const earned = (isFastest ? 15 : 10) + streakBonus;
    player.score += earned;
    player.correctCount++;
    student.score = player.score;
    student.pointsEarned = earned;
    student.streak = player.streak;
    student.streakBonus = streakBonus;

    if (!topStreakStudent || player.streak > (topStreakStudent.streak || 0)) {
      topStreakStudent = student;
    }
  });

  answerStats.correctCount = correctCount;
  answerStats.total = totalAnswered;

  const top1Student = correctStudents[0];
  const praise = getRevealTeacherSpeech(currentQuestion, correctCount, totalAnswered, top1Student, topStreakStudent);

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
        nickname: d.student.nickname,
        avatar: d.student.avatar,
        bagColor: d.student.bagColor,
        currentAnswer: d.student.currentAnswer,
        isCorrect: d.student.isCorrect,
        score: d.student.score,
        streak: d.student.streak || 0,
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
        streak: d.student.streak || 0,
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
      const intermissionQuotes = [
        'Hít thở sâu nào, câu hỏi tiếp theo sẽ xuất hiện ngay sau đây!',
        'Cả lớp sẵn sàng chưa? Câu hỏi mới cực kỳ thú vị chuẩn bị lên bảng!',
        'Uống một ngụm nước rồi cùng cô giải câu hỏi tiếp theo nào!',
        'Ai chưa ghi được điểm thì chuẩn bị nhanh tay ở câu tiếp theo nhé!'
      ];
      teacherSpeech = { text: intermissionQuotes[Math.floor(Math.random() * intermissionQuotes.length)], time: Date.now(), priority: 3 };
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
  const user = extractUser(data);
  const desk = seatStudent(user);
  const commentText = (data.content || data.comment || data.message || '').trim();
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
  } else if (commentText) {
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
  const user = extractUser(data);
  const desk = seatStudent(user);
  const giftObj = data.gift || data.giftDetails || {};
  const giftName = giftObj.name || data.giftName || 'Hoa Hồng';
  const repeatCount = Math.max(1, Number(data.repeatCount || data.comboCount || giftObj.repeat_count || 1));
  const diamondCount = Math.max(1, Number(data.diamondCount || giftObj.diamondCount || giftObj.diamond_count || 1));
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

  const presidentQuotes = [
    `Cả lớp đứng dậy vỗ tay chúc mừng tân Lớp Trưởng ${desk.student.nickname} nào! 🎉`,
    `Cô chính thức bổ nhiệm bạn ${desk.student.nickname} làm Lớp Trưởng quyền lực của lớp học! 👑`,
    `Cảm ơn món quà tuyệt vời của bạn ${desk.student.nickname}! Cả lớp nghe theo hiệu lệnh Lớp Trưởng nhé! ✨`,
    `Lớp Trưởng ${desk.student.nickname} vừa đăng quang! Bạn nào quậy phá là bị ghi tên vào sổ đầu bài ngay nha!`,
    `Chào đón Lớp Trưởng tài ba ${desk.student.nickname} bước lên bục vinh dự! Cả lớp cùng chúc mừng bạn nào!`
  ];
  const teacherAnnounce = presidentQuotes[Math.floor(Math.random() * presidentQuotes.length)];
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
  const user = extractUser(data);
  const desk = seatStudent(user);
  const username = user.uniqueId;
  const nickname = user.nickname;
  const avatar = user.avatar;

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
  const player = getOrCreatePlayer(user);
  const followPoints = 10;
  player.score += followPoints;
  if (desk && desk.student) {
    desk.student.score = player.score;
    desk.student.pointsEarned = followPoints;
  }

  const quotes = [
    `Cảm ơn bạn ${nickname} đã follow kênh! Chào mừng em gia nhập lớp học nhé! 💖`,
    `Hoan hô bạn ${nickname} vừa follow kênh! Chúc em học thật giỏi và đạt điểm cao! ✨`,
    `Chào mừng tân học sinh ${nickname} đã theo dõi lớp học thông minh! 🎉`,
    `Một thành viên mới toanh vừa gia nhập lớp, cả lớp cùng chào đón bạn ${nickname} nào! 🌟`,
    `Bạn ${nickname} đã điểm danh vào lớp học! Nhận ngay một bàn học và 10 điểm thưởng nhé! 📚`,
    `Cảm ơn ${nickname} đã nhấn theo dõi lớp! Chúc em có những giờ học bổ ích và săn thật nhiều điểm 10!`
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

let lastCheerLikeCount = 0;

function handleUserLike(data) {
  const user = extractUser(data);
  const likeCount = Number(data.likeCount || data.count || 1);
  totalLikes += likeCount;
  io.emit('likes_update', {
    totalLikes,
    added: likeCount,
    username: user.nickname || user.uniqueId
  });

  // Cứ mỗi 100 tim tích lũy, cô giáo động viên cả lớp
  if (totalLikes - lastCheerLikeCount >= 100) {
    lastCheerLikeCount = totalLikes;
    const cheerQuotes = [
      'Cảm ơn cả lớp đã tích cực thả tim! Phòng học đang tràn ngập yêu thương rồi! 💖',
      'Bão tim rực rỡ quá, cô gửi ngàn lời yêu thương đến các học sinh chăm chỉ nhé! ✨',
      'Hoan nghênh tinh thần đoàn kết của cả lớp, thả tim hăng say quá các em ơi! 🎉'
    ];
    const cheer = cheerQuotes[Math.floor(Math.random() * cheerQuotes.length)];
    teacherSpeech = { text: cheer, time: Date.now(), priority: 3 };
    io.emit('teacher_cheer', { teacherSpeech });
    broadcastState();
  }
}

function scheduleReconnect(delay = 5000) {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    connectTikTokLive(TIKTOK_USERNAME);
  }, delay);
}

// Kết nối TikTok Live
function connectTikTokLive(username) {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (tiktokConn) {
    try { tiktokConn.disconnect(); } catch (e) {}
    tiktokConn = null;
  }

  TIKTOK_USERNAME = (username || TIKTOK_USERNAME || '').replace(/^@/, '').trim();
  if (!TIKTOK_USERNAME) {
    console.warn('[TikTok] Chưa có username TikTok để kết nối.');
    io.emit('tiktok_status', { connected: false, error: 'Chưa có username' });
    return;
  }

  console.log(`[TikTok] Đang kết nối tới Live của @${TIKTOK_USERNAME}...`);

  const connectionOptions = {
    processInitialData: true,
    fetchRoomInfoOnConnect: false,
    enableExtendedGiftInfo: false
  };

  if (TIKTOK_SESSION_ID) {
    connectionOptions.sessionId = TIKTOK_SESSION_ID;
  }

  tiktokConn = new TikTokLiveConnection(TIKTOK_USERNAME, connectionOptions);

  tiktokConn.on(ControlEvent.CONNECTED, state => {
    const roomId = state?.roomId || tiktokConn?.roomId || '';
    console.log(`[TikTok] ✅ Đã kết nối Live thành công tới phòng @${TIKTOK_USERNAME} (Room ID: ${roomId})!`);
    io.emit('tiktok_status', { connected: true, username: TIKTOK_USERNAME, roomId });
  });

  tiktokConn.on(ControlEvent.DISCONNECTED, () => {
    console.warn(`[TikTok] ⚠️ Mất kết nối tới @${TIKTOK_USERNAME}. Tự động kết nối lại sau 5s...`);
    io.emit('tiktok_status', { connected: false, username: TIKTOK_USERNAME, error: 'Disconnected' });
    scheduleReconnect(5000);
  });

  tiktokConn.on(ControlEvent.ERROR, err => {
    const errMsg = err?.message || String(err);
    console.warn(`[TikTok] Lỗi Socket @${TIKTOK_USERNAME}:`, errMsg);
  });

  tiktokConn.connect().then(state => {
    const roomId = state?.roomId || tiktokConn?.roomId || '';
    console.log(`[TikTok] ✅ Kết nối thành công tới phòng ${roomId}!`);
    io.emit('tiktok_status', { connected: true, username: TIKTOK_USERNAME, roomId });
  }).catch(err => {
    console.warn(`[TikTok] ⚠️ Chưa thể kết nối tới @${TIKTOK_USERNAME} (${err.message}). Tự động thử lại sau 5s...`);
    io.emit('tiktok_status', { connected: false, error: err.message, username: TIKTOK_USERNAME });
    scheduleReconnect(5000);
  });

  tiktokConn.on(WebcastEvent.CHAT, data => handleUserComment(data));
  tiktokConn.on(WebcastEvent.GIFT, data => handleUserGift(data));
  tiktokConn.on(WebcastEvent.LIKE, data => handleUserLike(data));
  tiktokConn.on(WebcastEvent.MEMBER, data => {
    const user = extractUser(data);
    seatStudent(user);
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
