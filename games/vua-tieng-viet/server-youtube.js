require('dotenv').config();
const https = require('https');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const { LiveChat } = require('youtube-chat');

const PORT = Number(process.env.PORT) || 3002;
let YOUTUBE_LIVE_ID = process.env.YOUTUBE_LIVE_ID || 'TuH8JlNLlxI';
let liveChat = null;
const ROUND_TIME_DEFAULT = Number(process.env.ROUND_TIME) || 300; // 5 phút (300 giây)

const TTS_CACHE_DIR = path.join(__dirname, 'data', 'tts-cache');
if (!fs.existsSync(TTS_CACHE_DIR)) {
  fs.mkdirSync(TTS_CACHE_DIR, { recursive: true });
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Endpoint Proxy TTS (Google Translate TTS tiếng Việt)
app.get('/api/tts', (req, res) => {
  const text = (req.query.text || '').toString().trim();
  if (!text) return res.status(400).send('Missing text parameter');

  const cleanText = text
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
    .slice(0, 180)
    .trim();

  if (!cleanText) return res.status(400).send('Empty clean text');

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
      console.warn(`[TTS Proxy] Google Translate trả mã ${gRes.statusCode} cho: "${cleanText}"`);
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
    console.error('[TTS Proxy Error]', err.message);
    res.status(500).send('TTS error: ' + err.message);
  });
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Quản lý Gói Câu Hỏi (Packs: Gói Đặc Biệt 2.160 câu, Gói Ngày 1 đến Ngày 7 mỗi gói 300 câu...)
const AVAILABLE_PACKS = [
  { id: 'special', name: '🌟 Gói Đặc Biệt (2.160 câu tổng hợp)', file: './data/words.json', totalWords: 2160 },
  { id: 'day_1', name: '📅 Gói Ngày 1: Đời Sống & Thành Ngữ Mới (300 câu)', file: './data/packs/day_1.json', totalWords: 300 },
  { id: 'day_2', name: '📅 Gói Ngày 2: Ẩm Thực 3 Miền & Quê Hương (300 câu)', file: './data/packs/day_2.json', totalWords: 300 },
  { id: 'day_3', name: '📅 Gói Ngày 3: Tục Ngữ Dân Gian & Tự Nhiên (300 câu)', file: './data/packs/day_3.json', totalWords: 300 },
  { id: 'day_4', name: '📅 Gói Ngày 4: Danh Lam Cổ Tích & Con Người (300 câu)', file: './data/packs/day_4.json', totalWords: 300 },
  { id: 'day_5', name: '📅 Gói Ngày 5: Hot Trend & Đời Sống Xã Hội (300 câu)', file: './data/packs/day_5.json', totalWords: 300 },
  { id: 'day_6', name: '📅 Gói Ngày 6: Ca Dao Tục Ngữ & Trí Tuệ Dân Gian (300 câu)', file: './data/packs/day_6.json', totalWords: 300 },
  { id: 'day_7', name: '📅 Gói Ngày 7: Đố Vui Hài Hước & Trend Mạng Xã Hội (300 câu)', file: './data/packs/day_7.json', totalWords: 300 },
  { id: 'day_8', name: '🟢 Gói Ngày 8: Từ Ngắn Dễ Đoán & Đời Sống Quen Thuộc (300 câu)', file: './data/packs/day_8.json', totalWords: 300 },
  { id: 'day_9', name: '🟢 Gói Ngày 9: Từ Ngắn Dễ Đoán & Thế Giới Xung Quanh (300 câu)', file: './data/packs/day_9.json', totalWords: 300 },
  { id: 'day_10', name: '🟢 Gói Ngày 10: Từ Ngắn Dễ Đoán & Khám Phá Cuộc Sống (300 câu)', file: './data/packs/day_10.json', totalWords: 300 },
  { id: 'day_11', name: '🟢 Gói Ngày 11: Từ Ngắn Dễ Đoán & Nét Đẹp Quê Hương (300 câu)', file: './data/packs/day_11.json', totalWords: 300 },
];
let currentPackId = 'special';
let wordsData = [...require('./data/words.json')];
const PLAYED_WORDS_FILE = path.join(__dirname, 'data', 'played_words.json');
let playedWordIds = new Set();
let wordDeck = [];

// Kho câu hỏi tổng hợp tất cả các gói (Toàn bộ kho câu hỏi)
function loadAllWordsMaster() {
  const list = [];
  for (const p of AVAILABLE_PACKS) {
    try {
      const pFile = path.resolve(__dirname, p.file);
      if (fs.existsSync(pFile)) {
        const raw = JSON.parse(fs.readFileSync(pFile, 'utf-8'));
        if (Array.isArray(raw)) {
          for (const item of raw) {
            if (item && item.word) {
              list.push({
                ...item,
                packId: p.id,
                packName: p.name,
              });
            }
          }
        }
      }
    } catch (e) {
      console.error(`[Master Words] Lỗi đọc gói ${p.id}:`, e.message);
    }
  }
  return list;
}
const allWordsMaster = loadAllWordsMaster();

function findWordById(wordId, packId = null) {
  const idNum = Number(wordId);
  if (packId && packId !== 'all' && packId !== 'current') {
    const match = allWordsMaster.find(w => w.id === idNum && w.packId === packId);
    if (match) return { ...match };
  }
  const currentMatch = wordsData.find(w => w.id === idNum);
  if (currentMatch) {
    return {
      ...currentMatch,
      packId: currentPackId,
      packName: AVAILABLE_PACKS.find(p => p.id === currentPackId)?.name || 'Gói Hiện Tại'
    };
  }
  const anyMatch = allWordsMaster.find(w => w.id === idNum);
  if (anyMatch) return { ...anyMatch };
  return null;
}

// Quản lý Vòng Bình Chọn Chủ Đề Khán Giả (Cứ 15 câu 1 lần -> Câu đặc biệt 500 điểm)
const TOPIC_VOTE_INTERVAL = 15;
let questionsInVoteCycle = 0;
let isSpecial500Round = false;
let nextSpecialCategory = null;

let topicVoteState = {
  active: false,
  options: [],
  votedUsers: new Set(),
  timeLeft: 12,
  duration: 12,
  timer: null,
};

// Game State
let gameState = {
  round: 0,
  currentWord: null,
  scrambledLetters: [],
  revealedMask: [],
  timeLeft: ROUND_TIME_DEFAULT,
  roundState: 'WAITING',
  lastWinner: null,
  totalLikes: 0,
  connectedChannel: `YouTube: ${YOUTUBE_LIVE_ID}`,
  tiktokConnected: false, // Giữ tương thích giao diện frontend
  tiktokConnecting: false,
  tiktokStatusType: 'init',
  tiktokStatusMsg: 'Đang khởi động kết nối YouTube...',
  totalCommentsReceived: 0,
  ttsEnabled: true,
  isBossRound: false,
  roundTimeTotal: ROUND_TIME_DEFAULT,
  isSpecial500: false,
  pointsReward: 100,
};

const serverStartTime = Date.now();
const seenMessageIds = new Set();
let timerInterval = null;
let reconnectTimer = null;
let nextRoundTimer = null;
let isCelebratingMilestone = false;
let activeMilestone = null;
const MILESTONE_SCORE = Number(process.env.MILESTONE_SCORE) || 2000;
const MILESTONE_DURATION = Number(process.env.MILESTONE_DURATION) || 20;
const leaderboard = new Map();
const donorLeaderboard = new Map();
let recentGuesses = [];

// Quản lý Follow & Vinh Danh Nhà Hảo Tâm
let isCelebratingDonorHonor = false;
let donorHonorTimer = null;
let activeDonorHonor = null;
const DONOR_HONOR_DURATION = Number(process.env.DONOR_HONOR_DURATION) || 20;
const recentFollowers = new Map();
let lastFollowEvent = null;

// Quản lý Chuỗi Thắng Liên Tiếp (Combo Win Streak & Flame - Mục 2)
let currentStreakWinner = null;

// Quản lý Điểm Quà Tặng (1 Xu = 500 Điểm, Tối đa từ quà = 1.900đ, Bỏ Buff x2)
const POINTS_PER_DIAMOND = Number(process.env.POINTS_PER_DIAMOND) || 500;
const MAX_GIFT_SCORE = 1900;

// Quản lý Chống Khoảng Lặng (Anti-Dead Air: 10s im lặng phát giọng đọc khuấy động hoặc nhắc câu hỏi)
const IDLE_TIMEOUT_SECONDS = Number(process.env.IDLE_TIMEOUT_SECONDS) || 10;
let idleSecondsCount = 0;
let idleReminderToggle = false;
let unusedIdleLines = [];

const IDLE_ENGAGING_LINES = [
  "Ủa cả phòng mình đi đâu hết rồi? Câu này dễ thế này mà chưa ai đoán ra sao?",
  "Các cao thủ Tiếng Việt phòng live đâu hết rồi ạ? Mau xuất chiêu cho mọi người trầm trồ nào!",
  "Đừng bảo với tôi là câu đố này làm khó được các bậc thầy ngôn ngữ ở đây nhé!",
  "Trầm ngâm lâu quá nha quý vị ơi! Nhanh tay gõ đáp án vào ô bình luận nào!",
  "Hình như câu này hơi hóc búa thì phải, có ai giải cứu phòng live lúc này không?",
  "Im ắng thế này là mọi người đang vắt óc suy nghĩ hay là đang đi uống trà sữa vậy ta?",
  "Ai sẽ là người đầu tiên phá vỡ sự im lặng và rinh ngay một trăm điểm vòng này đây?",
  "Thời gian đang trôi dần rồi cả nhà ơi, nhìn kỹ các chữ cái bị xáo trộn kìa!",
  "Chữ cái đã bày ra trước mắt rồi, ghép lại một chút là ra ngay đáp án thôi!",
  "Gợi ý to đùng ở góc màn hình kìa quý vị, đọc kỹ một chút là thấy ngay đáp án!",
  "Ai chưa rõ câu hỏi thì nhìn lên góc phải nhé, gợi ý rất rõ ràng luôn đó!",
  "Chỉ cần một đáp án chính xác thôi, ai sẽ là vị cứu tinh của vòng này nào?",
  "Nhanh tay lên nào mọi người ơi, đồng hồ đếm ngược không chờ đợi ai đâu nhé!",
  "Nếu bí từ quá thì cùng nhau chạm nhẹ tay vào màn hình thả tim để mở rương lấy thêm chữ cái gợi ý nhé!",
  "Mọi người cùng nhau nhấp đôi vào màn hình thả tim nào, rương kho báu sắp mở bung rồi đó!",
  "Thả tim nhiệt tình lên cả nhà ơi, rương mở ra là có thêm chữ cái gợi ý và cộng thêm thời gian liền!",
  "Tiến độ rương tim đang tăng rất nhanh, cả nhà cùng chung tay thả tim mở khóa đáp án nào!",
  "Câu này khó quá thì gửi nhẹ một bông hoa hồng một xu là hệ thống mở ngay một chữ cái nhé!",
  "Bí đáp án thì đừng quên tuyệt chiêu tặng một bông hoa để hé lộ ngay chữ cái bí mật nha!",
  "Chỉ cần một xu là mở ngay một ô chữ, ai sẽ là người tiên phong mở đường vòng này đây?",
  "Muốn vượt lên top bảng xếp hạng? Tặng quà vừa mở chữ vừa cộng thẳng năm trăm điểm luôn nhé!",
  "Cố lên nào các bạn ơi, chiến thắng chỉ cách một bình luận chính xác mà thôi!",
  "Đừng ngại thử vận may, cứ gõ suy đoán của mình vào bình luận, biết đâu lại đúng!",
  "Không khí đang nóng dần lên rồi, hãy cho tôi thấy cánh tay của các chiến thần đố chữ nào!",
  "Mọi người tập trung cao độ quá, sắp có đáp án chính xác xuất hiện rồi đúng không?",
  "Đáp án đang ở ngay trên đầu lưỡi rồi kìa, nhanh tay gõ vào phần chat đi nào!",
  "Đồng hồ đang tích tắc trôi, cơ hội ghi điểm đang tuột dần đó quý vị ơi!",
  "Thời gian suy nghĩ không còn nhiều đâu, nhanh tay gửi câu trả lời nào cả nhà!",
  "Chỉ còn ít giây nữa thôi, ai sẽ giành trọn điểm số vòng này trước khi hết giờ đây?",
  "Chuông báo sắp reo rồi, bình luận ngay đáp án của bạn trước khi quá muộn nhé!"
];

function resetIdleTimer() {
  idleSecondsCount = 0;
}

function getNextIdleLine() {
  if (unusedIdleLines.length === 0) {
    unusedIdleLines = [...IDLE_ENGAGING_LINES].sort(() => Math.random() - 0.5);
  }
  return unusedIdleLines.pop();
}

function triggerIdleReminder(force = false) {
  if (!force && gameState.roundState !== 'PLAYING') return null;
  if (!force && !gameState.currentWord) return null;
  if (!force && (isCelebratingMilestone || isCelebratingDonorHonor)) return null;
  if (!force && gameState.timeLeft <= 8) return null;

  idleReminderToggle = !idleReminderToggle;
  let ttsText = '';

  if (idleReminderToggle && gameState.currentWord) {
    ttsText = `Xin nhắc lại câu hỏi vòng ${gameState.round}. Chủ đề: ${gameState.currentWord.category}. Gợi ý là: ${gameState.currentWord.hint}`;
  } else {
    ttsText = getNextIdleLine();
  }

  console.log(`🎙️ [CHỐNG KHOẢNG LẶNG 10S] Phát giọng đọc: "${ttsText}"`);
  io.emit('idleReminder', { ttsText });
  resetIdleTimer();
  return ttsText;
}

// Quản lý Câu Đố Trùm (Đã bỏ theo yêu cầu)
let nextRoundIsBoss = false;
let pendingStreamerWord = null;

function onUserFollow(user) {
  resetIdleTimer();
  const uniqueId = user.uniqueId || user.nickname || 'user_' + Date.now();
  const nickname = user.nickname || user.user || uniqueId;
  const avatar = user.avatar || 'https://p16-sign-va.tiktokcdn.com/tos-maliva-avt-0068/default-avatar.jpeg';

  const now = Date.now();
  const lastFollow = recentFollowers.get(uniqueId) || 0;
  if (now - lastFollow < 20000) {
    return null;
  }
  recentFollowers.set(uniqueId, now);
  if (recentFollowers.size > 300) {
    const firstKey = recentFollowers.keys().next().value;
    recentFollowers.delete(firstKey);
  }

  // Tự động mở 3 ô chữ cái gợi ý cho phòng live
  const revealedLetters = [];
  if (gameState.roundState === 'PLAYING' && gameState.currentWord) {
    for (let i = 0; i < 3; i++) {
      const res = revealOneHint({ uniqueId, nickname, avatar }, '💖 Follow Kênh', false, true);
      if (res && res.letter && res.index !== undefined) {
        revealedLetters.push(res.letter);
      } else {
        break;
      }
    }
  }

  let ttsText = '';
  if (revealedLetters.length > 0) {
    ttsText = `Cảm ơn bạn ${nickname} đã follow kênh và mở tặng ${revealedLetters.length} chữ cái gợi ý! Chúc cả nhà đoán đúng!`;
  } else {
    ttsText = `Cảm ơn bạn ${nickname} đã follow kênh! Chúc bạn chơi game vui vẻ!`;
  }

  const payload = {
    user: { uniqueId, nickname, avatar },
    ttsText,
    revealedLetters,
    timestamp: now
  };

  lastFollowEvent = payload;
  console.log(`💖 [Follow] Cảm ơn ${nickname} (@${uniqueId}) đã follow kênh! (Mở ${revealedLetters.length} ô chữ: ${revealedLetters.join(', ')})`);
  io.emit('userFollow', payload);
  return payload;
}

function triggerDonorHonorCelebration(donor = null, duration = DONOR_HONOR_DURATION) {
  const donorList = getDonorLeaderboardList();
  const top1 = donorList[0] || donor;
  const targetDonor = donor || top1;
  if (!targetDonor) return null;

  isCelebratingDonorHonor = true;
  const top5Donors = donorList.slice(0, 5);

  let top5Tts = '';
  if (top5Donors.length > 0) {
    const listDesc = top5Donors.map((d, i) => `Top ${i + 1}: ${d.nickname} ${d.diamonds} xu`).join(', ');
    top5Tts = ` Cùng bảng vàng Top 5 nhà hảo tâm: ${listDesc}.`;
  }

  const ttsText = `Nhiệt liệt tri ân và vinh danh nhà hảo tâm ${targetDonor.nickname} đã ủng hộ ${targetDonor.diamonds} xu cho kênh!${top5Tts} Chân thành cảm ơn tấm lòng vàng của bạn!`;

  activeDonorHonor = {
    donor: {
      uniqueId: targetDonor.uniqueId,
      nickname: targetDonor.nickname,
      avatar: targetDonor.avatar || 'https://p16-sign-va.tiktokcdn.com/tos-maliva-avt-0068/default-avatar.jpeg',
      diamonds: targetDonor.diamonds,
      giftsCount: targetDonor.giftsCount || 1,
      lastGiftName: targetDonor.lastGiftName || 'Quà VIP',
    },
    top5: top5Donors,
    title: 'ĐỆ NHẤT PHÚ HỘ - BẢNG VÀNG TRI ÂN',
    duration: duration,
    startedAt: Date.now(),
    ttsText: ttsText,
  };

  console.log(`🌟 [VINH DANH NHÀ HẢO TÂM] ${targetDonor.nickname} với ${targetDonor.diamonds} xu! (${duration}s)`);
  io.emit('donorHonorCelebration', activeDonorHonor);

  if (donorHonorTimer) clearTimeout(donorHonorTimer);
  donorHonorTimer = setTimeout(() => {
    endDonorHonor();
  }, duration * 1000);

  return activeDonorHonor;
}

function endDonorHonor() {
  if (donorHonorTimer) {
    clearTimeout(donorHonorTimer);
    donorHonorTimer = null;
  }
  isCelebratingDonorHonor = false;
  activeDonorHonor = null;
  io.emit('donorHonorEnd');
}

function endMilestoneAndResetLeaderboard() {
  if (nextRoundTimer) {
    clearTimeout(nextRoundTimer);
    nextRoundTimer = null;
  }
  isCelebratingMilestone = false;
  activeMilestone = null;
  currentStreakWinner = null;
  console.log('🔄 [Vinh Danh Hoàn Tất] Reset bảng top điểm (giữ nguyên bảng tấm lòng vàng)! Bắt đầu chặng đua mới.');

  leaderboard.clear();
  io.emit('leaderboardReset', []);
  io.emit('milestoneEnd');
  io.emit('streakUpdate', null);
  startNewRound();
}

function triggerMilestoneCelebration(user, score = MILESTONE_SCORE, duration = MILESTONE_DURATION) {
  isCelebratingMilestone = true;
  const top5List = getLeaderboardList().slice(0, 5);
  const topDonorsList = getDonorLeaderboardList().slice(0, 5);

  let top5Tts = '';
  if (top5List.length > 0) {
    const listDescriptions = top5List.map((p, idx) => `Top ${idx + 1}: ${p.nickname} ${p.score} điểm`).join(', ');
    top5Tts = ` Vinh danh bảng vàng Top 5: ${listDescriptions}.`;
  }

  let topDonorsTts = '';
  if (topDonorsList.length > 0) {
    const top1 = topDonorsList[0];
    topDonorsTts = ` Trân trọng tri ân đại phú hộ ${top1.nickname} với ${top1.diamonds} xu cùng các nhà hảo tâm đã ủng hộ hết mình!`;
  }

  const ttsText = `Nhiệt liệt chúc mừng Đại Kiện Tướng ${user.nickname} đã xuất sắc đoán đúng câu quyết định để chạm mốc ${score} điểm!${top5Tts}${topDonorsTts} Chân thành cảm ơn tất cả quý khán giả đã nhiệt tình tham gia và tương tác cùng phòng live! Xin mời mọi người cùng chờ đợi trong giây lát để bước vào màn chơi tiếp theo!`;
  console.log(`🌟 ĐẠI VINH DANH CÁN MỐC: ${user.nickname} đạt ${score} điểm! (${duration}s)`);
  console.log(`📢 BẢNG VÀNG TOP 5:\n` + top5List.map((p, i) => `   Top ${i + 1}: ${p.nickname} (${p.score}đ)`).join('\n'));
  console.log(`💎 BẢNG VÀNG TOP NHÀ HẢO TÂM:\n` + topDonorsList.map((d, i) => `   Top ${i + 1}: ${d.nickname} (${d.diamonds} xu)`).join('\n'));

  activeMilestone = {
    user: {
      uniqueId: user.uniqueId,
      nickname: user.nickname,
      avatar: user.avatar || 'https://www.gstatic.com/youtube/img/creator/avatar/default_avatar.svg',
      score: score,
      wins: user.wins || Math.floor(score / 100),
    },
    top5: top5List,
    topDonors: topDonorsList,
    milestone: score,
    title: 'ĐẠI KIỆN TƯỚNG TIẾNG VIỆT',
    duration: duration,
    startedAt: Date.now(),
    ttsText: ttsText,
  };

  io.emit('milestoneCelebration', activeMilestone);

  if (nextRoundTimer) clearTimeout(nextRoundTimer);
  nextRoundTimer = setTimeout(() => {
    endMilestoneAndResetLeaderboard();
  }, duration * 1000);
}

function getLeaderboardList() {
  return Array.from(leaderboard.values())
    .sort((a, b) => b.score - a.score || b.wins - a.wins)
    .slice(0, 10);
}

function getDonorLeaderboardList() {
  return Array.from(donorLeaderboard.values())
    .sort((a, b) => b.diamonds - a.diamonds || b.giftsCount - a.giftsCount)
    .slice(0, 10);
}

function recordGiftDonation(user, giftName, diamonds = 1, repeatCount = 1) {
  resetIdleTimer();
  const count = Math.max(1, Number(repeatCount) || 1);
  const singleValue = Math.max(1, Number(diamonds) || 1);
  const totalDiamonds = singleValue * count;

  const key = user.uniqueId || user.nickname || 'donor_' + Date.now();
  const existing = donorLeaderboard.get(key) || {
    uniqueId: user.uniqueId || key,
    nickname: user.nickname || 'Nhà Hảo Tâm',
    avatar: user.avatar || '',
    diamonds: 0,
    giftsCount: 0,
    lastGiftName: giftName,
    lastGiftTime: Date.now()
  };

  const oldTopDonor = getDonorLeaderboardList()[0];
  const oldTop1Id = oldTopDonor?.uniqueId;

  existing.diamonds += totalDiamonds;
  existing.giftsCount += count;
  existing.lastGiftName = giftName;
  existing.lastGiftTime = Date.now();
  if (user.avatar && !existing.avatar) existing.avatar = user.avatar;
  if (user.nickname && user.nickname !== existing.nickname) existing.nickname = user.nickname;
  donorLeaderboard.set(key, existing);

  const donorList = getDonorLeaderboardList();
  const newTopDonor = donorList[0];

  // 1. Cứ 1 xu tặng quà cộng 500 điểm vào bảng xếp hạng (Tối đa từ quà là 1.900đ)
  const pointsFromGift = totalDiamonds * POINTS_PER_DIAMOND;
  const donorKey = user.uniqueId || key;
  const playerInLeaderboard = leaderboard.get(donorKey) || {
    uniqueId: donorKey,
    nickname: user.nickname || existing.nickname,
    avatar: user.avatar || existing.avatar || '',
    score: 0,
    wins: 0,
    streak: 0,
    maxStreak: 0,
    milestones: [],
  };
  if (!playerInLeaderboard.milestones) playerInLeaderboard.milestones = [];

  const oldScore = playerInLeaderboard.score;
  const newScore = Math.min(MAX_GIFT_SCORE, oldScore + pointsFromGift);
  const actualAddedPoints = Math.max(0, newScore - oldScore);
  playerInLeaderboard.score = newScore;

  if (user.avatar && !playerInLeaderboard.avatar) playerInLeaderboard.avatar = user.avatar;
  if (user.nickname && user.nickname !== playerInLeaderboard.nickname) playerInLeaderboard.nickname = user.nickname;
  leaderboard.set(donorKey, playerInLeaderboard);
  io.emit('leaderboardReset', getLeaderboardList());

  const donorList = getDonorLeaderboardList();
  const newTopDonor = donorList[0];
  const donorRankIndex = donorList.findIndex(d => d.uniqueId === existing.uniqueId);
  const donorRank = donorRankIndex >= 0 ? donorRankIndex + 1 : donorList.length;

  const payload = {
    donor: {
      uniqueId: existing.uniqueId,
      nickname: existing.nickname,
      avatar: existing.avatar || user.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(existing.uniqueId)}`
    },
    giftName,
    diamonds: totalDiamonds,
    repeatCount: count,
    totalDiamonds: existing.diamonds,
    donorRank,
    donorLeaderboard: donorList,
    topDonor: newTopDonor || null,
    giftPoints: actualAddedPoints,
    totalScore: playerInLeaderboard.score,
    ttsText: `Cảm ơn bạn ${existing.nickname} đã tặng ${count > 1 ? count + ' ' : ''}${giftName} ủng hộ kênh!`,
    timestamp: Date.now()
  };

  io.emit('donorUpdate', payload);
  io.emit('giftHonorNotification', payload);

  io.emit('donorScoreAdded', {
    uniqueId: donorKey,
    nickname: playerInLeaderboard.nickname,
    avatar: playerInLeaderboard.avatar,
    giftName,
    diamonds: totalDiamonds,
    giftPoints: actualAddedPoints,
    rawPoints: pointsFromGift,
    totalScore: playerInLeaderboard.score,
    maxGiftScore: MAX_GIFT_SCORE,
    reachCap: playerInLeaderboard.score >= MAX_GIFT_SCORE,
  });

  if (!isCelebratingMilestone) {
    if (totalDiamonds >= 50 || (oldTop1Id !== existing.uniqueId && newTopDonor?.uniqueId === existing.uniqueId && existing.diamonds >= 20)) {
      triggerDonorHonorCelebration(existing, DONOR_HONOR_DURATION);
    }
  }

  return payload;
}

function stripVietnameseAccents(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd');
}

function normalizeAnswer(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[^a-z0-9àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function loadPlayedWords() {
  try {
    if (fs.existsSync(PLAYED_WORDS_FILE)) {
      const data = JSON.parse(fs.readFileSync(PLAYED_WORDS_FILE, 'utf-8'));
      if (Array.isArray(data)) {
        playedWordIds = new Set(data);
        console.log(`[Deck] Đã nạp ${playedWordIds.size}/${wordsData.length} câu đã chơi từ ${PLAYED_WORDS_FILE}`);
      }
    }
  } catch (err) {
    console.error('[Deck] Lỗi đọc file played_words.json:', err.message);
    playedWordIds = new Set();
  }
}

function savePlayedWords() {
  try {
    fs.writeFileSync(PLAYED_WORDS_FILE, JSON.stringify(Array.from(playedWordIds), null, 2), 'utf-8');
  } catch (err) {
    console.error('[Deck] Lỗi lưu file played_words.json:', err.message);
  }
}

function buildDeck() {
  let unplayed = wordsData.filter(w => !playedWordIds.has(w.id));

  if (unplayed.length === 0) {
    console.log(`[Deck] 🎉 ĐÃ CHƠI HẾT TOÀN BỘ ${wordsData.length} CÂU HỎI! Đang làm mới bộ bài...`);
    playedWordIds.clear();
    savePlayedWords();
    unplayed = [...wordsData];
  }

  wordDeck = shuffle(unplayed);
  console.log(`[Deck] Đã xáo bộ bài mới: ${wordDeck.length} câu sẵn sàng (Đã chơi: ${playedWordIds.size}/${wordsData.length})`);
}

// Khởi tạo deck ban đầu
loadPlayedWords();
buildDeck();

function pickNextWord() {
  if (wordDeck.length === 0) {
    buildDeck();
  }

  const picked = wordDeck.pop();
  playedWordIds.add(picked.id);
  savePlayedWords();

  console.log(`[Deck] Rút câu id=${picked.id}: "${picked.word}" (Còn lại trong bộ bài: ${wordDeck.length}/${wordsData.length} câu)`);
  return picked;
}


function pickBossWord() {
  const bossCandidates = wordsData.filter(w => {
    const wordCount = w.word.trim().split(/\s+/).length;
    const isBossCategory = ['Thành Ngữ', 'Tục Ngữ', 'Ca Dao', 'Văn Học', 'Truyền Thuyết'].includes(w.category);
    return wordCount >= 4 || (isBossCategory && w.word.length >= 10);
  });

  let unplayedBoss = bossCandidates.filter(w => !playedWordIds.has(w.id));
  if (unplayedBoss.length === 0) {
    unplayedBoss = bossCandidates;
  }

  const picked = unplayedBoss[Math.floor(Math.random() * unplayedBoss.length)] || pickNextWord();
  playedWordIds.add(picked.id);
  savePlayedWords();

  const deckIdx = wordDeck.findIndex(w => w.id === picked.id);
  if (deckIdx !== -1) wordDeck.splice(deckIdx, 1);

  console.log(`[Boss Deck] ⚔️ Rút CÂU ĐỐ TRÙM id=${picked.id}: "${picked.word}" (${picked.category})`);
  return picked;
}

function loadPack(packId) {
  const pack = AVAILABLE_PACKS.find(p => p.id === packId) || AVAILABLE_PACKS[0];
  currentPackId = pack.id;
  try {
    const pFile = path.resolve(__dirname, pack.file);
    const raw = JSON.parse(fs.readFileSync(pFile, 'utf-8'));
    if (Array.isArray(raw)) {
      wordsData = [...raw];
      pack.totalWords = wordsData.length;
      console.log(`📦 [GÓI CÂU HỎI] Đã nạp "${pack.name}": ${wordsData.length} câu.`);
      buildDeck();
      io.emit('packChanged', {
        currentPackId,
        packName: pack.name,
        totalWords: wordsData.length,
        remainingInDeck: wordDeck.length,
        playedCount: playedWordIds.size,
      });
      return true;
    }
  } catch (e) {
    console.error('[GÓI CÂU HỎI LỖI]', e.message);
  }
  return false;
}

function startTopicVoting() {
  if (gameState.roundState === 'TOPIC_VOTING') return;
  if (isCelebratingMilestone || isCelebratingDonorHonor) return;

  const allCats = [...new Set(wordsData.map(w => w.category))];
  const shuffledCats = shuffle(allCats).slice(0, 3);
  const options = shuffledCats.map((cat, idx) => ({
    id: idx + 1,
    name: cat,
    votes: 0,
    percent: 0,
  }));

  topicVoteState = {
    active: true,
    options,
    votedUsers: new Set(),
    timeLeft: 12,
    duration: 12,
    timer: null,
  };

  gameState.roundState = 'TOPIC_VOTING';
  const ttsText = `Cả phòng hãy cùng bình chọn chủ đề cho câu hỏi tiếp theo! Bình luận 1 cho ${options[0].name}, 2 cho ${options[1].name}, hoặc 3 cho ${options[2].name}! Câu hỏi đặc biệt này sẽ được thưởng 500 điểm!`;
  console.log(`🗳️ [BÌNH CHỌN CHỦ ĐỀ] Bắt đầu 12s bình chọn giữa 3 chủ đề: 1: ${options[0].name} | 2: ${options[1].name} | 3: ${options[2].name}`);

  io.emit('topicVotingStart', {
    options: topicVoteState.options,
    duration: topicVoteState.duration,
    timeLeft: topicVoteState.timeLeft,
    ttsText,
  });

  if (topicVoteState.timer) clearInterval(topicVoteState.timer);
  topicVoteState.timer = setInterval(() => {
    topicVoteState.timeLeft--;
    io.emit('topicVotingTick', {
      timeLeft: topicVoteState.timeLeft,
      options: topicVoteState.options,
    });

    if (topicVoteState.timeLeft <= 0) {
      endTopicVoting();
    }
  }, 1000);
}

function endTopicVoting() {
  if (topicVoteState.timer) {
    clearInterval(topicVoteState.timer);
    topicVoteState.timer = null;
  }
  topicVoteState.active = false;

  const sorted = [...topicVoteState.options].sort((a, b) => b.votes - a.votes);
  const topVotes = sorted[0].votes;
  const topTied = sorted.filter(o => o.votes === topVotes);
  const winner = topTied[Math.floor(Math.random() * topTied.length)];

  nextSpecialCategory = winner.name;
  isSpecial500Round = true;

  const ttsText = `Chủ đề ${winner.name} đã chiến thắng bình chọn với ${winner.votes} phiếu! Xin mời quý vị cùng đến với câu hỏi đặc biệt 500 điểm!`;
  console.log(`🎉 [KẾT QUẢ BÌNH CHỌN] Chủ đề chiến thắng: "${winner.name}" (${winner.votes} phiếu) -> Kích hoạt câu hỏi đặc biệt 500đ!`);

  io.emit('topicVotingEnd', {
    winner,
    options: topicVoteState.options,
    ttsText,
    isSpecial500: true,
  });

  if (nextRoundTimer) clearTimeout(nextRoundTimer);
  nextRoundTimer = setTimeout(() => {
    startNewRound();
  }, 3500);
}

function scheduleNextRound() {
  questionsInVoteCycle++;
  console.log(`📌 Tiến độ chu kỳ bình chọn chủ đề: ${questionsInVoteCycle}/${TOPIC_VOTE_INTERVAL} câu`);
  if (questionsInVoteCycle >= TOPIC_VOTE_INTERVAL) {
    questionsInVoteCycle = 0;
    startTopicVoting();
  } else {
    startNewRound();
  }
}

function startNewRound() {
  if (timerInterval) clearInterval(timerInterval);
  if (nextRoundTimer) {
    clearTimeout(nextRoundTimer);
    nextRoundTimer = null;
  }

  nextRoundIsBoss = false;

  let wordObj;
  if (pendingStreamerWord) {
    wordObj = { ...pendingStreamerWord };
    pendingStreamerWord = null;
    if (wordObj.id) {
      playedWordIds.add(wordObj.id);
      savePlayedWords();
      const deckIdx = wordDeck.findIndex(w => w.id === wordObj.id);
      if (deckIdx !== -1) wordDeck.splice(deckIdx, 1);
    }
    console.log(`[Streamer Pick] 🎯 Phát câu hỏi do Streamer chỉ định: "${wordObj.word}" (${wordObj.category})`);
  } else if (isSpecial500Round && nextSpecialCategory) {
    const candidates = wordDeck.filter(w => w.category === nextSpecialCategory);
    if (candidates.length > 0) {
      wordObj = candidates[Math.floor(Math.random() * candidates.length)];
      const idx = wordDeck.findIndex(w => w.id === wordObj.id);
      if (idx !== -1) wordDeck.splice(idx, 1);
      playedWordIds.add(wordObj.id);
      savePlayedWords();
    } else {
      wordObj = pickNextWord();
    }
    console.log(`🌟 [CÂU HỎI ĐẶC BIỆT 500Đ] Rút câu theo chủ đề bình chọn "${wordObj.category}": "${wordObj.word}"`);
  } else {
    wordObj = pickNextWord();
  }
  const rawChars = wordObj.word.split('');

  const nonSpaces = rawChars.filter(c => c !== ' ');
  let scrambled = shuffle(nonSpaces);

  if (scrambled.join('') === nonSpaces.join('') && scrambled.length > 1) {
    scrambled.reverse();
  }

  const mask = rawChars.map(c => c === ' ');

  gameState.round++;
  gameState.isBossRound = false;
  gameState.currentWord = wordObj;
  gameState.scrambledLetters = scrambled;
  gameState.revealedMask = mask;
  gameState.roundTimeTotal = ROUND_TIME_DEFAULT;
  gameState.timeLeft = gameState.roundTimeTotal;
  gameState.roundState = 'PLAYING';
  gameState.roundStartTime = Date.now();

  if (isSpecial500Round) {
    gameState.isSpecial500 = true;
    gameState.pointsReward = 500;
  } else {
    gameState.isSpecial500 = false;
    gameState.pointsReward = 100;
  }
  isSpecial500Round = false;
  nextSpecialCategory = null;

  console.log(`\n[Vòng ${gameState.round}] ${gameState.isSpecial500 ? '🌟 CÂU HỎI ĐẶC BIỆT 500Đ 🌟 | ' : ''}Từ cần đoán: "${wordObj.word}" (Chủ đề: ${wordObj.category})`);

  let ttsText = '';
  if (gameState.isSpecial500) {
    ttsText = `Vòng ${gameState.round}. Câu hỏi đặc biệt 500 điểm! Chủ đề: ${wordObj.category}. Gợi ý là: ${wordObj.hint}`;
  } else {
    ttsText = `Vòng ${gameState.round}. Chủ đề ${wordObj.category}. Gợi ý: ${wordObj.hint}`;
  }

  const roundPayload = {
    ...getClientGameState(),
    ttsText,
  };

  io.emit('roundStart', roundPayload);
  resetIdleTimer();

  timerInterval = setInterval(() => {
    if (gameState.roundState !== 'PLAYING') return;

    gameState.timeLeft--;
    idleSecondsCount++;

    if (idleSecondsCount >= IDLE_TIMEOUT_SECONDS) {
      triggerIdleReminder();
      idleSecondsCount = 0;
    }

    io.emit('timerTick', { timeLeft: gameState.timeLeft });

    if (gameState.timeLeft <= 0) {
      handleTimeout();
    }
  }, 1000);
}

function handleTimeout() {
  gameState.roundState = 'TIMEOUT';
  if (timerInterval) clearInterval(timerInterval);

  if (currentStreakWinner) {
    console.log(`❄️ Chuỗi thắng của ${currentStreakWinner.nickname} (${currentStreakWinner.count} câu) đã bị đứt do hết giờ!`);
    currentStreakWinner = null;
    for (const u of leaderboard.values()) {
      u.streak = 0;
    }
    io.emit('streakUpdate', null);
  }

  console.log(`[Hết giờ] Đáp án là: "${gameState.currentWord?.word}"`);
  gameState.revealedMask = gameState.currentWord.word.split('').map(() => true);

  const ttsText = `Hết giờ! Đáp án chính xác là: ${gameState.currentWord?.word}.`;

  io.emit('roundTimeout', {
    word: gameState.currentWord.word,
    hint: gameState.currentWord.hint,
    ttsText,
  });

  if (nextRoundTimer) clearTimeout(nextRoundTimer);
  nextRoundTimer = setTimeout(() => {
    scheduleNextRound();
  }, 5000);
}

function checkGuess(user, text, msgTime = null) {
  if (!text) return;
  gameState.totalCommentsReceived++;
  resetIdleTimer();

  // Xử lý bình chọn chủ đề (1, 2, 3)
  if (gameState.roundState === 'TOPIC_VOTING' && topicVoteState.active) {
    const raw = String(text || '').trim();
    let chosenId = null;
    if (raw === '1' || raw.startsWith('1 ') || raw === '11' || raw.toLowerCase().includes('chon 1')) chosenId = 1;
    else if (raw === '2' || raw.startsWith('2 ') || raw === '22' || raw.toLowerCase().includes('chon 2')) chosenId = 2;
    else if (raw === '3' || raw.startsWith('3 ') || raw === '33' || raw.toLowerCase().includes('chon 3')) chosenId = 3;

    if (chosenId) {
      const userKey = user.uniqueId || user.nickname;
      if (!topicVoteState.votedUsers.has(userKey)) {
        topicVoteState.votedUsers.add(userKey);
        const opt = topicVoteState.options.find(o => o.id === chosenId);
        if (opt) {
          opt.votes++;
          const totalVotes = topicVoteState.options.reduce((sum, o) => sum + o.votes, 0);
          topicVoteState.options.forEach(o => {
            o.percent = totalVotes > 0 ? Math.round((o.votes / totalVotes) * 100) : 0;
          });
          io.emit('topicVoteUpdate', { options: topicVoteState.options, totalVotes, user: user.nickname, vote: chosenId });
          console.log(`🗳️ [VOTE] ${user.nickname} bình chọn chủ đề ${chosenId}: ${opt.name} (Tổng phiếu: ${opt.votes})`);
        }
      }
    }
    return;
  }

  if (gameState.roundState !== 'PLAYING' || !gameState.currentWord) return;

  // Nếu bình luận là của vòng cũ (gửi trước khi vòng này bắt đầu > 2s) thì bỏ qua không chấm điểm
  if (msgTime && gameState.roundStartTime && (msgTime < gameState.roundStartTime - 2000)) {
    return;
  }

  const target = gameState.currentWord.word;
  const normTarget = normalizeAnswer(target);
  const normGuess = normalizeAnswer(text);

  const rawTargetStrip = stripVietnameseAccents(normTarget);
  const rawGuessStrip = stripVietnameseAccents(normGuess);

  // 1. So khớp chính xác
  const isExact = (normGuess === normTarget);
  const isUnaccentedExact = (rawGuessStrip === rawTargetStrip && rawGuessStrip.length >= 2);

  // 2. So khớp linh hoạt (khi khán giả gõ thêm chữ phụ)
  const isContainedAccented = normTarget.length >= 3 && normGuess.includes(normTarget);
  const isContainedUnaccented = rawTargetStrip.length >= 3 && rawGuessStrip.includes(rawTargetStrip);

  const isCorrect = isExact || isUnaccentedExact || isContainedAccented || isContainedUnaccented;

  console.log(`[YouTube Chat] ${user.nickname}: "${text}" => ${isCorrect ? '🎯 ĐÚNG RỒI!' : 'Chưa đúng'}`);

  const guessItem = {
    uniqueId: user.uniqueId,
    nickname: user.nickname || 'Khán Giả',
    avatar: user.avatar || '',
    comment: text,
    isCorrect,
    time: Date.now(),
  };
  recentGuesses.unshift(guessItem);
  if (recentGuesses.length > 20) recentGuesses.pop();
  io.emit('newGuess', guessItem);

  if (isCorrect) {
    gameState.roundState = 'WON';
    if (timerInterval) clearInterval(timerInterval);

    gameState.revealedMask = target.split('').map(() => true);

    // Xử lý Chuỗi Thắng Liên Tiếp (Combo Win Streak & Flame)
    let streakCount = 1;
    if (currentStreakWinner && currentStreakWinner.uniqueId === user.uniqueId) {
      streakCount = currentStreakWinner.count + 1;
    }

    let basePoints = gameState.pointsReward || 100;
    let multiplier = 1.0;
    let streakBadge = '';
    let streakTitle = '';
    let flameLevel = 'none';

    if (streakCount >= 5) {
      multiplier = 2.0;
      streakBadge = '⚡';
      streakTitle = 'BẤT BẠI';
      flameLevel = 'godlike';
    } else if (streakCount >= 3) {
      multiplier = 1.5;
      streakBadge = '🔥🔥';
      streakTitle = 'BỐC CHÁY';
      flameLevel = 'blazing';
    } else if (streakCount === 2) {
      multiplier = 1.2;
      streakBadge = '🔥';
      streakTitle = 'CHUỖI NÓNG';
      flameLevel = 'hot';
    }

    const effectiveMultiplier = multiplier;
    const totalPoints = Math.round(basePoints * effectiveMultiplier);
    const bonusPoints = totalPoints - basePoints;

    for (const [k, u] of leaderboard.entries()) {
      if (k !== user.uniqueId) {
        u.streak = 0;
      }
    }

    const key = user.uniqueId;
    const existing = leaderboard.get(key) || {
      uniqueId: user.uniqueId,
      nickname: user.nickname || 'Khán Giả',
      avatar: user.avatar || '',
      score: 0,
      wins: 0,
      streak: 0,
      maxStreak: 0,
      milestones: [],
    };
    if (!existing.milestones) existing.milestones = [];
    existing.score += totalPoints;
    existing.wins += 1;
    existing.streak = streakCount;
    existing.maxStreak = Math.max(existing.maxStreak || 0, streakCount);
    if (user.nickname && user.nickname !== existing.nickname) existing.nickname = user.nickname;
    if (user.avatar && !existing.avatar) existing.avatar = user.avatar;
    leaderboard.set(key, existing);

    currentStreakWinner = {
      uniqueId: user.uniqueId,
      nickname: existing.nickname,
      avatar: existing.avatar,
      count: streakCount,
      multiplier: effectiveMultiplier,
      basePoints,
      bonusPoints,
      totalPoints,
      streakBadge,
      streakTitle,
      flameLevel,
    };

    gameState.lastWinner = {
      uniqueId: user.uniqueId,
      nickname: existing.nickname,
      avatar: existing.avatar,
      points: totalPoints,
      basePoints,
      bonusPoints,
      multiplier: effectiveMultiplier,
      streakCount,
      streakBadge,
      streakTitle,
      flameLevel,
      isBossRound: false,
      word: target,
    };

    console.log(`🏆 CHIẾN THẮNG: ${existing.nickname} (+${totalPoints}đ${streakCount >= 2 ? ` [Combo x${streakCount} ${streakBadge} ${streakTitle}]` : ''}, Tổng: ${existing.score}đ)`);

    const winnerName = existing.nickname;
    let ttsText = '';
    if (basePoints >= 500) {
      ttsText = `Tuyệt đỉnh! ${winnerName} đã xuất sắc đoán đúng câu hỏi đặc biệt bình chọn và nhận ngay ${totalPoints} điểm!`;
    } else if (streakCount >= 5) {
      ttsText = `Thần tốc bất bại! ${winnerName} đã lập kỷ lục chuỗi ${streakCount} câu thắng liên tiếp, nhân đôi điểm số lên ${totalPoints} điểm!`;
    } else if (streakCount >= 3) {
      ttsText = `Quá bốc lửa! ${winnerName} đạt chuỗi ${streakCount} câu thắng liên tiếp, nhận ${totalPoints} điểm!`;
    } else if (streakCount === 2) {
      ttsText = `Tuyệt vời! ${winnerName} mở chuỗi 2 câu thắng liên tiếp, nhận thêm điểm thưởng lên ${totalPoints} điểm!`;
    } else {
      ttsText = `Chúc mừng ${winnerName} đã xuất sắc đoán đúng đáp án: ${target}!`;
    }

    io.emit('roundWon', {
      winner: gameState.lastWinner,
      word: target,
      leaderboard: getLeaderboardList(),
      ttsText,
      streak: currentStreakWinner,
      isBossRound: false,
    });
    io.emit('streakUpdate', currentStreakWinner);

    const reachedMilestone = existing.score >= MILESTONE_SCORE && !existing.milestones.includes(MILESTONE_SCORE);
    if (reachedMilestone) {
      existing.milestones.push(MILESTONE_SCORE);
      console.log(`🎉 [MỐC ĐẶC BIỆT] ${existing.nickname} ĐẠT ${existing.score} ĐIỂM -> BẮT ĐẦU VINH DANH ${MILESTONE_DURATION} GIÂY!`);

      if (nextRoundTimer) clearTimeout(nextRoundTimer);
      nextRoundTimer = setTimeout(() => {
        triggerMilestoneCelebration(existing, MILESTONE_SCORE, MILESTONE_DURATION);
      }, 3500);
    } else {
      if (nextRoundTimer) clearTimeout(nextRoundTimer);
      nextRoundTimer = setTimeout(() => {
        scheduleNextRound();
      }, 5000);
    }
  }
}

// Cấu hình tính năng Tặng quà mở chữ cái gợi ý (Interactive Gift Hint)
const giftHintConfig = {
  enabled: true,             // Bật/tắt mở chữ bằng quà
  minDiamonds: 1,            // Tối thiểu 1 xu (ví dụ: Hoa Hồng 🌹)
  keepLastLettersSecret: 1,  // Luôn giữ bí mật ít nhất 1 chữ cái cuối cùng
};
let lastGiftHintEvent = null;

function getHiddenLettersCount() {
  if (!gameState.currentWord || !gameState.revealedMask) return 0;
  const rawChars = gameState.currentWord.word.split('');
  let count = 0;
  rawChars.forEach((ch, idx) => {
    if (ch !== ' ' && !gameState.revealedMask[idx]) {
      count++;
    }
  });
  return count;
}

function revealOneHint(donor = null, giftName = '', force = false, skipTts = false) {
  if (gameState.roundState !== 'PLAYING' || !gameState.currentWord) return null;

  const rawChars = gameState.currentWord.word.split('');
  const unrevealedIndices = [];

  rawChars.forEach((ch, idx) => {
    if (ch !== ' ' && !gameState.revealedMask[idx]) {
      unrevealedIndices.push(idx);
    }
  });

  if (unrevealedIndices.length === 0) return null;

  if (!force && unrevealedIndices.length <= giftHintConfig.keepLastLettersSecret) {
    const notifyPayload = {
      message: `Đã mở tối đa gợi ý! Chỉ còn ${unrevealedIndices.length} chữ cái bí mật, hãy nhanh tay đoán từ khóa!`,
      donor: donor ? (donor.nickname || donor.user || donor.uniqueId) : null,
      giftName: giftName || 'Quà Tặng',
      remainingHidden: unrevealedIndices.length,
      limitReached: true,
      ttsText: skipTts ? '' : 'Đã mở tối đa gợi ý! Chỉ còn đúng một chữ cái bí mật cuối cùng, ai sẽ là Vua Tiếng Việt?'
    };
    console.log(`⚠️ [GIFT HINT] Đã chạm giới hạn giữ chữ bí mật (${unrevealedIndices.length} chữ còn lại)`);
    io.emit('giftHintLimitReached', notifyPayload);
    return notifyPayload;
  }

  const pickIdx = unrevealedIndices[Math.floor(Math.random() * unrevealedIndices.length)];
  gameState.revealedMask[pickIdx] = true;

  const remainingHidden = unrevealedIndices.length - 1;
  const canRevealMore = remainingHidden > giftHintConfig.keepLastLettersSecret;

  const donorInfo = donor ? {
    uniqueId: donor.uniqueId || 'donor_' + Date.now(),
    nickname: donor.nickname || donor.user || 'Khán Giả',
    avatar: donor.avatar || 'https://p16-sign-va.tiktokcdn.com/tos-maliva-avt-0068/default-avatar.jpeg',
    giftName: giftName || 'Hoa Hồng',
    diamonds: donor.diamonds || 1,
  } : null;

  let ttsText = '';
  if (!skipTts && donorInfo && donorInfo.nickname !== 'Streamer') {
    if (donorInfo.nickname.includes('Rương') || giftName.includes('Rương') || giftName.includes('Thả Tim')) {
      ttsText = `Cảm ơn mọi người đã cùng nhau thả tim để mở chữ cái ${rawChars[pickIdx]}!`;
    } else {
      ttsText = `Cảm ơn ${donorInfo.nickname} đã tặng ${donorInfo.giftName} mở chữ cái ${rawChars[pickIdx]}!`;
    }
  }

  const payload = {
    index: pickIdx,
    letter: rawChars[pickIdx],
    revealedMask: gameState.revealedMask,
    donor: donorInfo,
    isGiftTriggered: !!donorInfo && donorInfo.nickname !== 'Streamer' && !giftName?.includes('Follow') && !giftName?.includes('Rương'),
    giftName: giftName || (donorInfo ? donorInfo.giftName : ''),
    remainingHidden,
    canRevealMore,
    ttsText,
    timestamp: Date.now(),
  };

  if (payload.isGiftTriggered) {
    lastGiftHintEvent = payload;
  }

  console.log(`💡 [MỞ CHỮ GỢI Ý] Vị trí ${pickIdx}: "${rawChars[pickIdx]}" bởi ${donorInfo?.nickname || 'MC'} (Còn ${remainingHidden} chữ ẩn)`);
  io.emit('hintRevealed', payload);
  return payload;
}

function revealGiftHints(donor = null, giftName = '', diamonds = 1, force = false) {
  if (gameState.roundState !== 'PLAYING' || !gameState.currentWord) return null;

  const totalCoins = Math.max(1, Number(diamonds) || 1);
  const rawChars = gameState.currentWord.word.split('');
  const donorInfo = donor ? {
    uniqueId: donor.uniqueId || 'donor_' + Date.now(),
    nickname: donor.nickname || donor.user || 'Khán Giả',
    avatar: donor.avatar || 'https://www.gstatic.com/youtube/img/creator/avatar/default_avatar.svg',
    giftName: giftName || 'Hoa Hồng',
    diamonds: totalCoins,
  } : null;

  const revealedItems = [];
  let reachedLimit = false;

  for (let step = 0; step < totalCoins; step++) {
    const unrevealedIndices = [];
    rawChars.forEach((ch, idx) => {
      if (ch !== ' ' && !gameState.revealedMask[idx]) {
        unrevealedIndices.push(idx);
      }
    });

    if (unrevealedIndices.length === 0) {
      break;
    }

    if (!force && unrevealedIndices.length <= giftHintConfig.keepLastLettersSecret) {
      reachedLimit = true;
      break;
    }

    const pickIdx = unrevealedIndices[Math.floor(Math.random() * unrevealedIndices.length)];
    gameState.revealedMask[pickIdx] = true;
    revealedItems.push({
      index: pickIdx,
      letter: rawChars[pickIdx],
    });
  }

  const remainingHidden = getHiddenLettersCount();
  const canRevealMore = remainingHidden > giftHintConfig.keepLastLettersSecret;

  if (revealedItems.length === 0) {
    if (reachedLimit) {
      const notifyPayload = {
        message: `Đã mở tối đa gợi ý! Chỉ còn ${remainingHidden} chữ cái bí mật, hãy nhanh tay đoán từ khóa!`,
        donor: donorInfo ? donorInfo.nickname : null,
        giftName: giftName || 'Quà Tặng',
        remainingHidden,
        limitReached: true,
        ttsText: donorInfo ? `Cảm ơn ${donorInfo.nickname} đã tặng ${donorInfo.giftName}! Hiện đã mở tối đa gợi ý, còn đúng ${remainingHidden} chữ cái bí mật cuối cùng!` : 'Đã mở tối đa gợi ý!'
      };
      console.log(`⚠️ [GIFT HINT] Đã chạm giới hạn giữ chữ bí mật (${remainingHidden} chữ còn lại)`);
      io.emit('giftHintLimitReached', notifyPayload);
      return notifyPayload;
    }
    return null;
  }

  let ttsText = '';
  const lettersJoined = revealedItems.map(item => item.letter).join(', ');
  if (donorInfo && donorInfo.nickname !== 'Streamer') {
    if (revealedItems.length === 1) {
      ttsText = `Cảm ơn ${donorInfo.nickname} đã tặng ${donorInfo.giftName} mở chữ cái ${lettersJoined}!`;
    } else {
      ttsText = `Cảm ơn ${donorInfo.nickname} đã tặng ${donorInfo.giftName} mở tặng ${revealedItems.length} chữ cái: ${lettersJoined}!`;
    }
    if (reachedLimit) {
      ttsText += ` Đã mở tối đa gợi ý, chỉ còn chữ cái bí mật cuối cùng!`;
    }
  }

  revealedItems.forEach((item, idx) => {
    const isLast = (idx === revealedItems.length - 1);
    io.emit('hintRevealed', {
      index: item.index,
      letter: item.letter,
      revealedMask: gameState.revealedMask,
      donor: donorInfo,
      isGiftTriggered: true,
      skipPopup: !isLast,
      giftName: giftName || (donorInfo ? donorInfo.giftName : ''),
      revealedCount: revealedItems.length,
      lettersList: revealedItems.map(r => r.letter),
      lettersText: lettersJoined,
      remainingHidden,
      canRevealMore,
      ttsText: isLast ? ttsText : '',
      timestamp: Date.now(),
    });
  });

  const summaryPayload = {
    indices: revealedItems.map(r => r.index),
    letter: lettersJoined,
    lettersList: revealedItems.map(r => r.letter),
    revealedCount: revealedItems.length,
    revealedMask: gameState.revealedMask,
    donor: donorInfo,
    isGiftTriggered: true,
    giftName: giftName || (donorInfo ? donorInfo.giftName : ''),
    remainingHidden,
    canRevealMore,
    limitReached: reachedLimit,
    ttsText,
    timestamp: Date.now(),
  };

  lastGiftHintEvent = summaryPayload;
  console.log(`💡 [GIFT HINT] ${donorInfo?.nickname} tặng ${giftName} (${totalCoins} xu) mở ${revealedItems.length} chữ: [${lettersJoined}] (Còn ${remainingHidden} chữ ẩn)`);

  return summaryPayload;
}

function addTime(seconds, reason = '') {
  if (gameState.roundState !== 'PLAYING') return;
  gameState.timeLeft += seconds;
  io.emit('timeAdded', { seconds, timeLeft: gameState.timeLeft, reason });
}

function getClientGameState() {
  const hiddenCount = getHiddenLettersCount();
  return {
    round: gameState.round,
    category: gameState.currentWord?.category || '',
    hint: gameState.currentWord?.hint || '',
    wordLength: gameState.currentWord?.word ? gameState.currentWord.word.length : 0,
    targetPattern: (gameState.currentWord?.word || '').split('').map((c, i) => {
      if (c === ' ') return ' ';
      return gameState.revealedMask[i] ? c : '_';
    }),
    scrambledLetters: gameState.scrambledLetters,
    timeLeft: gameState.timeLeft,
    roundState: gameState.roundState,
    connectedChannel: gameState.connectedChannel,
    tiktokConnected: gameState.tiktokConnected,
    tiktokConnecting: gameState.tiktokConnecting,
    tiktokStatusType: gameState.tiktokStatusType,
    tiktokStatusMsg: gameState.tiktokStatusMsg,
    totalLikes: gameState.totalLikes,
    totalCommentsReceived: gameState.totalCommentsReceived,
    leaderboard: getLeaderboardList(),
    donorLeaderboard: getDonorLeaderboardList(),
    topDonor: getDonorLeaderboardList()[0] || null,
    recentGuesses,
    lastWinner: gameState.lastWinner,
    ttsEnabled: gameState.ttsEnabled,
    playedWordsCount: playedWordIds.size,
    totalWordsCount: wordsData.length,
    remainingInDeck: wordDeck.length,
    isCelebratingMilestone,
    activeMilestone: activeMilestone ? {
      ...activeMilestone,
      duration: Math.max(1, Math.round(activeMilestone.duration - (Date.now() - activeMilestone.startedAt) / 1000)),
    } : null,
    isCelebratingDonorHonor,
    activeDonorHonor: activeDonorHonor ? {
      ...activeDonorHonor,
      duration: Math.max(1, Math.round(activeDonorHonor.duration - (Date.now() - activeDonorHonor.startedAt) / 1000)),
    } : null,
    lastFollow: (lastFollowEvent && (Date.now() - lastFollowEvent.timestamp < 7000)) ? lastFollowEvent : null,
    lastGiftHint: (lastGiftHintEvent && (Date.now() - lastGiftHintEvent.timestamp < 6000)) ? lastGiftHintEvent : null,
    giftHintConfig: { ...giftHintConfig },
    remainingHiddenLetters: hiddenCount,
    canRevealMore: hiddenCount > giftHintConfig.keepLastLettersSecret,
    currentStreak: currentStreakWinner,
    isBossRound: false,
    bossMultiplier: 1,
    roundTimeTotal: gameState.roundTimeTotal || ROUND_TIME_DEFAULT,
    isSpecial500: !!gameState.isSpecial500,
    pointsReward: gameState.pointsReward || 100,
    questionsInVoteCycle: questionsInVoteCycle,
    topicVoteInterval: TOPIC_VOTE_INTERVAL,
    topicVoteState: topicVoteState.active ? {
      options: topicVoteState.options,
      timeLeft: topicVoteState.timeLeft,
      duration: topicVoteState.duration,
    } : null,
    currentPackId,
    currentPackName: AVAILABLE_PACKS.find(p => p.id === currentPackId)?.name || 'Gói Hiện Tại',
    availablePacks: AVAILABLE_PACKS.map(p => ({ id: p.id, name: p.name, totalWords: p.totalWords })),
    nextRoundIsBoss: false,
    pendingStreamerWord: pendingStreamerWord ? {
      id: pendingStreamerWord.id,
      word: pendingStreamerWord.word,
      category: pendingStreamerWord.category,
      hint: pendingStreamerWord.hint,
    } : null,
  };
}

// -------------------------------------------------------------
// YouTube Live Connection Handling
// -------------------------------------------------------------
function extractYouTubeId(urlOrId) {
  if (!urlOrId) return '';
  const str = String(urlOrId).trim();
  const match = str.match(/(?:live\/|v\/|video\/|watch\?v=|youtu\.be\/|\/v=|^)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : str;
}

function scheduleReconnect(delay = 10000) {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    connectYouTubeLive(YOUTUBE_LIVE_ID);
  }, delay);
}

async function connectYouTubeLive(rawInput) {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  const cleanId = extractYouTubeId(rawInput || YOUTUBE_LIVE_ID);
  if (!cleanId) {
    gameState.tiktokStatusType = 'unconfigured';
    gameState.tiktokStatusMsg = 'Chưa thiết lập YouTube Live ID';
    io.emit('tiktokStatus', { connected: false, connecting: false, statusType: 'unconfigured', channel: '', msg: gameState.tiktokStatusMsg });
    return;
  }

  YOUTUBE_LIVE_ID = cleanId;
  gameState.connectedChannel = `YouTube ID: ${cleanId}`;
  gameState.tiktokConnecting = true;
  gameState.tiktokStatusType = 'connecting';
  gameState.tiktokStatusMsg = `Đang kết nối tới YouTube Live (${cleanId})...`;

  if (liveChat) {
    try {
      liveChat.stop();
    } catch (_) {}
    liveChat = null;
  }

  io.emit('tiktokStatus', {
    connected: false,
    connecting: true,
    statusType: 'connecting',
    channel: gameState.connectedChannel,
    msg: gameState.tiktokStatusMsg,
  });

  console.log(`[YouTube Live] Đang lắng nghe luồng Live ID: ${cleanId}...`);

  try {
    liveChat = new LiveChat({ liveId: cleanId });

    liveChat.on('start', (liveId) => {
      gameState.tiktokConnected = true;
      gameState.tiktokConnecting = false;
      gameState.tiktokStatusType = 'connected';
      gameState.tiktokStatusMsg = `Đã kết nối YouTube Live Chat (ID: ${cleanId})`;
      console.log(`[YouTube Live] ✅ KẾT NỐI THÀNH CÔNG luồng ID: ${cleanId}! Đang lắng nghe bình luận.`);
      io.emit('tiktokStatus', {
        connected: true,
        connecting: false,
        statusType: 'connected',
        channel: gameState.connectedChannel,
        roomId: cleanId,
        msg: gameState.tiktokStatusMsg,
      });
    });

    liveChat.on('chat', (chatItem) => {
      const messageText = (chatItem.message || []).map(m => m.text || '').join('').trim();
      if (!messageText) return;

      const msgTime = chatItem.timestamp ? chatItem.timestamp.getTime() : Date.now();
      const msgId = chatItem.id || `${chatItem.author?.channelId}_${msgTime}_${messageText}`;

      // 1. Chống trùng lặp tin nhắn (YouTube Live API thường trả lại danh sách tin gần đây mỗi lần poll)
      if (seenMessageIds.has(msgId)) {
        return;
      }
      seenMessageIds.add(msgId);
      if (seenMessageIds.size > 2000) {
        const oldest = seenMessageIds.values().next().value;
        seenMessageIds.delete(oldest);
      }

      // 2. Bỏ qua tin nhắn lịch sử gửi từ trước khi kết nối bot > 10 giây
      if (msgTime < serverStartTime - 10000) {
        return;
      }

      const user = {
        uniqueId: chatItem.author?.channelId || 'yt_' + Date.now(),
        nickname: chatItem.author?.name || 'Khán Giả YouTube',
        avatar: chatItem.author?.thumbnail?.url || 'https://www.gstatic.com/youtube/img/creator/avatar/default_avatar.svg',
      };

      checkGuess(user, messageText, msgTime);

      if (chatItem.superchat) {
        const amount = chatItem.superchat.amount || 'SuperChat';
        console.log(`[YouTube SuperChat] ${user.nickname} gửi ${amount}`);
        recordGiftDonation(user, `Super Chat (${amount})`, 10, 1);
        if (giftHintConfig.enabled) {
          revealGiftHints(user, `Super Chat (${amount})`, 10, false);
        }
        addTime(30, `${user.nickname} tặng Super Chat (+30s)`);
      }
    });

    liveChat.on('end', (reason) => {
      gameState.tiktokConnected = false;
      gameState.tiktokConnecting = false;
      gameState.tiktokStatusType = 'offline';
      gameState.tiktokStatusMsg = `Luồng Live đã kết thúc (${reason || 'End'}).`;
      console.log(`[YouTube Live] Luồng Live đã kết thúc.`);
      io.emit('tiktokStatus', {
        connected: false,
        connecting: false,
        statusType: 'offline',
        channel: gameState.connectedChannel,
        msg: gameState.tiktokStatusMsg,
      });
      scheduleReconnect(10000);
    });

    liveChat.on('error', (err) => {
      const errMsg = err?.message || String(err);
      console.warn(`[YouTube Live Warning]`, errMsg);
      gameState.tiktokStatusMsg = `Lỗi kết nối YouTube: ${errMsg}`;
      io.emit('tiktokStatus', {
        connected: false,
        connecting: false,
        statusType: 'offline',
        channel: gameState.connectedChannel,
        msg: gameState.tiktokStatusMsg,
      });
      scheduleReconnect(10000);
    });

    const ok = await liveChat.start();
    if (!ok) {
      console.warn(`[YouTube Live] Không thể bắt đầu lấy chat cho ID: ${cleanId}`);
      scheduleReconnect(10000);
    }
  } catch (err) {
    gameState.tiktokConnected = false;
    gameState.tiktokConnecting = false;
    gameState.tiktokStatusMsg = `Lỗi: ${err.message}`;
    console.error(`[YouTube Live Error]`, err.message);
    scheduleReconnect(10000);
  }
}

// -------------------------------------------------------------
// Admin & Control Endpoints
// -------------------------------------------------------------
app.get('/api/state', (req, res) => {
  res.json({
    ok: true,
    state: getClientGameState(),
    actualWord: gameState.currentWord?.word,
  });
});

app.get('/api/words/categories', (req, res) => {
  const scope = (req.query.scope || req.query.packId || 'all').trim();
  let source = allWordsMaster;
  if (scope === 'current') {
    source = wordsData;
  } else if (scope !== 'all') {
    source = allWordsMaster.filter(w => w.packId === scope);
  }
  const cats = Array.from(new Set(source.map(w => w.category).filter(Boolean))).sort();
  res.json({ ok: true, categories: cats, totalCategories: cats.length, totalWords: source.length });
});

app.get('/api/words/search', (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase();
  const category = (req.query.category || '').trim();
  const packId = (req.query.packId || req.query.scope || 'all').trim();
  const limit = Math.min(Number(req.query.limit) || 40, 100);

  let source = allWordsMaster;
  if (packId === 'current') {
    source = wordsData.map(w => ({
      ...w,
      packId: currentPackId,
      packName: AVAILABLE_PACKS.find(p => p.id === currentPackId)?.name || 'Gói Hiện Tại'
    }));
  } else if (packId !== 'all') {
    source = allWordsMaster.filter(w => w.packId === packId);
  }

  let filtered = source;
  if (category && category !== 'all') {
    filtered = filtered.filter(w => (w.category || '').toLowerCase() === category.toLowerCase());
  }
  if (q) {
    filtered = filtered.filter(w =>
      String(w.id) === q ||
      (w.word || '').toLowerCase().includes(q) ||
      (w.hint || '').toLowerCase().includes(q)
    );
  }
  res.json({
    ok: true,
    total: filtered.length,
    masterTotal: allWordsMaster.length,
    currentPackId,
    words: filtered.slice(0, limit).map(w => ({
      id: w.id,
      word: w.word,
      category: w.category,
      hint: w.hint,
      packId: w.packId || currentPackId,
      packName: w.packName || AVAILABLE_PACKS.find(p => p.id === (w.packId || currentPackId))?.name || 'Gói Hiện Tại'
    }))
  });
});

app.post('/admin/api', (req, res) => {
  const { action, text, user, seconds, channel, liveId } = req.body || {};

  if (action === 'setNextWord' || action === 'playWordNow') {
    let targetWord = null;
    if (req.body.wordId !== undefined && req.body.wordId !== null && req.body.wordId !== '') {
      targetWord = findWordById(req.body.wordId, req.body.packId);
    } else if (req.body.word) {
      const cleanWord = String(req.body.word).trim().toUpperCase();
      if (!cleanWord) {
        return res.status(400).json({ ok: false, message: 'Từ khóa không được để trống!' });
      }
      targetWord = {
        id: req.body.id || ('C' + Date.now().toString().slice(-6)),
        word: cleanWord,
        category: String(req.body.category || 'Tự Chọn').trim(),
        hint: String(req.body.hint || 'Câu đố do Streamer tạo').trim(),
        packId: 'custom',
        packName: '✍️ Tự Streamer Nhập',
      };
    }

    if (!targetWord || !targetWord.word) {
      return res.status(400).json({ ok: false, message: 'Không tìm thấy câu hỏi hợp lệ!' });
    }

    if (req.body.isBoss !== undefined) {
      targetWord.isBoss = Boolean(req.body.isBoss);
    }

    pendingStreamerWord = targetWord;
    if (targetWord.isBoss) {
      nextRoundIsBoss = true;
    }

    if (action === 'playWordNow') {
      if (timerInterval) clearInterval(timerInterval);
      if (nextRoundTimer) {
        clearTimeout(nextRoundTimer);
        nextRoundTimer = null;
      }
      isCelebratingMilestone = false;
      activeMilestone = null;
      isCelebratingDonorHonor = false;
      activeDonorHonor = null;
      io.emit('milestoneEnd');
      io.emit('donorHonorEnd');
      io.emit('topicVotingEnd');
      startNewRound();
      io.emit('gameState', getClientGameState());
      return res.json({
        ok: true,
        word: targetWord,
        message: `Đã phát câu hỏi ngay lập tức: "${targetWord.word}" (${targetWord.category})!`
      });
    } else {
      io.emit('gameState', getClientGameState());
      return res.json({
        ok: true,
        word: targetWord,
        message: `Đã xếp câu hỏi "${targetWord.word}" (${targetWord.category}) vào vòng kế tiếp!`
      });
    }
  }

  if (action === 'playPendingWordNow') {
    if (!pendingStreamerWord) {
      return res.status(400).json({ ok: false, message: 'Hiện chưa có câu hỏi nào được đặt trước!' });
    }
    if (timerInterval) clearInterval(timerInterval);
    if (nextRoundTimer) {
      clearTimeout(nextRoundTimer);
      nextRoundTimer = null;
    }
    isCelebratingMilestone = false;
    activeMilestone = null;
    isCelebratingDonorHonor = false;
    activeDonorHonor = null;
    io.emit('milestoneEnd');
    io.emit('donorHonorEnd');
    io.emit('topicVotingEnd');
    const playedWord = { ...pendingStreamerWord };
    startNewRound();
    io.emit('gameState', getClientGameState());
    return res.json({ ok: true, word: playedWord, message: `Đã phát câu hỏi đặt trước ngay lập tức: "${playedWord.word}"!` });
  }

  if (action === 'clearPendingWord') {
    pendingStreamerWord = null;
    io.emit('gameState', getClientGameState());
    return res.json({ ok: true, message: 'Đã hủy câu hỏi chờ phát của Streamer.' });
  }

  if (action === 'triggerBossRound' || action === 'setNextBossRound' || action === 'startBossRoundNow') {
    return res.json({ ok: false, message: 'Tính năng Câu Đố Trùm đã được tắt theo yêu cầu.' });
  }

  if (action === 'skip' || action === 'skipMilestone') {
    if (isCelebratingMilestone) {
      endMilestoneAndResetLeaderboard();
      return res.json({ ok: true, message: 'Đã hoàn tất vinh danh, reset bảng top điểm và chuyển sang câu tiếp theo' });
    }
    if (nextRoundTimer) {
      clearTimeout(nextRoundTimer);
      nextRoundTimer = null;
    }
    io.emit('milestoneEnd');
    startNewRound();
    return res.json({ ok: true, message: 'Đã chuyển sang câu tiếp theo' });
  }

  if (action === 'simulateMilestone') {
    const demoUser = {
      uniqueId: req.body.uniqueId || 'top1_champion',
      nickname: req.body.nickname || 'Đại Kiện Tướng Tuấn',
      avatar: req.body.avatar || 'https://www.gstatic.com/youtube/img/creator/avatar/default_avatar.svg',
      score: Number(req.body.score) || MILESTONE_SCORE,
      wins: Number(req.body.wins) || 20,
    };
    if (leaderboard.size < 2) {
      leaderboard.set(demoUser.uniqueId, { ...demoUser, score: demoUser.score });
      leaderboard.set('top2_demo', { uniqueId: 'top2_demo', nickname: 'Anh Ba Miền Tây', avatar: '', score: 1800, wins: 18 });
      leaderboard.set('top3_demo', { uniqueId: 'top3_demo', nickname: 'Bé Na Chăm Học', avatar: '', score: 1500, wins: 15 });
      leaderboard.set('top4_demo', { uniqueId: 'top4_demo', nickname: 'Chiến Thần Đố Chữ', avatar: '', score: 1200, wins: 12 });
      leaderboard.set('top5_demo', { uniqueId: 'top5_demo', nickname: 'Minh Tuấn Vlog', avatar: '', score: 900, wins: 9 });
      io.emit('leaderboardReset', getLeaderboardList());
    }
    const dur = Number(req.body.duration) || MILESTONE_DURATION;
    triggerMilestoneCelebration(demoUser, demoUser.score, dur);
    return res.json({ ok: true, message: `Đã kích hoạt thử nghiệm Vinh Danh ${demoUser.score}đ cho ${demoUser.nickname} (${dur}s)` });
  }

  if (action === 'setUserScore') {
    const targetId = req.body.uniqueId || 'viewer_test';
    const targetNick = req.body.nickname || targetId;
    const targetScore = Number(req.body.score) || 1900;
    const existing = leaderboard.get(targetId) || {
      uniqueId: targetId,
      nickname: targetNick,
      avatar: req.body.avatar || '',
      score: 0,
      wins: 0,
      milestones: [],
    };
    existing.score = targetScore;
    existing.nickname = targetNick;
    existing.wins = Number(req.body.wins) || Math.floor(targetScore / 100);
    existing.milestones = [];
    leaderboard.set(targetId, existing);
    io.emit('leaderboardReset', getLeaderboardList());
    return res.json({ ok: true, message: `Đã đặt điểm cho ${targetNick} thành ${targetScore}đ (${existing.wins} trận thắng)` });
  }

  if (action === 'reveal') {
    const revealed = revealOneHint({ nickname: 'Streamer' }, 'Gợi ý MC', true);
    return res.json({ ok: true, revealed });
  }

  if (action === 'addTime') {
    const s = Number(seconds) || 30;
    addTime(s, 'MC cộng thêm thời gian');
    return res.json({ ok: true, timeLeft: gameState.timeLeft });
  }

  if (action === 'simulateChat') {
    const testUser = {
      uniqueId: user || 'viewer_test',
      nickname: user || 'Khán Giả Test',
      avatar: 'https://www.gstatic.com/youtube/img/creator/avatar/default_avatar.svg',
    };
    checkGuess(testUser, text || '');
    return res.json({ ok: true, message: `Đã gửi comment: "${text}"` });
  }

  if (action === 'simulateGift') {
    const diamonds = Number(req.body.diamonds) || 1;
    const repeatCount = Number(req.body.repeatCount) || 1;
    const giftName = req.body.giftName || (diamonds >= 100 ? 'Tên Lửa' : (diamonds >= 10 ? 'Nước Hoa' : 'Hoa Hồng'));
    const totalDiamonds = diamonds * repeatCount;
    const giftUser = {
      uniqueId: user || 'donor_demo_' + Math.floor(100 + Math.random() * 900),
      nickname: user || req.body.nickname || 'Đại Gia Hảo Tâm',
      avatar: req.body.avatar || 'https://www.gstatic.com/youtube/img/creator/avatar/default_avatar.svg',
      diamonds: totalDiamonds,
    };

    recordGiftDonation(giftUser, giftName, diamonds, repeatCount);
    let hintResult = null;
    if (giftHintConfig.enabled && totalDiamonds >= giftHintConfig.minDiamonds) {
      hintResult = revealGiftHints(giftUser, giftName, totalDiamonds, false);
    }
    if (totalDiamonds >= 10) {
      addTime(30, `${giftUser.nickname} tặng ${giftName} (+30s)`);
    }
    return res.json({
      ok: true,
      hintResult,
      message: `Đã kích hoạt quà tặng: ${giftUser.nickname} gửi ${giftName} (${totalDiamonds} xu${hintResult?.revealedCount ? ` - Mở ${hintResult.revealedCount} chữ` : ''})`
    });
  }

  if (action === 'simulateGiftHint') {
    const diamonds = Number(req.body.diamonds) || 1;
    const giftName = req.body.giftName || (diamonds >= 10 ? 'Nước Hoa' : 'Hoa Hồng');
    const giftUser = {
      uniqueId: req.body.uniqueId || user || 'donor_hint_' + Math.floor(100 + Math.random() * 900),
      nickname: req.body.nickname || user || 'Bé Mai 🌸',
      avatar: req.body.avatar || 'https://www.gstatic.com/youtube/img/creator/avatar/default_avatar.svg',
      diamonds,
    };

    recordGiftDonation(giftUser, giftName, diamonds, 1);
    const result = revealGiftHints(giftUser, giftName, diamonds, false);
    return res.json({
      ok: true,
      result,
      message: result?.limitReached && (!result.revealedCount || result.revealedCount === 0)
        ? `Đã tặng ${giftName}! ${result.message}`
        : `Đã kích hoạt quà tặng ${giftName} (${diamonds} xu) từ ${giftUser.nickname} mở ${result?.revealedCount || 0} chữ: "${result?.letter || ''}"`
    });
  }

  if (action === 'updateGiftHintConfig') {
    if (typeof req.body.enabled === 'boolean') giftHintConfig.enabled = req.body.enabled;
    if (Number(req.body.minDiamonds) >= 1) giftHintConfig.minDiamonds = Number(req.body.minDiamonds);
    if (Number(req.body.keepLastLettersSecret) >= 0) giftHintConfig.keepLastLettersSecret = Number(req.body.keepLastLettersSecret);

    io.emit('giftHintConfigUpdate', {
      giftHintConfig,
      remainingHiddenLetters: getHiddenLettersCount(),
      canRevealMore: getHiddenLettersCount() > giftHintConfig.keepLastLettersSecret,
    });
    return res.json({ ok: true, giftHintConfig, message: 'Đã cập nhật cấu hình Tặng quà mở chữ cái' });
  }

  if (action === 'simulateFollow') {
    const followUser = {
      uniqueId: req.body.uniqueId || user || 'follower_' + Math.floor(100 + Math.random() * 900),
      nickname: req.body.nickname || user || 'Khán Giả Mới',
      avatar: req.body.avatar || 'https://www.gstatic.com/youtube/img/creator/avatar/default_avatar.svg',
    };
    const resPayload = onUserFollow(followUser);
    return res.json({ ok: true, message: `Đã kích hoạt giả lập cảm ơn Follow cho ${followUser.nickname}`, payload: resPayload });
  }

  if (action === 'simulateDonorHonor' || action === 'triggerDonorHonor') {
    const donorNick = req.body.nickname || user || 'Mạnh Thường Quân Tuấn';
    const donorDiamonds = Number(req.body.diamonds) || 500;
    const dur = Number(req.body.duration) || DONOR_HONOR_DURATION;

    let target = donorLeaderboard.get(donorNick) || Array.from(donorLeaderboard.values())[0];
    if (!target) {
      target = {
        uniqueId: 'donor_vip_demo',
        nickname: donorNick,
        avatar: req.body.avatar || 'https://www.gstatic.com/youtube/img/creator/avatar/default_avatar.svg',
        diamonds: donorDiamonds,
        giftsCount: 5,
        lastGiftName: 'Tên Lửa VIP',
        lastGiftTime: Date.now()
      };
      donorLeaderboard.set(target.uniqueId, target);
      if (donorLeaderboard.size < 3) {
        donorLeaderboard.set('donor_top2', { uniqueId: 'donor_top2', nickname: 'Anh Ba Kim Cương', avatar: '', diamonds: 350, giftsCount: 3, lastGiftName: 'Du Thuyền' });
        donorLeaderboard.set('donor_top3', { uniqueId: 'donor_top3', nickname: 'Chị Tư Sài Gòn', avatar: '', diamonds: 200, giftsCount: 2, lastGiftName: 'Xe Thể Thao' });
      }
      io.emit('donorUpdate', {
        donorLeaderboard: getDonorLeaderboardList(),
        topDonor: target
      });
    }
    triggerDonorHonorCelebration(target, dur);
    return res.json({ ok: true, message: `Đã kích hoạt Siêu Vinh Danh Nhà Hảo Tâm cho ${target.nickname} (${dur}s)` });
  }

  if (action === 'skipDonorHonor') {
    endDonorHonor();
    return res.json({ ok: true, message: 'Đã hoàn tất / bỏ qua vinh danh nhà hảo tâm' });
  }

  if (action === 'simulateStreak') {
    const targetNick = req.body.nickname || user || 'Cao Thủ Bất Bại';
    const targetId = req.body.uniqueId || targetNick.toLowerCase().replace(/[\s\W]+/g, '_');
    const streakCount = Math.max(1, Number(req.body.count || req.body.streakCount) || 2);

    let basePoints = 100;
    let multiplier = 1.0;
    let streakBadge = '';
    let streakTitle = '';
    let flameLevel = 'none';

    if (streakCount >= 5) {
      multiplier = 2.0;
      streakBadge = '⚡';
      streakTitle = 'BẤT BẠI';
      flameLevel = 'godlike';
    } else if (streakCount >= 3) {
      multiplier = 1.5;
      streakBadge = '🔥🔥';
      streakTitle = 'BỐC CHÁY';
      flameLevel = 'blazing';
    } else if (streakCount === 2) {
      multiplier = 1.2;
      streakBadge = '🔥';
      streakTitle = 'CHUỖI NÓNG';
      flameLevel = 'hot';
    }

    const totalPoints = Math.round(basePoints * multiplier);
    const bonusPoints = totalPoints - basePoints;

    for (const [k, u] of leaderboard.entries()) {
      if (k !== targetId) u.streak = 0;
    }

    const existing = leaderboard.get(targetId) || {
      uniqueId: targetId,
      nickname: targetNick,
      avatar: req.body.avatar || 'https://www.gstatic.com/youtube/img/creator/avatar/default_avatar.svg',
      score: 0,
      wins: 0,
      streak: 0,
      maxStreak: 0,
      milestones: [],
    };
    existing.streak = streakCount;
    existing.maxStreak = Math.max(existing.maxStreak || 0, streakCount);
    leaderboard.set(targetId, existing);

    currentStreakWinner = {
      uniqueId: targetId,
      nickname: targetNick,
      avatar: existing.avatar,
      count: streakCount,
      multiplier,
      basePoints,
      bonusPoints,
      totalPoints,
      streakBadge,
      streakTitle,
      flameLevel,
    };

    io.emit('streakUpdate', currentStreakWinner);
    io.emit('leaderboardReset', getLeaderboardList());
    return res.json({ ok: true, streak: currentStreakWinner, message: `Đã thiết lập chuỗi thắng cho ${targetNick}: x${streakCount} (${streakTitle})` });
  }

  if (action === 'resetStreak') {
    currentStreakWinner = null;
    for (const u of leaderboard.values()) {
      u.streak = 0;
    }
    io.emit('streakUpdate', null);
    io.emit('leaderboardReset', getLeaderboardList());
    return res.json({ ok: true, message: 'Đã ngắt / reset chuỗi thắng liên tiếp về 0' });
  }

  if (action === 'resetLeaderboard') {
    leaderboard.clear();
    currentStreakWinner = null;
    io.emit('streakUpdate', null);
    io.emit('leaderboardReset', []);
    return res.json({ ok: true, message: 'Đã làm mới bảng xếp hạng điểm' });
  }

  if (action === 'resetDonorLeaderboard') {
    donorLeaderboard.clear();
    io.emit('donorReset', []);
    return res.json({ ok: true, message: 'Đã làm mới bảng vinh danh người tặng quà' });
  }

  if (action === 'resetPlayedWords') {
    playedWordIds.clear();
    savePlayedWords();
    buildDeck();
    return res.json({
      ok: true,
      message: `Đã làm mới toàn bộ kho câu hỏi (${wordsData.length} câu sẵn sàng)`
    });
  }

  if (action === 'setChannel' || action === 'setLiveId') {
    const target = liveId || channel;
    if (target) {
      connectYouTubeLive(target);
      return res.json({ ok: true, channel: gameState.connectedChannel, message: `Đang kết nối sang YouTube Live: ${target}` });
    }
  }

  if (action === 'speak' || action === 'tts') {
    const ttsText = String(text || '').trim();
    if (ttsText) {
      io.emit('ttsCustom', { ttsText });
      return res.json({ ok: true, message: `Đang phát giọng đọc: "${ttsText}"` });
    }
    return res.status(400).json({ ok: false, error: 'Văn bản đọc trống' });
  }

  if (action === 'simulateIdleReminder' || action === 'triggerIdleReminder') {
    const reminderText = triggerIdleReminder(true);
    return res.json({ ok: true, message: `Đã kích hoạt giọng đọc chống im lặng: "${reminderText}"`, text: reminderText });
  }

  if (action === 'toggleTts') {
    gameState.ttsEnabled = (req.body.ttsEnabled !== undefined) ? !!req.body.ttsEnabled : !gameState.ttsEnabled;
    io.emit('ttsConfig', { ttsEnabled: gameState.ttsEnabled });
    return res.json({ ok: true, ttsEnabled: gameState.ttsEnabled, message: `Giọng đọc đã ${gameState.ttsEnabled ? 'BẬT' : 'TẮT'}` });
  }

  if (action === 'selectPack') {
    const packId = req.body.packId;
    const ok = loadPack(packId);
    if (ok) {
      return res.json({
        ok: true,
        currentPackId,
        packName: AVAILABLE_PACKS.find(p => p.id === currentPackId)?.name,
        totalWords: wordsData.length,
        remainingInDeck: wordDeck.length,
        message: `Đã chuyển sang gói: ${AVAILABLE_PACKS.find(p => p.id === currentPackId)?.name}`,
      });
    }
    return res.status(400).json({ ok: false, message: 'Không thể nạp gói câu hỏi yêu cầu' });
  }

  if (action === 'getPacks') {
    return res.json({
      ok: true,
      currentPackId,
      availablePacks: AVAILABLE_PACKS.map(p => ({ id: p.id, name: p.name, totalWords: p.totalWords })),
      playedCount: playedWordIds.size,
      remainingInDeck: wordDeck.length,
    });
  }

  if (action === 'triggerTopicVote') {
    if (timerInterval) clearInterval(timerInterval);
    if (nextRoundTimer) {
      clearTimeout(nextRoundTimer);
      nextRoundTimer = null;
    }
    startTopicVoting();
    return res.json({ ok: true, message: 'Đã kích hoạt bình chọn chủ đề 12s cho khán giả (vòng đặc biệt 500 điểm)!' });
  }

  return res.status(400).json({ ok: false, error: 'Unknown action' });
});

// Socket.io Connection
io.on('connection', socket => {
  socket.emit('gameState', getClientGameState());

  socket.on('requestState', () => {
    socket.emit('gameState', getClientGameState());
  });
});

function cleanupProcess() {
  if (liveChat) {
    try {
      liveChat.stop();
    } catch (e) {}
  }
  process.exit(0);
}
process.on('SIGINT', cleanupProcess);
process.on('SIGTERM', cleanupProcess);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`👑 Game "Vua Tiếng Việt" - YOUTUBE LIVE INTERACTIVE`);
  console.log(`📍 Web Display (Dán vào OBS): http://localhost:${PORT}`);
  console.log(`⚙️ Trang Quản Trị MC:        http://localhost:${PORT}/admin.html`);
  console.log(`📡 YouTube Live ID:          ${YOUTUBE_LIVE_ID}`);
  console.log(`====================================================`);

  startNewRound();
  connectYouTubeLive(YOUTUBE_LIVE_ID);
});
