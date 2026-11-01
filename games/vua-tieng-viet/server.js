const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const { WebcastPushConnection } = require('tiktok-live-connector');

const PORT = Number(process.env.PORT) || 3002;
let TIKTOK_USERNAME = process.env.TIKTOK_USERNAME || '@2166541467';
const ROUND_TIME_DEFAULT = 60;

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Load Words
const wordsData = require('./data/words.json');
let recentWordIds = [];

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
  tiktokStatusMsg: 'Đang khởi động...',
  totalCommentsReceived: 0,
};

let timerInterval = null;
let reconnectTimer = null;
const leaderboard = new Map(); // uniqueId -> { uniqueId, nickname, avatar, score, wins }
let recentGuesses = [];        // last 15 guesses

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
  if (recentWordIds.length > 25) recentWordIds.shift();
  return picked;
}

function startNewRound() {
  if (timerInterval) clearInterval(timerInterval);

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

  io.emit('roundStart', getClientGameState());

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

  io.emit('roundTimeout', {
    word: gameState.currentWord.word,
    hint: gameState.currentWord.hint,
  });

  setTimeout(() => {
    startNewRound();
  }, 5000);
}

function getLeaderboardList() {
  return Array.from(leaderboard.values())
    .sort((a, b) => b.score - a.score || b.wins - a.wins)
    .slice(0, 10);
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
    };
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

    io.emit('roundWon', {
      winner: gameState.lastWinner,
      word: target,
      leaderboard: getLeaderboardList(),
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

  // Pick random unrevealed index
  const pickIdx = unrevealedIndices[Math.floor(Math.random() * unrevealedIndices.length)];
  gameState.revealedMask[pickIdx] = true;

  const payload = {
    index: pickIdx,
    letter: rawChars[pickIdx],
    revealedMask: gameState.revealedMask,
    donor: donor ? (donor.nickname || donor.uniqueId) : null,
    giftName,
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
    recentGuesses: recentGuesses.slice(0, 8),
    tiktokConnected: gameState.tiktokConnected,
    tiktokConnecting: gameState.tiktokConnecting,
    tiktokStatusMsg: gameState.tiktokStatusMsg,
    connectedChannel: gameState.connectedChannel,
    totalCommentsReceived: gameState.totalCommentsReceived,
  };
}

// -------------------------------------------------------------
// TikTok Live Connector Relay Với Vòng Lặp Auto-Reconnect Tự Động
// -------------------------------------------------------------
let tiktokLiveConnection = null;

function scheduleReconnect(delay = 5000) {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    connectTikTok(gameState.connectedChannel);
  }, delay);
}

