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
const ROUND_TIME_DEFAULT = 60;

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

// Load Words
const wordsData = require('./data/words.json');
let recentWordIds = [];

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
};

let timerInterval = null;
let reconnectTimer = null;
const leaderboard = new Map();
const donorLeaderboard = new Map();
let recentGuesses = [];

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
    nickname: user.nickname || 'Nhà Hảo Tâm',
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

function pickNextWord() {
  const available = wordsData.filter(w => !recentWordIds.includes(w.id));
  const pool = available.length > 0 ? available : wordsData;
  const picked = pool[Math.floor(Math.random() * pool.length)];
  recentWordIds.push(picked.id);
  if (recentWordIds.length > 100) recentWordIds.shift();
  return picked;
}

function startNewRound() {
  if (timerInterval) clearInterval(timerInterval);

  const wordObj = pickNextWord();
  const rawChars = wordObj.word.split('');
  const nonSpaces = rawChars.filter(c => c !== ' ');
  let scrambled = shuffle(nonSpaces);

  if (scrambled.join('') === nonSpaces.join('') && scrambled.length > 1) {
    scrambled.reverse();
  }

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

  setTimeout(() => {
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

    const key = user.uniqueId;
    const existing = leaderboard.get(key) || {
      uniqueId: user.uniqueId,
      nickname: user.nickname || 'Khán Giả',
      avatar: user.avatar || '',
      score: 0,
      wins: 0,
    };
    existing.score += 100;
    existing.wins += 1;
    leaderboard.set(key, existing);

    gameState.lastWinner = {
      uniqueId: user.uniqueId,
      nickname: user.nickname || 'Khán Giả',
      avatar: user.avatar || '',
      points: 100,
      word: target,
    };

    console.log(`🏆 CHIẾN THẮNG: ${existing.nickname} (+100 điểm, Tổng: ${existing.score}đ)`);

    const winnerName = user.nickname || 'bạn';
    const ttsText = `Chúc mừng ${winnerName} đã xuất sắc đoán đúng đáp án: ${target}!`;

    io.emit('roundWon', {
      winner: gameState.lastWinner,
      word: target,
      leaderboard: getLeaderboardList(),
      ttsText,
    });

    setTimeout(() => {
      startNewRound();
    }, 5000);
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
    wordLength: gameState.currentWord?.word ? gameState.currentWord.word.length : 0,
    targetPattern: (gameState.currentWord?.word || '').split('').map((ch, idx) => ({
      char: gameState.revealedMask[idx] ? ch : '',
      isSpace: ch === ' ',
      isRevealed: !!gameState.revealedMask[idx],
    })),
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
    recentGuesses,
    lastWinner: gameState.lastWinner,
    ttsEnabled: gameState.ttsEnabled,
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
      const user = {
        uniqueId: chatItem.author?.channelId || 'yt_' + Date.now(),
        nickname: chatItem.author?.name || 'Khán Giả YouTube',
        avatar: chatItem.author?.thumbnail?.url || 'https://www.gstatic.com/youtube/img/creator/avatar/default_avatar.svg',
      };

      const messageText = (chatItem.message || []).map(m => m.text || '').join('').trim();
      if (messageText) {
        checkGuess(user, messageText);
      }

      if (chatItem.superchat) {
        const amount = chatItem.superchat.amount || 'SuperChat';
        console.log(`[YouTube SuperChat] ${user.nickname} gửi ${amount}`);
        recordGiftDonation(user, `Super Chat (${amount})`, 10, 1);
        revealOneHint(user, `Super Chat (${amount})`);
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

app.post('/admin/api', (req, res) => {
  const { action, text, user, seconds, channel, liveId } = req.body || {};

  if (action === 'skip') {
    startNewRound();
    return res.json({ ok: true, message: 'Đã chuyển sang câu tiếp theo' });
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
      avatar: 'https://www.gstatic.com/youtube/img/creator/avatar/default_avatar.svg',
    };
    checkGuess(testUser, text || '');
    return res.json({ ok: true, message: `Đã gửi comment: "${text}"` });
  }

  if (action === 'simulateGift') {
    const giftUser = {
      uniqueId: user || 'donor_demo_' + Math.floor(100 + Math.random() * 900),
      nickname: user || 'Đại Gia Hảo Tâm',
      avatar: 'https://www.gstatic.com/youtube/img/creator/avatar/default_avatar.svg',
    };
    const giftName = req.body.giftName || 'Super Chat';
    const diamonds = Number(req.body.diamonds) || 10;
    const repeatCount = Number(req.body.repeatCount) || 1;

    recordGiftDonation(giftUser, giftName, diamonds, repeatCount);
    revealOneHint(giftUser, giftName);
    addTime(30, `${giftUser.nickname} tặng ${giftName} (+30s)`);
    return res.json({ ok: true, message: `Đã kích hoạt quà tặng: ${giftUser.nickname} gửi ${giftName}` });
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
