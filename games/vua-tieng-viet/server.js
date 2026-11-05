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
const MILESTONE_SCORE = Number(process.env.MILESTONE_SCORE) || 2000;
const MILESTONE_DURATION = Number(process.env.MILESTONE_DURATION) || 60; // 60 giây vinh danh cho khán giả chụp màn hình
const leaderboard = new Map();      // uniqueId -> { uniqueId, nickname, avatar, score, wins, milestones }
const donorLeaderboard = new Map(); // uniqueId -> { uniqueId, nickname, avatar, diamonds, giftsCount, lastGiftName, lastGiftTime }
let recentGuesses = [];             // last 15 guesses

function endMilestoneAndResetLeaderboard() {
  if (nextRoundTimer) {
    clearTimeout(nextRoundTimer);
    nextRoundTimer = null;
  }
  isCelebratingMilestone = false;
  activeMilestone = null;
  console.log('🔄 [Vinh Danh Hoàn Tất] Reset bảng top điểm (giữ nguyên bảng tấm lòng vàng)! Bắt đầu chặng đua mới.');

  // Reset bảng điểm (không reset bảng tấm lòng vàng / donorLeaderboard)
  leaderboard.clear();
  io.emit('leaderboardReset', []);
  io.emit('milestoneEnd');
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
    donorLeaderboard: getDonorLeaderboardList(),
  };

  io.emit('donorUpdate', payload);
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

    // Cộng điểm Leaderboard
    const key = user.uniqueId;
    const existing = leaderboard.get(key) || {
      uniqueId: user.uniqueId,
      nickname: user.nickname || user.uniqueId,
      avatar: user.avatar || '',
      score: 0,
      wins: 0,
      milestones: [],
    };
    if (!existing.milestones) existing.milestones = [];
    existing.score += 100;
    existing.wins += 1;
    leaderboard.set(key, existing);

    gameState.lastWinner = {
      uniqueId: user.uniqueId,
      nickname: user.nickname || user.uniqueId,
      avatar: user.avatar || '',
      points: 100,
      word: target,
    };

    console.log(`🏆 NGƯỜI CHIẾN THẮNG: ${existing.nickname} (+100 điểm, Tổng: ${existing.score}đ)`);

    const winnerName = user.nickname || user.uniqueId;
    const ttsText = `Chúc mừng ${winnerName} đã xuất sắc đoán đúng đáp án: ${target}!`;

    io.emit('roundWon', {
      winner: gameState.lastWinner,
      word: target,
      leaderboard: getLeaderboardList(),
      ttsText,
    });

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

function revealOneHint(donor = null, giftName = '') {
  if (gameState.roundState !== 'PLAYING' || !gameState.currentWord) return null;

  const rawChars = gameState.currentWord.word.split('');
  const unrevealedIndices = [];

  rawChars.forEach((ch, idx) => {
    if (ch !== ' ' && !gameState.revealedMask[idx]) {
      unrevealedIndices.push(idx);
    }
  });

  if (unrevealedIndices.length === 0) return null;

  // Pick random unrevealed index
  const pickIdx = unrevealedIndices[Math.floor(Math.random() * unrevealedIndices.length)];
  gameState.revealedMask[pickIdx] = true;

  let ttsText = '';
  if (donor && (donor.nickname || donor.uniqueId)) {
    ttsText = `Cảm ơn ${donor.nickname || donor.uniqueId} đã mở chữ ${rawChars[pickIdx]}!`;
  }

  const payload = {
    index: pickIdx,
    letter: rawChars[pickIdx],
    revealedMask: gameState.revealedMask,
    donor: donor ? (donor.nickname || donor.uniqueId) : null,
    giftName,
    ttsText,
  };

  io.emit('hintRevealed', payload);
  return payload;
}

function addTime(seconds, reason = '') {
  if (gameState.roundState !== 'PLAYING') return;
  gameState.timeLeft += seconds;
  io.emit('timeAdded', { seconds, timeLeft: gameState.timeLeft, reason });
}

function getClientGameState() {
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
    revealOneHint({ uniqueId, nickname: user, avatar }, giftName);

    if (totalDiamonds >= 10) {
      addTime(30, `${user} tặng ${giftName} (+30s)`);
    }
  });

  tiktokConn.on(WebcastEvent.LIKE, (data) => {
    const count = Number(data?.count || data?.likeCount || 1);
    gameState.totalLikes += count;
    io.emit('likeUpdate', { totalLikes: gameState.totalLikes });

    if (gameState.totalLikes % 50 === 0) {
      addTime(10, 'Cộng đồng thả 50 tim (+10s)');
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
      wins: Number(req.body.wins) || 20,
    };
    // Nếu bảng điểm chưa có đủ dữ liệu, tự động tạo Top 5 mẫu sinh động để kiểm thử
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
    const revealed = revealOneHint({ nickname: 'Streamer' }, 'Gợi ý MC');
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
    const giftUser = {
      uniqueId: user || 'donor_demo_' + Math.floor(100 + Math.random() * 900),
      nickname: user || 'Đại Gia Hảo Tâm',
      avatar: 'https://p16-sign-va.tiktokcdn.com/tos-maliva-avt-0068/default-avatar.jpeg',
    };
    const giftName = req.body.giftName || 'Hoa Hồng';
    const diamonds = Number(req.body.diamonds) || (giftName === 'Hoa Hồng' ? 1 : 10);
    const repeatCount = Number(req.body.repeatCount) || 1;

    recordGiftDonation(giftUser, giftName, diamonds, repeatCount);
    revealOneHint(giftUser, giftName);
    if (diamonds * repeatCount >= 10) {
      addTime(30, `${giftUser.nickname} tặng ${giftName} (+30s)`);
    }
    return res.json({ ok: true, message: `Đã kích hoạt quà tặng: ${giftUser.nickname} gửi ${giftName} (${diamonds * repeatCount} xu)` });
  }

  if (action === 'resetLeaderboard') {
    leaderboard.clear();
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
