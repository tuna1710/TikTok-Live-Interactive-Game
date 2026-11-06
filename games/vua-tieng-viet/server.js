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

const PORT = Number(process.env.PORT) || 3002;
let TIKTOK_USERNAME = process.env.TIKTOK_USERNAME || '@2166541467';
let TIKTOK_SESSION_ID = process.env.TIKTOK_SESSION_ID || '';
let tiktokConn = null;
const ROUND_TIME_DEFAULT = Number(process.env.ROUND_TIME) || 300; // 5 phút (300 giây)

const TTS_CACHE_DIR = path.join(__dirname, 'data', 'tts-cache');
if (!fs.existsSync(TTS_CACHE_DIR)) {
  fs.mkdirSync(TTS_CACHE_DIR, { recursive: true });
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Endpoint Proxy TTS (Google Translate TTS tiếng Việt có MD5 disk-cache)
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

// Load Words & Quản lý Deck Shuffle (Tránh lặp câu)
const wordsData = require('./data/words.json');
const PLAYED_WORDS_FILE = path.join(__dirname, 'data', 'played_words.json');
let playedWordIds = new Set();
let wordDeck = [];

// Game State
let gameState = {
  round: 0,
  currentWord: null,       // { id, word, category, hint }
  scrambledLetters: [],   // ['H', 'Ồ', 'N', 'G', 'O', 'A']
  revealedMask: [],       // boolean[] for each char in currentWord.word
  timeLeft: ROUND_TIME_DEFAULT,
  roundState: 'WAITING',   // 'PLAYING' | 'WON' | 'TIMEOUT'
  lastWinner: null,
  totalLikes: 0,
  connectedChannel: TIKTOK_USERNAME.startsWith('@') ? TIKTOK_USERNAME : '@' + TIKTOK_USERNAME,
  tiktokConnected: false,
  tiktokConnecting: false,
  tiktokStatusType: 'init',
  tiktokStatusMsg: 'Đang khởi động...',
  totalCommentsReceived: 0,
  ttsEnabled: true,
};

let timerInterval = null;
let reconnectTimer = null;
let nextRoundTimer = null;
let isCelebratingMilestone = false;
let activeMilestone = null;
const MILESTONE_SCORE = Number(process.env.MILESTONE_SCORE) || 3000;
const MILESTONE_DURATION = Number(process.env.MILESTONE_DURATION) || 60; // 60 giây vinh danh cho khán giả chụp màn hình
const leaderboard = new Map();      // uniqueId -> { uniqueId, nickname, avatar, score, wins, milestones }
const donorLeaderboard = new Map(); // uniqueId -> { uniqueId, nickname, avatar, diamonds, giftsCount, lastGiftName, lastGiftTime }
let recentGuesses = [];             // last 15 guesses

// Quản lý Follow & Vinh Danh Nhà Hảo Tâm
let isCelebratingDonorHonor = false;
let donorHonorTimer = null;
let activeDonorHonor = null;
const DONOR_HONOR_DURATION = Number(process.env.DONOR_HONOR_DURATION) || 20; // 20 giây vinh danh nhà hảo tâm
const recentFollowers = new Map(); // uniqueId -> timestamp (chống spam)
let lastFollowEvent = null;

// Quản lý Chuỗi Thắng Liên Tiếp (Combo Win Streak & Flame - Mục 2)
let currentStreakWinner = null; // { uniqueId, nickname, avatar, count, multiplier, basePoints, bonusPoints, totalPoints, streakBadge, streakTitle, flameLevel }

// Quản lý Bùa Lợi Quà Tặng (Buff x2 Điểm Đoán Đúng & +10 Điểm/Xu)
const donorScoreBuffs = new Map(); // uniqueId -> { active: true, multiplier: 2, giftName, diamonds, giftPoints, activatedAt }
const POINTS_PER_DIAMOND = Number(process.env.POINTS_PER_DIAMOND) || 10; // Cứ 1 xu tặng quà cộng 10 điểm xếp hạng

// Quản lý Rương Kho Báu & Mốc Thả Tim (Like Milestone Chest - Mục 6)
const likeChestConfig = {
  milestoneStep: Number(process.env.LIKE_CHEST_STEP) || 200, // Mặc định mỗi 200 tim thì mở 1 rương
  autoReward: true,
};

let likeChestState = {
  currentLikes: 0,
  chestLikes: 0,
  milestoneStep: likeChestConfig.milestoneStep,
  targetLikes: likeChestConfig.milestoneStep,
  chestsOpened: 0,
  lastChestOpened: null,
};

let isCelebratingChest = false;
let chestCelebrationTimer = null;
let activeChestCelebration = null;
const CHEST_CELEBRATION_DURATION = 8;

function getLikeChestClientState() {
  const currentInChest = likeChestState.chestLikes % likeChestState.milestoneStep;
  const percent = Math.min(100, Math.floor((currentInChest / likeChestState.milestoneStep) * 100));
  return {
    currentLikes: likeChestState.currentLikes,
    chestLikes: currentInChest,
    milestoneStep: likeChestState.milestoneStep,
    targetLikes: (likeChestState.chestsOpened + 1) * likeChestState.milestoneStep,
    chestsOpened: likeChestState.chestsOpened,
    percent,
    lastChest: likeChestState.lastChestOpened,
  };
}

function triggerLikeChestOpen(luckyUser = null) {
  likeChestState.chestsOpened++;
  likeChestState.targetLikes = (likeChestState.chestsOpened + 1) * likeChestState.milestoneStep;

  console.log(`🎁 [RƯƠNG KHO BÁU] ĐẠT MỐC ${likeChestState.milestoneStep} TIM -> MỞ RƯƠNG THỨ #${likeChestState.chestsOpened}!`);

  // 1. Phần thưởng 1: Tự động mở chữ cái gợi ý (trợ giúp phòng live)
  const lettersRevealed = [];
  if (gameState.roundState === 'PLAYING' && gameState.currentWord) {
    const r1 = revealOneHint({ nickname: 'Rương Kho Báu 🎁', avatar: '', diamonds: 0 }, 'Rương Tim Mở', true);
    if (r1 && r1.letter) lettersRevealed.push(r1.letter);

    // Nếu từ còn nhiều chữ ẩn (>= 2 chữ), mở thêm 1 chữ thứ 2 cho hào sảng
    if (getHiddenLettersCount() >= 2) {
      const r2 = revealOneHint({ nickname: 'Rương Kho Báu 🎁', avatar: '', diamonds: 0 }, 'Rương Tim Mở', true);
      if (r2 && r2.letter) lettersRevealed.push(r2.letter);
    }
  }

  // 2. Phần thưởng 2: Cộng thêm 30 giây suy nghĩ
  addTime(30, `🎁 Rương Kho Báu #${likeChestState.chestsOpened} nổ tung (+30s)`);

  // 3. Phần thưởng 3: Chọn ngẫu nhiên 1 người may mắn nhận điểm thưởng
  let luckyReward = null;
  if (luckyUser && luckyUser.nickname) {
    luckyReward = { nickname: luckyUser.nickname, avatar: luckyUser.avatar || '', bonus: 100 };
  } else if (leaderboard.size > 0) {
    const list = Array.from(leaderboard.values());
    const picked = list[Math.floor(Math.random() * list.length)];
    picked.score += 100;
    luckyReward = { nickname: picked.nickname, avatar: picked.avatar || '', bonus: 100 };
    io.emit('leaderboardReset', getLeaderboardList());
  }

  let letterDesc = '';
  if (lettersRevealed.length > 0) {
    letterDesc = ` Mở chữ cái: ${lettersRevealed.join(', ')}!`;
  }

  const ttsText = `Rương kho báu thứ ${likeChestState.chestsOpened} đã mở tung! Cả phòng được cộng thêm 30 giây suy nghĩ!${letterDesc} Cảm ơn mọi người đã cùng nhau thả tim!`;

  const payload = {
    chestNumber: likeChestState.chestsOpened,
    milestone: likeChestState.milestoneStep,
    totalLikes: likeChestState.currentLikes,
    lettersRevealed,
    addedSeconds: 30,
    luckyReward,
    ttsText,
    chestState: getLikeChestClientState(),
    openedAt: Date.now(),
  };
  likeChestState.lastChestOpened = payload;
  isCelebratingChest = true;
  activeChestCelebration = {
    ...payload,
    duration: CHEST_CELEBRATION_DURATION,
    startedAt: Date.now(),
  };

  if (chestCelebrationTimer) clearTimeout(chestCelebrationTimer);
  chestCelebrationTimer = setTimeout(() => {
    isCelebratingChest = false;
    activeChestCelebration = null;
    io.emit('likeChestClose');
  }, CHEST_CELEBRATION_DURATION * 1000);

  io.emit('likeChestOpened', payload);
  return payload;
}

function onLikeReceived(count = 1, user = null) {
  const inc = Math.max(1, Number(count) || 1);
  likeChestState.currentLikes += inc;
  likeChestState.chestLikes += inc;
  gameState.totalLikes = likeChestState.currentLikes;

  while (likeChestState.chestLikes >= likeChestState.milestoneStep) {
    likeChestState.chestLikes -= likeChestState.milestoneStep;
    triggerLikeChestOpen(user);
  }

  io.emit('likeUpdate', {
    totalLikes: likeChestState.currentLikes,
    addedLikes: inc,
    user: user ? { nickname: user.nickname || user.user, avatar: user.avatar } : null,
    chestState: getLikeChestClientState(),
  });
}

function onUserFollow(user) {
  const uniqueId = user.uniqueId || user.nickname || 'user_' + Date.now();
  const nickname = user.nickname || user.user || uniqueId;
  const avatar = user.avatar || 'https://p16-sign-va.tiktokcdn.com/tos-maliva-avt-0068/default-avatar.jpeg';

  const now = Date.now();
  const lastFollow = recentFollowers.get(uniqueId) || 0;
  // Giới hạn 20 giây mỗi người để tránh spam
  if (now - lastFollow < 20000) {
    return null;
  }
  recentFollowers.set(uniqueId, now);
  if (recentFollowers.size > 300) {
    const firstKey = recentFollowers.keys().next().value;
    recentFollowers.delete(firstKey);
  }

  const ttsText = `Cảm ơn bạn ${nickname} đã follow kênh! Chúc bạn chơi game vui vẻ!`;
  const payload = {
    user: { uniqueId, nickname, avatar },
    ttsText,
    timestamp: now
  };

  lastFollowEvent = payload;
  console.log(`💖 [TikTok Follow] Cảm ơn ${nickname} (@${uniqueId}) đã follow kênh!`);
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

  // Reset bảng điểm (không reset bảng tấm lòng vàng / donorLeaderboard)
  leaderboard.clear();
  io.emit('leaderboardReset', []);
  io.emit('milestoneEnd');
  io.emit('streakUpdate', null);
  startNewRound();
}

function triggerMilestoneCelebration(user, score = MILESTONE_SCORE, duration = MILESTONE_DURATION) {
  isCelebratingMilestone = true;
  const top5List = getLeaderboardList().slice(0, 5);

  let top5Tts = '';
  if (top5List.length > 0) {
    const listDescriptions = top5List.map((p, idx) => `Top ${idx + 1}: ${p.nickname} ${p.score} điểm`).join(', ');
    top5Tts = ` Vinh danh bảng vàng Top 5: ${listDescriptions}.`;
  }

  const ttsText = `Nhiệt liệt chúc mừng ${user.nickname} đã xuất sắc cán mốc ${score} điểm!${top5Tts} Mời mọi người nhanh tay chụp màn hình kỷ niệm!`;
  console.log(`🌟 ĐẠI VINH DANH CÁN MỐC: ${user.nickname} đạt ${score} điểm! (${duration}s)`);
  console.log(`📢 BẢNG VÀNG TOP 5:\n` + top5List.map((p, i) => `   Top ${i + 1}: ${p.nickname} (${p.score}đ)`).join('\n'));

  activeMilestone = {
    user: {
      uniqueId: user.uniqueId,
      nickname: user.nickname,
      avatar: user.avatar || 'https://p16-sign-va.tiktokcdn.com/tos-maliva-avt-0068/default-avatar.jpeg',
      score: score,
      wins: user.wins || Math.floor(score / 100),
    },
    top5: top5List,
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
  const count = Math.max(1, Number(repeatCount) || 1);
  const singleValue = Math.max(1, Number(diamonds) || 1);
  const totalDiamonds = singleValue * count;

  const key = user.uniqueId || user.nickname || 'donor_' + Date.now();
  const oldTopDonor = getDonorLeaderboardList()[0];
  const oldTop1Id = oldTopDonor?.uniqueId;

  const existing = donorLeaderboard.get(key) || {
    uniqueId: user.uniqueId || key,
    nickname: user.nickname || user.user || 'Nhà Hảo Tâm',
    avatar: user.avatar || '',
    diamonds: 0,
    giftsCount: 0,
    lastGiftName: giftName,
    lastGiftTime: Date.now()
  };

  existing.diamonds += totalDiamonds;
  existing.giftsCount += count;
  existing.lastGiftName = giftName;
  existing.lastGiftTime = Date.now();
  if (user.avatar && !existing.avatar) existing.avatar = user.avatar;
  if (user.nickname && user.nickname !== existing.nickname) existing.nickname = user.nickname;
  donorLeaderboard.set(key, existing);

  const donorList = getDonorLeaderboardList();
  const newTopDonor = donorList[0];

  const payload = {
    donor: {
      uniqueId: existing.uniqueId,
      nickname: existing.nickname,
      avatar: existing.avatar
    },
    giftName,
    diamonds: totalDiamonds,
    repeatCount: count,
    totalDiamonds: existing.diamonds,
    donorLeaderboard: donorList,
    topDonor: newTopDonor || null,
  };

  io.emit('donorUpdate', payload);

  // 1. Cứ 1 xu tặng quà cộng 10 điểm vào bảng xếp hạng
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
  playerInLeaderboard.score += pointsFromGift;
  if (user.avatar && !playerInLeaderboard.avatar) playerInLeaderboard.avatar = user.avatar;
  if (user.nickname && user.nickname !== playerInLeaderboard.nickname) playerInLeaderboard.nickname = user.nickname;
  leaderboard.set(donorKey, playerInLeaderboard);
  io.emit('leaderboardReset', getLeaderboardList());

  // 2. Kích hoạt Bùa Lợi Nhân Đôi Điểm (Buff x2) cho lần đoán đúng tiếp theo
  donorScoreBuffs.set(donorKey, {
    active: true,
    multiplier: 2,
    giftName: giftName,
    diamonds: totalDiamonds,
    giftPoints: pointsFromGift,
    activatedAt: Date.now(),
  });

  io.emit('donorBuffActivated', {
    uniqueId: donorKey,
    nickname: playerInLeaderboard.nickname,
    avatar: playerInLeaderboard.avatar,
    giftName,
    diamonds: totalDiamonds,
    giftPoints: pointsFromGift,
    multiplier: 2,
    totalScore: playerInLeaderboard.score,
  });

  console.log(`🎁 [Buff Quà Tặng] ${playerInLeaderboard.nickname} nhận +${pointsFromGift}đ (${totalDiamonds} xu) & kích hoạt Buff x2 Điểm cho câu đoán đúng kế tiếp! (Tổng: ${playerInLeaderboard.score}đ)`);

  // Kiểm tra nếu chạm mốc điểm chiến thắng (MILESTONE_SCORE)
  const reachedMilestone = playerInLeaderboard.score >= MILESTONE_SCORE && !playerInLeaderboard.milestones.includes(MILESTONE_SCORE);
  if (reachedMilestone) {
    playerInLeaderboard.milestones.push(MILESTONE_SCORE);
    if (!isCelebratingMilestone) {
      triggerMilestoneCelebration(playerInLeaderboard, MILESTONE_SCORE, MILESTONE_DURATION);
    }
  }

  // Kích hoạt Siêu Vinh Danh Nhà Hảo Tâm nếu:
  // 1) Lượt tặng này có giá trị lớn (>= 50 xu)
  // 2) Hoặc vượt lên Top 1 nhà hảo tâm với tổng tích lũy >= 20 xu
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

  // Nếu đã chơi hết sạch toàn bộ kho câu -> Tự động xáo lại từ đầu
  if (unplayed.length === 0) {
    console.log(`[Deck] 🎉 ĐÃ CHƠI HẾT TOÀN BỘ ${wordsData.length} CÂU HỎI! Đang làm mới bộ bài...`);
    playedWordIds.clear();
    savePlayedWords();
    unplayed = [...wordsData];
  }

  // Fisher-Yates Shuffle
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


function startNewRound() {
  if (timerInterval) clearInterval(timerInterval);
  if (nextRoundTimer) {
    clearTimeout(nextRoundTimer);
    nextRoundTimer = null;
  }

  const wordObj = pickNextWord();
  const rawChars = wordObj.word.split('');

  // Extract non-space characters for scrambling
  const nonSpaces = rawChars.filter(c => c !== ' ');
  let scrambled = shuffle(nonSpaces);

  // Guarantee not identical to original
  if (scrambled.join('') === nonSpaces.join('') && scrambled.length > 1) {
    scrambled.reverse();
  }

  // Initial mask: spaces are revealed, letters hidden
  const mask = rawChars.map(c => c === ' ');

  gameState.round++;
  gameState.currentWord = wordObj;
  gameState.scrambledLetters = scrambled;
  gameState.revealedMask = mask;
  gameState.timeLeft = ROUND_TIME_DEFAULT;
  gameState.roundState = 'PLAYING';

  console.log(`\n[Vòng ${gameState.round}] Từ cần đoán: "${wordObj.word}" (Chủ đề: ${wordObj.category})`);

  const ttsText = `Vòng ${gameState.round}. Chủ đề ${wordObj.category}. Gợi ý: ${wordObj.hint}`;
  const roundPayload = {
    ...getClientGameState(),
    ttsText,
  };

  io.emit('roundStart', roundPayload);

  timerInterval = setInterval(() => {
    if (gameState.roundState !== 'PLAYING') return;

    gameState.timeLeft--;
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
    startNewRound();
  }, 5000);
}

function checkGuess(user, text) {
  if (!text) return;
  gameState.totalCommentsReceived++;

  if (gameState.roundState !== 'PLAYING' || !gameState.currentWord) return;

  const target = gameState.currentWord.word;
  const normTarget = normalizeAnswer(target);
  const normGuess = normalizeAnswer(text);

  const rawTargetStrip = stripVietnameseAccents(normTarget);
  const rawGuessStrip = stripVietnameseAccents(normGuess);

  // 1. So khớp chính xác tuyệt đối (có dấu hoặc không dấu)
  const isExact = (normGuess === normTarget);
  const isUnaccentedExact = (rawGuessStrip === rawTargetStrip && rawGuessStrip.length >= 2);

  // 2. So khớp linh hoạt (khi khán giả gõ thêm chữ: "đáp án là hoa hồng", "hoa hồng nhé", "em đoán hoa hong")
  const isContainedAccented = normTarget.length >= 3 && normGuess.includes(normTarget);
  const isContainedUnaccented = rawTargetStrip.length >= 3 && rawGuessStrip.includes(rawTargetStrip);

  const isCorrect = isExact || isUnaccentedExact || isContainedAccented || isContainedUnaccented;

  console.log(`[Bình luận] ${user.nickname} (@${user.uniqueId}): "${text}" => ${isCorrect ? '🎯 ĐÚNG!' : 'Chưa đúng'}`);

  // Thêm vào danh sách bình luận gần đây
  const guessItem = {
    uniqueId: user.uniqueId,
    nickname: user.nickname || user.uniqueId,
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

    // Mở toàn bộ chữ
    gameState.revealedMask = target.split('').map(() => true);

    // Xử lý Chuỗi Thắng Liên Tiếp (Combo Win Streak & Flame)
    let streakCount = 1;
    if (currentStreakWinner && currentStreakWinner.uniqueId === user.uniqueId) {
      streakCount = currentStreakWinner.count + 1;
    }

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

    // Kiểm tra Bùa Lợi Quà Tặng (Buff x2 Điểm)
    let hasDonorBuff = false;
    let donorBuff = null;
    if (donorScoreBuffs.has(user.uniqueId)) {
      hasDonorBuff = true;
      donorBuff = donorScoreBuffs.get(user.uniqueId);
      donorScoreBuffs.delete(user.uniqueId); // Tiêu hao bùa lợi sau khi dùng
    }

    const buffMultiplier = hasDonorBuff ? 2.0 : 1.0;
    const effectiveMultiplier = Number((multiplier * buffMultiplier).toFixed(2));
    const totalPoints = Math.round(basePoints * effectiveMultiplier);
    const bonusPoints = totalPoints - basePoints;

    // Reset streak của những người chơi khác trên bảng xếp hạng
    for (const [k, u] of leaderboard.entries()) {
      if (k !== user.uniqueId) {
        u.streak = 0;
      }
    }

    // Cộng điểm Leaderboard
    const key = user.uniqueId;
    const existing = leaderboard.get(key) || {
      uniqueId: user.uniqueId,
      nickname: user.nickname || user.uniqueId,
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
      hasDonorBuff,
      donorBuffGift: donorBuff?.giftName || '',
      word: target,
    };

    console.log(`🏆 NGƯỜI CHIẾN THẮNG: ${existing.nickname} (+${totalPoints}đ${hasDonorBuff ? ' [🎁 BUFF X2 QUÀ TẶNG]' : ''}${streakCount >= 2 ? ` [Combo x${streakCount} ${streakBadge} ${streakTitle}]` : ''}, Tổng: ${existing.score}đ)`);

    const winnerName = existing.nickname;
    let ttsText = '';
    if (hasDonorBuff && streakCount >= 2) {
      ttsText = `Tuyệt đỉnh! Nhờ có bùa lợi quà tặng ${donorBuff?.giftName || ''} kết hợp chuỗi thắng liên tiếp, ${winnerName} nhận số điểm gấp bội lên ${totalPoints} điểm!`;
    } else if (hasDonorBuff) {
      ttsText = `Tuyệt đỉnh! Nhờ có bùa lợi quà tặng ${donorBuff?.giftName || ''}, ${winnerName} được nhân đôi số điểm lên ${totalPoints} điểm cho đáp án chính xác: ${target}!`;
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
      hasDonorBuff,
      donorBuff,
    });
    io.emit('streakUpdate', currentStreakWinner);

    const reachedMilestone = existing.score >= MILESTONE_SCORE && !existing.milestones.includes(MILESTONE_SCORE);
    if (reachedMilestone) {
      existing.milestones.push(MILESTONE_SCORE);
      console.log(`🎉 [MỐC ĐẶC BIỆT] ${existing.nickname} ĐẠT ${existing.score} ĐIỂM -> BẮT ĐẦU VINH DANH ${MILESTONE_DURATION} GIÂY!`);

      // Sau 3.5 giây thông báo thắng vòng, kích hoạt đại vinh danh 60 giây
      if (nextRoundTimer) clearTimeout(nextRoundTimer);
      nextRoundTimer = setTimeout(() => {
        triggerMilestoneCelebration(existing, MILESTONE_SCORE, MILESTONE_DURATION);
      }, 3500);
    } else {
      if (nextRoundTimer) clearTimeout(nextRoundTimer);
      nextRoundTimer = setTimeout(() => {
        startNewRound();
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

function revealOneHint(donor = null, giftName = '', force = false) {
  if (gameState.roundState !== 'PLAYING' || !gameState.currentWord) return null;

  const rawChars = gameState.currentWord.word.split('');
  const unrevealedIndices = [];

  rawChars.forEach((ch, idx) => {
    if (ch !== ' ' && !gameState.revealedMask[idx]) {
      unrevealedIndices.push(idx);
    }
  });

  if (unrevealedIndices.length === 0) return null;

  // Nếu không phải do Streamer/MC ép mở (force === true)
  // và số chữ ẩn còn lại <= số chữ phải giữ bí mật:
  if (!force && unrevealedIndices.length <= giftHintConfig.keepLastLettersSecret) {
    const notifyPayload = {
      message: `Đã mở tối đa gợi ý! Chỉ còn ${unrevealedIndices.length} chữ cái bí mật, hãy nhanh tay đoán từ khóa!`,
      donor: donor ? (donor.nickname || donor.user || donor.uniqueId) : null,
      giftName: giftName || 'Quà Tặng',
      remainingHidden: unrevealedIndices.length,
      limitReached: true,
      ttsText: 'Đã mở tối đa gợi ý! Chỉ còn đúng một chữ cái bí mật cuối cùng, ai sẽ là Vua Tiếng Việt?'
    };
    console.log(`⚠️ [GIFT HINT] Đã chạm giới hạn giữ chữ bí mật (${unrevealedIndices.length} chữ còn lại)`);
    io.emit('giftHintLimitReached', notifyPayload);
    return notifyPayload;
  }

  // Chọn ngẫu nhiên một vị trí chưa mở
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
  if (donorInfo && donorInfo.nickname !== 'Streamer') {
    ttsText = `Cảm ơn ${donorInfo.nickname} đã tặng ${donorInfo.giftName} mở chữ cái ${rawChars[pickIdx]}!`;
  }

  const payload = {
    index: pickIdx,
    letter: rawChars[pickIdx],
    revealedMask: gameState.revealedMask,
    donor: donorInfo,
    isGiftTriggered: !!donorInfo && donorInfo.nickname !== 'Streamer',
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
    wordLength: gameState.currentWord?.word.length || 0,
    targetPattern: gameState.currentWord?.word.split('').map((c, i) => {
      if (c === ' ') return ' ';
      return gameState.revealedMask[i] ? c : '_';
    }) || [],
    scrambledLetters: gameState.scrambledLetters,
    timeLeft: gameState.timeLeft,
    roundState: gameState.roundState,
    lastWinner: gameState.lastWinner,
    totalLikes: gameState.totalLikes,
    leaderboard: getLeaderboardList(),
    donorLeaderboard: getDonorLeaderboardList(),
    topDonor: getDonorLeaderboardList()[0] || null,
    recentGuesses: recentGuesses.slice(0, 8),
    tiktokConnected: gameState.tiktokConnected,
    tiktokConnecting: gameState.tiktokConnecting,
    tiktokStatusType: gameState.tiktokStatusType || 'init',
    tiktokStatusMsg: gameState.tiktokStatusMsg,
    connectedChannel: gameState.connectedChannel,
    totalCommentsReceived: gameState.totalCommentsReceived,
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
    likeChest: getLikeChestClientState(),
    isCelebratingChest,
    activeChestCelebration: activeChestCelebration ? {
      ...activeChestCelebration,
      duration: Math.max(1, Math.round(activeChestCelebration.duration - (Date.now() - activeChestCelebration.startedAt) / 1000)),
    } : null,
  };
}

// -------------------------------------------------------------
// TikTok Live Connector Chuẩn (Theo Kiến Trúc Chùa Linh Ứng 8K)
// -------------------------------------------------------------
function resolveTikTokUsername(input) {
  if (!input) return '';
  const clean = String(input).trim();
  if (clean.startsWith('@')) return clean.slice(1);
  return clean;
}

function extractUserFromEvent(data) {
  const u = data?.user || data || {};
  const uniqueId = u.uniqueId || u.displayId || data?.uniqueId || '';
  const user = u.nickname || uniqueId || data?.nickname || 'Khán Giả';
  const avatar =
    u.profilePictureUrl ||
    u.avatarLarge?.urlList?.[0] ||
    u.avatarThumb?.urlList?.[0] ||
    u.avatarMedium?.urlList?.[0] ||
    data?.profilePictureUrl ||
    '';
  return { user, uniqueId, avatar };
}

function scheduleReconnect(delay = 5000) {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    connectTikTokLive(gameState.connectedChannel);
  }, delay);
}

async function connectTikTokLive(usernameOrUrl) {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  const cleanUser = resolveTikTokUsername(usernameOrUrl || TIKTOK_USERNAME);
  if (!cleanUser) {
    gameState.tiktokStatusType = 'unconfigured';
    gameState.tiktokStatusMsg = 'Chưa thiết lập kênh TikTok';
    io.emit('tiktokStatus', { connected: false, connecting: false, statusType: 'unconfigured', channel: '', msg: gameState.tiktokStatusMsg });
    return;
  }

  gameState.connectedChannel = '@' + cleanUser;
  gameState.tiktokConnecting = true;
  gameState.tiktokStatusType = 'connecting';
  gameState.tiktokStatusMsg = `Đang kết nối tới @${cleanUser}...`;

  if (tiktokConn) {
    try {
      await tiktokConn.disconnect();
    } catch (_) {}
    tiktokConn = null;
  }

  io.emit('tiktokStatus', {
    connected: false,
    connecting: true,
    statusType: 'connecting',
    channel: gameState.connectedChannel,
    msg: gameState.tiktokStatusMsg,
  });

  console.log(`[TikTok Live] Đang kết nối tới phòng @${cleanUser}...`);

  const connectionOptions = {
    processInitialData: true,
    fetchRoomInfoOnConnect: false,
    enableExtendedGiftInfo: false,
  };

  if (TIKTOK_SESSION_ID) {
    connectionOptions.sessionId = TIKTOK_SESSION_ID;
  }

  tiktokConn = new TikTokLiveConnection(cleanUser, connectionOptions);

  tiktokConn.on(ControlEvent.CONNECTED, (roomState) => {
    gameState.tiktokConnected = true;
    gameState.tiktokConnecting = false;
    gameState.tiktokStatusType = 'connected';
    const roomId = roomState?.roomId || tiktokConn?.roomId || '';
    gameState.tiktokStatusMsg = `Đã kết nối Live @${cleanUser} (Room ID: ${roomId})`;
    console.log(`[TikTok Live] ✅ KẾT NỐI THÀNH CÔNG phòng @${cleanUser} (Room ID: ${roomId})! Đang lắng nghe bình luận.`);
    io.emit('tiktokStatus', {
      connected: true,
      connecting: false,
      statusType: 'connected',
      channel: gameState.connectedChannel,
      roomId,
      msg: gameState.tiktokStatusMsg,
    });
  });

  tiktokConn.on(ControlEvent.DISCONNECTED, () => {
    gameState.tiktokConnected = false;
    gameState.tiktokConnecting = false;
    gameState.tiktokStatusType = 'offline';
    gameState.tiktokStatusMsg = `Đã ngắt kết nối @${cleanUser}. Đang kết nối lại sau 5s...`;
    console.log(`[TikTok Live] Đã ngắt kết nối @${cleanUser}`);
    io.emit('tiktokStatus', {
      connected: false,
      connecting: false,
      statusType: 'offline',
      channel: gameState.connectedChannel,
      msg: gameState.tiktokStatusMsg,
    });
    scheduleReconnect(5000);
  });

  tiktokConn.on(ControlEvent.ERROR, (err) => {
    const errMsg = err?.message || String(err);
    console.warn(`[TikTok Live Warning]`, errMsg);
    if (!gameState.tiktokConnected) {
      gameState.tiktokStatusMsg = `Lỗi kết nối: ${errMsg}`;
    }
  });

  tiktokConn.on(WebcastEvent.CHAT, (data) => {
    const { user, uniqueId, avatar } = extractUserFromEvent(data);
    const commentText = data?.content || data?.comment || '';
    if (commentText) {
      checkGuess({ uniqueId, nickname: user, avatar }, commentText);
    }
  });

  tiktokConn.on(WebcastEvent.GIFT, (data) => {
    const { user, uniqueId, avatar } = extractUserFromEvent(data);
    const giftObj = data?.gift || data?.giftDetails || {};
    const giftName = giftObj?.name || data?.giftName || 'Hoa Hồng';
    const diamondCount = Number(giftObj?.diamondCount || data?.diamondCount || 1);
    const repeatCount = Math.max(1, Number(data?.repeatCount || data?.comboCount || 1));
    const totalDiamonds = diamondCount * repeatCount;

    console.log(`[Quà tặng] ${user} gửi ${giftName} (${totalDiamonds} xu)`);
    recordGiftDonation({ uniqueId, nickname: user, avatar }, giftName, diamondCount, repeatCount);

    if (giftHintConfig.enabled && totalDiamonds >= giftHintConfig.minDiamonds) {
      revealOneHint({ uniqueId, nickname: user, avatar, diamonds: totalDiamonds }, giftName, false);
    }

    if (totalDiamonds >= 10) {
      addTime(30, `${user} tặng ${giftName} (+30s)`);
    }
  });

  tiktokConn.on(WebcastEvent.LIKE, (data) => {
    const count = Number(data?.count || data?.likeCount || 1);
    const user = extractUserFromEvent(data);
    onLikeReceived(count, user);
  });

  const handleFollowEvent = (data) => {
    const { user, uniqueId, avatar } = extractUserFromEvent(data);
    onUserFollow({ user, uniqueId, avatar });
  };

  tiktokConn.on(WebcastEvent.FOLLOW, handleFollowEvent);
  tiktokConn.on(WebcastEvent.SOCIAL, (data) => {
    const action = String(data?.action || '');
    const disp = String(data?.common?.displayText?.displayType || data?.displayType || '').toLowerCase();
    if (action === '1' || disp.includes('follow')) {
      handleFollowEvent(data);
    }
  });

  try {
    const roomState = await tiktokConn.connect();
    gameState.tiktokConnected = true;
    gameState.tiktokConnecting = false;
    gameState.tiktokStatusType = 'connected';
    const roomId = roomState?.roomId || tiktokConn?.roomId || '';
    gameState.tiktokStatusMsg = `Đã kết nối Live @${cleanUser} (Room ID: ${roomId})`;
    io.emit('tiktokStatus', {
      connected: true,
      connecting: false,
      statusType: 'connected',
      channel: gameState.connectedChannel,
      roomId,
      msg: gameState.tiktokStatusMsg,
    });
  } catch (err) {
    gameState.tiktokConnected = false;
    gameState.tiktokConnecting = false;
    const errMsg = err?.message || String(err);

    let statusType = 'offline';
    if (/sign|403|SignatureError/i.test(errMsg)) {
      statusType = 'auth_error';
      gameState.tiktokStatusMsg = `Kênh @${cleanUser} đang phát Live nhưng gặp lỗi bảo mật (403). Đang thử lại sau 5s...`;
    } else if (/timeout|ECONNRESET|ETIMEDOUT|socket/i.test(errMsg)) {
      statusType = 'network_error';
      gameState.tiktokStatusMsg = `Lỗi mạng kết nối @${cleanUser}. Đang thử lại sau 5s...`;
    } else {
      gameState.tiktokStatusMsg = `Kênh @${cleanUser} chưa lên sóng Live (${errMsg}). Tự động dò tìm sau 5s...`;
    }

    gameState.tiktokStatusType = statusType;
    console.warn(`[TikTok Live] ⚠️ @${cleanUser}: ${errMsg}. Tự động thử lại sau 5s...`);
    io.emit('tiktokStatus', {
      connected: false,
      connecting: false,
      statusType,
      channel: gameState.connectedChannel,
      error: errMsg,
      msg: gameState.tiktokStatusMsg,
    });
    scheduleReconnect(5000);
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

app.post('/admin/api', (req, res) => {
  const { action, text, user, seconds, channel } = req.body || {};

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
      avatar: req.body.avatar || 'https://p16-sign-va.tiktokcdn.com/tos-maliva-avt-0068/default-avatar.jpeg',
      score: Number(req.body.score) || MILESTONE_SCORE,
      wins: Number(req.body.wins) || 30,
    };
    // Nếu bảng điểm chưa có đủ dữ liệu, tự động tạo Top 5 mẫu sinh động để kiểm thử
    if (leaderboard.size < 2) {
      leaderboard.set(demoUser.uniqueId, { ...demoUser, score: demoUser.score });
      leaderboard.set('top2_demo', { uniqueId: 'top2_demo', nickname: 'Anh Ba Miền Tây', avatar: '', score: 2800, wins: 28 });
      leaderboard.set('top3_demo', { uniqueId: 'top3_demo', nickname: 'Bé Na Chăm Học', avatar: '', score: 2500, wins: 25 });
      leaderboard.set('top4_demo', { uniqueId: 'top4_demo', nickname: 'Chiến Thần Đố Chữ', avatar: '', score: 2100, wins: 21 });
      leaderboard.set('top5_demo', { uniqueId: 'top5_demo', nickname: 'Minh Tuấn Vlog', avatar: '', score: 1800, wins: 18 });
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
      avatar: 'https://p16-sign-va.tiktokcdn.com/tos-maliva-avt-0068/default-avatar.jpeg',
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
      avatar: req.body.avatar || 'https://p16-sign-va.tiktokcdn.com/tos-maliva-avt-0068/default-avatar.jpeg',
      diamonds: totalDiamonds,
    };

    recordGiftDonation(giftUser, giftName, diamonds, repeatCount);
    if (giftHintConfig.enabled && totalDiamonds >= giftHintConfig.minDiamonds) {
      revealOneHint(giftUser, giftName, false);
    }
    if (totalDiamonds >= 10) {
      addTime(30, `${giftUser.nickname} tặng ${giftName} (+30s)`);
    }
    return res.json({ ok: true, message: `Đã kích hoạt quà tặng: ${giftUser.nickname} gửi ${giftName} (${totalDiamonds} xu)` });
  }

  if (action === 'simulateGiftHint') {
    const diamonds = Number(req.body.diamonds) || 1;
    const giftName = req.body.giftName || 'Hoa Hồng';
    const giftUser = {
      uniqueId: req.body.uniqueId || user || 'donor_hint_' + Math.floor(100 + Math.random() * 900),
      nickname: req.body.nickname || user || 'Bé Mai 🌸',
      avatar: req.body.avatar || 'https://p16-sign-va.tiktokcdn.com/tos-maliva-avt-0068/default-avatar.jpeg',
      diamonds,
    };

    recordGiftDonation(giftUser, giftName, diamonds, 1);
    const result = revealOneHint(giftUser, giftName, false);
    return res.json({
      ok: true,
      result,
      message: result?.limitReached
        ? `Đã tặng ${giftName}! ${result.message}`
        : `Đã kích hoạt quà tặng ${giftName} từ ${giftUser.nickname} mở chữ: "${result?.letter}"`
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
      avatar: req.body.avatar || 'https://p16-sign-va.tiktokcdn.com/tos-maliva-avt-0068/default-avatar.jpeg',
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
        avatar: req.body.avatar || 'https://p16-sign-va.tiktokcdn.com/tos-maliva-avt-0068/default-avatar.jpeg',
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
      avatar: req.body.avatar || 'https://p16-sign-va.tiktokcdn.com/tos-maliva-avt-0068/default-avatar.jpeg',
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

  if (action === 'simulateLike') {
    const count = Number(req.body.count || req.body.likes) || 10;
    const likeUser = {
      uniqueId: req.body.uniqueId || user || 'liker_' + Math.floor(100 + Math.random() * 900),
      nickname: req.body.nickname || user || 'Khán Giả Thả Tim',
      avatar: req.body.avatar || 'https://p16-sign-va.tiktokcdn.com/tos-maliva-avt-0068/default-avatar.jpeg',
    };
    onLikeReceived(count, likeUser);
    return res.json({
      ok: true,
      message: `Đã thả thêm +${count} tim từ ${likeUser.nickname}! (Tổng: ${likeChestState.currentLikes} tim)`,
      chestState: getLikeChestClientState(),
    });
  }

  if (action === 'triggerLikeChest') {
    const payload = triggerLikeChestOpen();
    return res.json({ ok: true, message: `Đã ép mở Rương Kho Báu #${payload.chestNumber}!`, payload });
  }

  if (action === 'updateChestConfig') {
    const newStep = Number(req.body.milestoneStep);
    if (newStep >= 10) {
      likeChestState.milestoneStep = newStep;
      likeChestConfig.milestoneStep = newStep;
      likeChestState.targetLikes = (likeChestState.chestsOpened + 1) * newStep;
    }
    io.emit('likeUpdate', {
      totalLikes: likeChestState.currentLikes,
      chestState: getLikeChestClientState(),
    });
    return res.json({ ok: true, message: `Đã cập nhật mốc mở rương: mỗi ${likeChestState.milestoneStep} tim`, chestState: getLikeChestClientState() });
  }

  if (action === 'resetLikeChest') {
    likeChestState.currentLikes = 0;
    likeChestState.chestLikes = 0;
    likeChestState.chestsOpened = 0;
    likeChestState.lastChestOpened = null;
    gameState.totalLikes = 0;
    io.emit('likeUpdate', {
      totalLikes: 0,
      chestState: getLikeChestClientState(),
    });
    return res.json({ ok: true, message: 'Đã reset toàn bộ tiến độ Rương Kho Báu về 0 tim' });
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

  if (action === 'setChannel') {
    if (channel) {
      TIKTOK_USERNAME = channel.trim();
      if (req.body.sessionId !== undefined) {
        TIKTOK_SESSION_ID = String(req.body.sessionId).trim();
      }
      connectTikTokLive(TIKTOK_USERNAME);
      return res.json({ ok: true, channel: gameState.connectedChannel, message: `Đang kết nối sang kênh ${gameState.connectedChannel}` });
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

  if (action === 'toggleTts') {
    gameState.ttsEnabled = (req.body.ttsEnabled !== undefined) ? !!req.body.ttsEnabled : !gameState.ttsEnabled;
    io.emit('ttsConfig', { ttsEnabled: gameState.ttsEnabled });
    return res.json({ ok: true, ttsEnabled: gameState.ttsEnabled, message: `Giọng đọc đã ${gameState.ttsEnabled ? 'BẬT' : 'TẮT'}` });
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

// Process Clean Up
function cleanupProcess() {
  if (tiktokConn) {
    try {
      tiktokConn.disconnect();
    } catch (e) {}
  }
  process.exit(0);
}
process.on('SIGINT', cleanupProcess);
process.on('SIGTERM', cleanupProcess);

// Start Server & Initial Round
server.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`🎮 Game "Vua Tiếng Việt" - TikTok Live Interactive`);
  console.log(`📍 Web Display: http://localhost:${PORT}`);
  console.log(`⚙️ Streamer Admin: http://localhost:${PORT}/admin.html`);
  console.log(`📡 Kênh TikTok mục tiêu: ${gameState.connectedChannel}`);
  console.log(`====================================================`);

  startNewRound();
  connectTikTokLive(TIKTOK_USERNAME);
});
