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
  connectedChannel: TIKTOK_USERNAME,
  tiktokConnected: false,
};

let timerInterval = null;
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
  if (recentWordIds.length > 20) recentWordIds.shift();
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

  // Reveal all letters
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
  if (gameState.roundState !== 'PLAYING' || !gameState.currentWord) return;

  const target = gameState.currentWord.word;
  const normTarget = normalizeAnswer(target);
  const normGuess = normalizeAnswer(text);

  const rawTargetStrip = stripVietnameseAccents(normTarget);
  const rawGuessStrip = stripVietnameseAccents(normGuess);

  const isExact = (normGuess === normTarget);
  const isUnaccentedMatch = (rawGuessStrip === rawTargetStrip && rawGuessStrip.length >= 2);
  const isCorrect = isExact || isUnaccentedMatch;

  // Add to recent guesses for live chat display
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

    // Reveal entire word
    gameState.revealedMask = target.split('').map(() => true);

    // Update Leaderboard
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
    connectedChannel: gameState.connectedChannel,
  };
}

// -------------------------------------------------------------
// TikTok Live Connector Relay
// -------------------------------------------------------------
let tiktokLiveConnection = null;

function connectTikTok(channelName) {
  const username = (channelName || TIKTOK_USERNAME).replace(/^@/, '');
  gameState.connectedChannel = '@' + username;

  if (tiktokLiveConnection) {
    try { tiktokLiveConnection.disconnect(); } catch (e) {}
  }

  tiktokLiveConnection = new WebcastPushConnection(username, {
    enableExtendedGiftInfo: true,
  });

  tiktokLiveConnection.connect()
    .then(state => {
      gameState.tiktokConnected = true;
      console.log(`[TikTok] Kết nối thành công tới phòng Live @${username} (Room ID: ${state.roomId})`);
      io.emit('tiktokStatus', { connected: true, channel: gameState.connectedChannel });
    })
    .catch(err => {
      gameState.tiktokConnected = false;
      console.warn(`[TikTok] Chưa kết nối phòng Live @${username}:`, err.message || err);
      io.emit('tiktokStatus', { connected: false, channel: gameState.connectedChannel, error: err.message });
    });

  tiktokLiveConnection.on('chat', data => {
    checkGuess(
      {
        uniqueId: data.uniqueId,
        nickname: data.nickname,
        avatar: data.profilePictureUrl,
      },
      data.comment
    );
  });

  tiktokLiveConnection.on('gift', data => {
    const giftName = data.giftName || 'Quà';
    const diamondCount = (data.diamondCount || 0) * (data.repeatCount || 1);

    // Any gift or Rose unlocks a hint letter
    revealOneHint(
      { uniqueId: data.uniqueId, nickname: data.nickname, avatar: data.profilePictureUrl },
      giftName
    );

    // If gift >= 10 diamonds, also add bonus time!
    if (diamondCount >= 10) {
      addTime(30, `${data.nickname} tặng ${giftName} (+30s)`);
    }
  });

  tiktokLiveConnection.on('like', data => {
    const count = data.likeCount || 1;
    gameState.totalLikes += count;
    io.emit('likeUpdate', { totalLikes: gameState.totalLikes });

    // Every 50 likes gives +10 seconds
    if (gameState.totalLikes % 50 === 0) {
      addTime(10, 'Cộng đồng thả 50 tim (+10s)');
    }
  });

  tiktokLiveConnection.on('disconnected', () => {
    gameState.tiktokConnected = false;
    io.emit('tiktokStatus', { connected: false, channel: gameState.connectedChannel });
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
      nickname: user || 'Khán Giả Demo',
      avatar: 'https://p16-sign-va.tiktokcdn.com/tos-maliva-avt-0068/default-avatar.jpeg',
    };
    checkGuess(testUser, text || '');
    return res.json({ ok: true, message: 'Đã gửi comment giả lập' });
  }

  if (action === 'simulateGift') {
    revealOneHint({ nickname: 'Người Hâm Mộ' }, 'Hoa Hồng Demo');
    return res.json({ ok: true, message: 'Đã kích hoạt gợi ý qua quà tặng' });
  }

  if (action === 'resetLeaderboard') {
    leaderboard.clear();
    io.emit('leaderboardReset', []);
    return res.json({ ok: true, message: 'Đã làm mới bảng xếp hạng' });
  }

  if (action === 'setChannel') {
    if (channel) {
      connectTikTok(channel);
      return res.json({ ok: true, channel: gameState.connectedChannel });
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