function connectTikTok(channelName) {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  const rawUser = (channelName || TIKTOK_USERNAME || '').trim();
  const username = rawUser.replace(/^@/, '').trim();
  if (!username) {
    console.warn('[TikTok] Username trống! Hãy cập nhật kênh TikTok trong trang Admin.');
    gameState.tiktokStatusMsg = 'Chưa thiết lập kênh TikTok';
    io.emit('tiktokStatus', { connected: false, connecting: false, channel: '', msg: gameState.tiktokStatusMsg });
    return;
  }

  gameState.connectedChannel = '@' + username;
  gameState.tiktokConnecting = true;
  gameState.tiktokStatusMsg = `Đang kết nối tới @${username}...`;

  if (tiktokLiveConnection) {
    try { tiktokLiveConnection.disconnect(); } catch (e) {}
    tiktokLiveConnection = null;
  }

  io.emit('tiktokStatus', {
    connected: false,
    connecting: true,
    channel: gameState.connectedChannel,
    msg: gameState.tiktokStatusMsg,
  });

  console.log(`[TikTok] Đang kết nối tới phòng Live @${username}...`);

  tiktokLiveConnection = new WebcastPushConnection(username, {
    enableExtendedGiftInfo: true,
    enableWebsocketUpgrade: true,
    requestPollingIntervalMs: 1000,
  });

  tiktokLiveConnection.connect()
    .then(state => {
      gameState.tiktokConnected = true;
      gameState.tiktokConnecting = false;
      gameState.tiktokStatusMsg = `Đã kết nối Live @${username} (Room ID: ${state.roomId})`;
      console.log(`[TikTok] ✅ KẾT NỐI THÀNH CÔNG phòng Live @${username} (Room ID: ${state.roomId})! Đang lắng nghe bình luận.`);
      io.emit('tiktokStatus', {
        connected: true,
        connecting: false,
        channel: gameState.connectedChannel,
        roomId: state.roomId,
        msg: gameState.tiktokStatusMsg,
      });
    })
    .catch(err => {
      gameState.tiktokConnected = false;
      gameState.tiktokConnecting = false;
      const errMsg = err.message || String(err);
      gameState.tiktokStatusMsg = `Chưa lên sóng Live @${username} (${errMsg}). Tự động dò tìm lại sau 5s...`;
      console.warn(`[TikTok] ⚠️ @${username}: ${errMsg}. Tự động thử lại sau 5 giây...`);
      io.emit('tiktokStatus', {
        connected: false,
        connecting: false,
        channel: gameState.connectedChannel,
        error: errMsg,
        msg: gameState.tiktokStatusMsg,
      });
      // Tự động thử lại sau 5 giây để ngay khi streamer bấm Live là tự bắt comment ngay!
      scheduleReconnect(5000);
    });

  tiktokLiveConnection.on('chat', data => {
    checkGuess(
      {
        uniqueId: data.uniqueId,
        nickname: data.nickname || data.uniqueId,
        avatar: data.profilePictureUrl || '',
      },
      data.comment
    );
  });

  tiktokLiveConnection.on('gift', data => {
    const giftName = data.giftName || 'Quà';
    const diamondCount = (data.diamondCount || 0) * (data.repeatCount || 1);
    console.log(`[Quà tặng] ${data.nickname} gửi ${giftName} (${diamondCount} xu)`);

    revealOneHint(
      { uniqueId: data.uniqueId, nickname: data.nickname, avatar: data.profilePictureUrl },
      giftName
    );

    if (diamondCount >= 10) {
      addTime(30, `${data.nickname} tặng ${giftName} (+30s)`);
    }
  });

  tiktokLiveConnection.on('like', data => {
    const count = data.likeCount || 1;
    gameState.totalLikes += count;
    io.emit('likeUpdate', { totalLikes: gameState.totalLikes });

    if (gameState.totalLikes % 50 === 0) {
      addTime(10, 'Cộng đồng thả 50 tim (+10s)');
    }
  });

  tiktokLiveConnection.on('streamEnd', () => {
    console.log(`[TikTok] Phòng Live đã kết thúc. Tiếp tục đợi phiên phát tiếp theo...`);
    gameState.tiktokConnected = false;
    gameState.tiktokConnecting = false;
    gameState.tiktokStatusMsg = 'Phòng Live đã kết thúc. Chờ phiên mới...';
    io.emit('tiktokStatus', { connected: false, connecting: false, channel: gameState.connectedChannel, msg: gameState.tiktokStatusMsg });
    scheduleReconnect(8000);
  });

  tiktokLiveConnection.on('disconnected', () => {
    console.log(`[TikTok] Mất kết nối tới máy chủ TikTok. Đang tự động kết nối lại...`);
    gameState.tiktokConnected = false;
    gameState.tiktokConnecting = false;
    gameState.tiktokStatusMsg = 'Mất kết nối TikTok. Đang thử lại...';
    io.emit('tiktokStatus', { connected: false, connecting: false, channel: gameState.connectedChannel, msg: gameState.tiktokStatusMsg });
    scheduleReconnect(5000);
  });

  tiktokLiveConnection.on('error', err => {
    console.warn(`[TikTok Lỗi]`, err.message || err);
  });
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
      avatar: 'https://p16-sign-va.tiktokcdn.com/tos-maliva-avt-0068/default-avatar.jpeg',
    };
    checkGuess(testUser, text || '');
    return res.json({ ok: true, message: `Đã gửi comment: "${text}"` });
  }

  if (action === 'simulateGift') {
    revealOneHint({ nickname: 'Người Hâm Mộ' }, 'Hoa Hồng Demo');
    return res.json({ ok: true, message: 'Đã kích hoạt mở gợi ý qua quà tặng' });
  }

  if (action === 'resetLeaderboard') {
    leaderboard.clear();
    io.emit('leaderboardReset', []);
    return res.json({ ok: true, message: 'Đã làm mới bảng xếp hạng' });
  }

  if (action === 'setChannel') {
    if (channel) {
      TIKTOK_USERNAME = channel.trim();
      connectTikTok(TIKTOK_USERNAME);
      return res.json({ ok: true, channel: gameState.connectedChannel, message: `Đang chuyển sang kênh ${gameState.connectedChannel}` });
    }
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

// Start Server & Initial Round
server.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`🎮 Game "Vua Tiếng Việt" - TikTok Live Interactive`);
  console.log(`📍 Web Display: http://localhost:${PORT}`);
  console.log(`⚙️ Streamer Admin: http://localhost:${PORT}/admin.html`);
  console.log(`📡 Kênh TikTok mục tiêu: ${gameState.connectedChannel}`);
  console.log(`====================================================`);

  startNewRound();
  connectTikTok(TIKTOK_USERNAME);
});
