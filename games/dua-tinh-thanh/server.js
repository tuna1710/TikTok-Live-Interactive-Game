require('dotenv').config();
const path = require('path');
const http = require('http');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const { TikTokLiveConnection, WebcastEvent, ControlEvent } = require('tiktok-live-connector');

const PORT = Number(process.env.PORT) || 3003;
let TIKTOK_USERNAME = process.env.TIKTOK_USERNAME || '@vuatiengviet171095';
let TIKTOK_SESSION_ID = process.env.TIKTOK_SESSION_ID || '';
let tiktokConn = null;

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// ==========================================
// CẤU HÌNH LÀN ĐUA 5 TỈNH THÀNH ĐẠI DIỆN
// ==========================================
const DEFAULT_LANES = [
  {
    id: 0,
    name: 'Hà Nội',
    flag: '🇻🇳',
    mascot: '🐉',
    sub: 'Thủ Đô Ngàn Năm',
    color: '#EF4444',
    aliases: ['1', 'hn', 'hanoi', 'ha noi', 'thu do']
  },
  {
    id: 1,
    name: 'TP. Hồ Chí Minh',
    flag: '🏙️',
    mascot: '🐯',
    sub: 'Sài Gòn Hoa Lệ',
    color: '#F97316',
    aliases: ['2', 'sg', 'saigon', 'sai gon', 'tphcm', 'hcm']
  },
  {
    id: 2,
    name: 'Đà Nẵng',
    flag: '🌊',
    mascot: '🐬',
    sub: 'Thành Phố Đáng Sống',
    color: '#00B4D8',
    aliases: ['3', 'dn', 'danang', 'da nang', 'mientrung']
  },
  {
    id: 3,
    name: 'Hải Phòng',
    flag: '⚓',
    mascot: '🦅',
    sub: 'Thành Phố Hoa Phượng Đỏ',
    color: '#EC4899',
    aliases: ['4', 'hp', 'haiphong', 'hai phong', 'datcang']
  },
  {
    id: 4,
    name: 'Cần Thơ',
    flag: '🌾',
    mascot: '🐊',
    sub: 'Thủ Phủ Miền Tây',
    color: '#10B981',
    aliases: ['5', 'ct', 'cantho', 'can tho', 'mientay']
  }
];

// ==========================================
// BẢNG MAP QUÀ TẶNG TIKTOK -> TỈNH THÀNH
// ==========================================
const GIFT_TIERS = [
  {
    tier: '1_coin',
    baseDist: 18,
    gifts: [
      { name: 'Rose', viName: 'Hoa Hồng', emoji: '🌹', laneId: 0 },
      { name: 'Ice Cream Cone', viName: 'Cây Kem', emoji: '🍦', laneId: 1 },
      { name: 'Finger Heart', viName: 'Bắn Tim', emoji: '🫰', laneId: 2 },
      { name: 'Doughnut', viName: 'Bánh Rán', emoji: '🍩', laneId: 3 },
      { name: 'TikTok', viName: 'TikTok', emoji: '🎵', laneId: 4 },
      // Dự phòng quà 1 xu khác
      { name: 'GG', viName: 'Nắm Đấm', emoji: '✌️', laneId: 0 },
      { name: 'Weights', viName: 'Cục Tạ', emoji: '🏋️', laneId: 1 }
    ]
  },
  {
    tier: '5_10_coins',
    baseDist: 70,
    gifts: [
      { name: 'Hand Heart', viName: 'Thả Tim', emoji: '💖', laneId: 0 },
      { name: 'Little Crown', viName: 'Vương Miện', emoji: '👑', laneId: 1 },
      { name: 'Butterfly', viName: 'Bướm Xinh', emoji: '🦋', laneId: 2 },
      { name: 'Cap', viName: 'Mũ Lưỡi Trai', emoji: '🧢', laneId: 3 },
      { name: 'Sunglasses', viName: 'Kính Râm', emoji: '🕶️', laneId: 4 },
      { name: 'Perfume', viName: 'Nước Hoa', emoji: '💐', laneId: 2 },
      { name: 'Paper Crane', viName: 'Hạc Giấy', emoji: '🕊️', laneId: 4 }
    ]
  },
  {
    tier: '99_plus_coins',
    baseDist: 350,
    gifts: [
      { name: 'Garland', viName: 'Vòng Hoa', emoji: '🏵️' },
      { name: 'Singing Mic', viName: 'Micro', emoji: '🎤' },
      { name: 'Fireworks', viName: 'Pháo Hoa', emoji: '🎆' },
      { name: 'Star', viName: 'Ngôi Sao', emoji: '⭐' },
      { name: 'Lion', viName: 'Sư Tử', emoji: '🦁' },
      { name: 'Universe', viName: 'Vũ Trụ', emoji: '🌌' }
    ]
  }
];

// File lưu trữ lịch sử
const LEADERBOARD_FILE = path.join(__dirname, 'data', 'leaderboard.json');

function loadLeaderboard() {
  try {
    if (fs.existsSync(LEADERBOARD_FILE)) {
      return JSON.parse(fs.readFileSync(LEADERBOARD_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('[Leaderboard] Lỗi đọc file:', err.message);
  }
  return { totalRaces: 0, provinceWins: { '0': 0, '1': 0, '2': 0, '3': 0, '4': 0 }, topSupporters: [] };
}

function saveLeaderboard(data) {
  try {
    fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('[Leaderboard] Lỗi ghi file:', err.message);
  }
}

// Game State
let persistentData = loadLeaderboard();
let raceConfig = {
  finishDistance: 1000,
  chatDistance: 3,
  countdownDuration: 6, // 6 giây đếm ngược
  racingTimeout: 90,    // 90 giây tối đa
  cooldownDuration: 6,  // 6 giây nghỉ trước vòng mới
  autoRestart: true
};

let gameState = {
  raceNumber: persistentData.totalRaces + 1,
  phase: 'waiting', // 'waiting' | 'countdown' | 'racing' | 'finished' | 'cooldown'
  phaseStartedAt: Date.now(),
  phaseTimeLeft: 0,
  lanes: DEFAULT_LANES.map(l => ({
    id: l.id,
    name: l.name,
    flag: l.flag,
    mascot: l.mascot,
    sub: l.sub,
    color: l.color,
    distance: 0,
    speed: 0,
    nitroActive: false,
    supporters: {} // uniqueId -> { nickname, avatar, totalContrib }
  })),
  winner: null,
  totalLikes: 0,
  totalComments: 0,
  totalGifts: 0,
  recentEvents: [], // last 20 events
  connectedChannel: TIKTOK_USERNAME.startsWith('@') ? TIKTOK_USERNAME : '@' + TIKTOK_USERNAME,
  tiktokConnected: false,
  tiktokConnecting: false,
  tiktokStatusMsg: 'Đang khởi động...'
};

let gameLoopTimer = null;
let reconnectTimer = null;

// ==========================================
// CƠ CHẾ LOGIC ĐUA NGỰA & QUÀ TẶNG
// ==========================================

function getClientGameState() {
  return {
    raceNumber: gameState.raceNumber,
    phase: gameState.phase,
    phaseTimeLeft: gameState.phaseTimeLeft,
    finishDistance: raceConfig.finishDistance,
    lanes: gameState.lanes.map(l => ({
      id: l.id,
      name: l.name,
      flag: l.flag,
      mascot: l.mascot,
      sub: l.sub,
      color: l.color,
      distance: l.distance,
      progress: Math.min(100, Math.round((l.distance / raceConfig.finishDistance) * 100)),
      nitroActive: l.nitroActive,
      topSupporter: Object.values(l.supporters).sort((a, b) => b.totalContrib - a.totalContrib)[0] || null
    })),
    winner: gameState.winner,
    totalLikes: gameState.totalLikes,
    totalComments: gameState.totalComments,
    totalGifts: gameState.totalGifts,
    recentEvents: gameState.recentEvents.slice(0, 10),
    connectedChannel: gameState.connectedChannel,
    tiktokConnected: gameState.tiktokConnected,
    tiktokConnecting: gameState.tiktokConnecting,
    tiktokStatusMsg: gameState.tiktokStatusMsg,
    provinceWins: persistentData.provinceWins
  };
}

function resolveGiftToLane(giftName, giftId, giftValue) {
  const normName = (giftName || '').toLowerCase().trim();

  // Kiểm tra bảng map cố định
  for (const tier of GIFT_TIERS) {
    for (const g of tier.gifts) {
      if (g.name.toLowerCase() === normName || (g.viName && g.viName.toLowerCase() === normName)) {
        if (g.laneId !== undefined) {
          return { laneId: g.laneId, emoji: g.emoji, baseDist: tier.baseDist };
        }
      }
    }
  }

  // Quà lớn (>90 xu): chọn đội đang đứng áp chót để lật kèo kịch tính!
  if (giftValue >= 90) {
    const sorted = [...gameState.lanes].sort((a, b) => a.distance - b.distance);
    const comebackLane = sorted[1] || sorted[0];
    return { laneId: comebackLane.id, emoji: '🚀', baseDist: 350 };
  }

  // Quà tầm trung (5 - 89 xu): map theo giftId mod 5
  if (giftValue >= 5) {
    const laneId = Math.abs(giftId || 0) % gameState.lanes.length;
    return { laneId, emoji: '⚡', baseDist: 70 };
  }

  // Quà nhỏ 1 xu fallback
  const laneId = Math.abs(giftId || 0) % gameState.lanes.length;
  return { laneId, emoji: '🎁', baseDist: 20 };
}

function resolveChatToLane(comment) {
  if (!comment) return -1;
  const norm = comment.toLowerCase().trim();

  for (const lane of DEFAULT_LANES) {
    for (const alias of lane.aliases) {
      if (norm === alias || norm.startsWith(alias + ' ') || norm.endsWith(' ' + alias)) {
        return lane.id;
      }
    }
  }
  return -1;
}

function addRecentEvent(evt) {
  evt.id = Date.now() + Math.random().toString(36).substring(2, 6);
  gameState.recentEvents.unshift(evt);
  if (gameState.recentEvents.length > 30) {
    gameState.recentEvents.pop();
  }
  io.emit('newEvent', evt);
}

function setPhase(nextPhase) {
  gameState.phase = nextPhase;
  gameState.phaseStartedAt = Date.now();

  if (nextPhase === 'countdown') {
    gameState.phaseTimeLeft = raceConfig.countdownDuration;
    console.log(`[Đua Tỉnh Thành] ⏳ Chuẩn bị xuất phát: Vòng ${gameState.raceNumber}!`);
  } else if (nextPhase === 'racing') {
    gameState.phaseTimeLeft = raceConfig.racingTimeout;
    console.log(`[Đua Tỉnh Thành] 🏁 CUỘC ĐUA BẮT ĐẦU!`);
  } else if (nextPhase === 'finished') {
    gameState.phaseTimeLeft = 8;
    console.log(`[Đua Tỉnh Thành] 🏆 Tỉnh thành chiến thắng: ${gameState.winner?.name}!`);
  } else if (nextPhase === 'cooldown') {
    gameState.phaseTimeLeft = raceConfig.cooldownDuration;
    console.log(`[Đua Tỉnh Thành] ☕ Nghỉ ngơi trước chặng đua kế tiếp...`);
  } else if (nextPhase === 'waiting') {
    gameState.phaseTimeLeft = 0;
    console.log(`[Đua Tỉnh Thành] 🏇 Đang chờ người xem comment/tặng quà để xuất phát!`);
  }

  io.emit('phaseChange', {
    phase: gameState.phase,
    timeLeft: gameState.phaseTimeLeft,
    winner: gameState.winner
  });
}

function startCountdown() {
  if (gameState.phase === 'waiting') {
    setPhase('countdown');
  }
}

function checkFinish() {
  if (gameState.phase !== 'racing') return;

  for (const lane of gameState.lanes) {
    if (lane.distance >= raceConfig.finishDistance) {
      finishRace(lane);
      return;
    }
  }
}

function finishRace(winningLane) {
  gameState.winner = {
    id: winningLane.id,
    name: winningLane.name,
    flag: winningLane.flag,
    mascot: winningLane.mascot,
    sub: winningLane.sub,
    color: winningLane.color,
    distance: winningLane.distance,
    topSupporters: Object.values(winningLane.supporters)
      .sort((a, b) => b.totalContrib - a.totalContrib)
      .slice(0, 3)
  };

  // Cập nhật thống kê
  persistentData.totalRaces++;
  persistentData.provinceWins[winningLane.id] = (persistentData.provinceWins[winningLane.id] || 0) + 1;
  saveLeaderboard(persistentData);

  setPhase('finished');
}

function resetRace() {
  gameState.raceNumber = persistentData.totalRaces + 1;
  gameState.winner = null;
  gameState.lanes.forEach(lane => {
    lane.distance = 0;
    lane.speed = 0;
    lane.nitroActive = false;
    lane.supporters = {};
  });
  setPhase('waiting');
  io.emit('stateUpdate', getClientGameState());
}

// Tick loop: cập nhật đồng hồ và hiệu ứng
setInterval(() => {
  if (gameState.phase === 'countdown') {
    gameState.phaseTimeLeft--;
    io.emit('timerTick', { timeLeft: gameState.phaseTimeLeft });
    if (gameState.phaseTimeLeft <= 0) {
      setPhase('racing');
    }
  } else if (gameState.phase === 'racing') {
    gameState.phaseTimeLeft--;
    io.emit('timerTick', { timeLeft: gameState.phaseTimeLeft });

    // Hết giờ thi đấu failsafe: chọn đội đang chạy xa nhất
    if (gameState.phaseTimeLeft <= 0) {
      const sorted = [...gameState.lanes].sort((a, b) => b.distance - a.distance);
      finishRace(sorted[0]);
    }
  } else if (gameState.phase === 'finished') {
    gameState.phaseTimeLeft--;
    if (gameState.phaseTimeLeft <= 0) {
      setPhase('cooldown');
    }
  } else if (gameState.phase === 'cooldown') {
    gameState.phaseTimeLeft--;
    if (gameState.phaseTimeLeft <= 0) {
      if (raceConfig.autoRestart) {
        resetRace();
        startCountdown();
      } else {
        resetRace();
      }
    }
  }
}, 1000);

// ==========================================
// XỬ LÝ SỰ KIỆN TIKTOK (GIFT, COMMENT, LIKE)
// ==========================================

function handleGiftEvent(user, giftName, giftId, giftValue, repeatCount = 1) {
  gameState.totalGifts += repeatCount;
  const mapping = resolveGiftToLane(giftName, giftId, giftValue);
  const lane = gameState.lanes[mapping.laneId];
  if (!lane) return;

  // Tính khoảng cách tăng tốc
  const totalDist = mapping.baseDist * repeatCount;
  lane.distance = Math.min(raceConfig.finishDistance, lane.distance + totalDist);

  // Kích hoạt hiệu ứng Nitro tia lửa
  lane.nitroActive = true;
  setTimeout(() => { lane.nitroActive = false; }, 2500);

  // Ghi nhận bảng vàng nhà tài trợ
  const existing = lane.supporters[user.uniqueId];
  if (existing) {
    existing.totalContrib += totalDist;
  } else {
    lane.supporters[user.uniqueId] = {
      uniqueId: user.uniqueId,
      nickname: user.nickname || user.uniqueId,
      avatar: user.avatar || '',
      totalContrib: totalDist
    };
  }

  addRecentEvent({
    type: 'gift',
    uniqueId: user.uniqueId,
    nickname: user.nickname || user.uniqueId,
    avatar: user.avatar || '',
    giftName: giftName || 'Quà',
    giftEmoji: mapping.emoji,
    repeatCount,
    laneName: lane.name,
    laneFlag: lane.flag,
    laneColor: lane.color,
    distance: totalDist
  });

  // Tự động kích hoạt đếm ngược nếu đang ở waiting
  if (gameState.phase === 'waiting') {
    startCountdown();
  }

  // Kiểm tra thắng
  if (gameState.phase === 'racing') {
    checkFinish();
  }

  io.emit('laneBoost', {
    laneId: lane.id,
    distance: lane.distance,
    progress: Math.min(100, Math.round((lane.distance / raceConfig.finishDistance) * 100)),
    addedDist: totalDist,
    user: user.nickname,
    avatar: user.avatar,
    giftEmoji: mapping.emoji
  });
}

function handleCommentEvent(user, comment) {
  gameState.totalComments++;
  const laneId = resolveChatToLane(comment);

  if (laneId >= 0) {
    const lane = gameState.lanes[laneId];
    const addDist = raceConfig.chatDistance;
    lane.distance = Math.min(raceConfig.finishDistance, lane.distance + addDist);

    const existing = lane.supporters[user.uniqueId];
    if (existing) {
      existing.totalContrib += addDist;
    } else {
      lane.supporters[user.uniqueId] = {
        uniqueId: user.uniqueId,
        nickname: user.nickname || user.uniqueId,
        avatar: user.avatar || '',
        totalContrib: addDist
      };
    }

    addRecentEvent({
      type: 'vote',
      uniqueId: user.uniqueId,
      nickname: user.nickname || user.uniqueId,
      avatar: user.avatar || '',
      comment,
      laneName: lane.name,
      laneFlag: lane.flag,
      laneColor: lane.color,
      distance: addDist
    });

    if (gameState.phase === 'waiting') {
      startCountdown();
    }

    if (gameState.phase === 'racing') {
      checkFinish();
    }

    io.emit('laneMove', {
      laneId: lane.id,
      distance: lane.distance,
      progress: Math.min(100, Math.round((lane.distance / raceConfig.finishDistance) * 100)),
      addedDist: addDist
    });
  } else {
    // Comment thông thường
    addRecentEvent({
      type: 'chat',
      uniqueId: user.uniqueId,
      nickname: user.nickname || user.uniqueId,
      avatar: user.avatar || '',
      comment
    });
  }
}

function handleLikeEvent(user, likeCount) {
  gameState.totalLikes += likeCount;

  // Thả tim đủ 100 lần -> mini buff ngẫu nhiên cho một đội
  if (gameState.totalLikes % 80 === 0 && gameState.phase === 'racing') {
    const randomLane = gameState.lanes[Math.floor(Math.random() * gameState.lanes.length)];
    randomLane.distance = Math.min(raceConfig.finishDistance, randomLane.distance + 8);

    addRecentEvent({
      type: 'cheer',
      uniqueId: user.uniqueId,
      nickname: user.nickname || 'Khán giả',
      laneName: randomLane.name,
      laneFlag: randomLane.flag,
      likeCount
    });

    io.emit('laneMove', {
      laneId: randomLane.id,
      distance: randomLane.distance,
      progress: Math.min(100, Math.round((randomLane.distance / raceConfig.finishDistance) * 100)),
      addedDist: 8
    });
  }

  io.emit('likeUpdate', { totalLikes: gameState.totalLikes });
}

// ==========================================
// TIKTOK LIVE CONNECTOR
// ==========================================

function connectTikTok() {
  if (tiktokConn) {
    try { tiktokConn.disconnect(); } catch (_) {}
    tiktokConn = null;
  }

  gameState.tiktokConnecting = true;
  gameState.tiktokConnected = false;
  gameState.tiktokStatusMsg = `Đang kết nối tới ${TIKTOK_USERNAME}...`;
  io.emit('tiktokStatus', {
    connected: false,
    connecting: true,
    channel: gameState.connectedChannel,
    msg: gameState.tiktokStatusMsg
  });

  const cleanUser = TIKTOK_USERNAME.replace(/^@/, '');
  const connectionOptions = {
    processInitialData: true,
    fetchRoomInfoOnConnect: false,
    enableExtendedGiftInfo: false,
  };
  if (TIKTOK_SESSION_ID) {
    connectionOptions.sessionId = TIKTOK_SESSION_ID;
  }
  if (process.env.EULER_API_KEY) {
    connectionOptions.signApiKey = process.env.EULER_API_KEY;
  }

  tiktokConn = new TikTokLiveConnection(cleanUser, connectionOptions);

  tiktokConn.connect()
    .then(state => {
      gameState.tiktokConnecting = false;
      gameState.tiktokConnected = true;
      gameState.tiktokStatusMsg = `Đã kết nối thành công phòng Live: ${cleanUser}`;
      console.log(`[TikTok Live] ✅ Đã kết nối phòng: ${cleanUser} (Room ID: ${state.roomId})`);

      io.emit('tiktokStatus', {
        connected: true,
        connecting: false,
        channel: gameState.connectedChannel,
        msg: gameState.tiktokStatusMsg
      });
    })
    .catch(err => {
      gameState.tiktokConnecting = false;
      gameState.tiktokConnected = false;
      const errMsg = err?.message || String(err);

      if (/Business plan|euler/i.test(errMsg)) {
        gameState.tiktokStatusMsg = `Kênh @${cleanUser} chưa lên sóng Live (hoặc EulerStream đang giới hạn). Hãy bấm BẮT ĐẦU PHÁT LIVE trên TikTok để kết nối.`;
      } else if (/isn't online|offline/i.test(errMsg)) {
        gameState.tiktokStatusMsg = `Kênh @${cleanUser} hiện chưa phát Live. Tự động kết nối lại sau 10s...`;
      } else {
        gameState.tiktokStatusMsg = `Lỗi kết nối: ${errMsg}. Thử lại sau 10s...`;
      }
      console.warn(`[TikTok Live] ⚠️ ${gameState.tiktokStatusMsg}`);

      io.emit('tiktokStatus', {
        connected: false,
        connecting: false,
        channel: gameState.connectedChannel,
        msg: gameState.tiktokStatusMsg
      });

      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connectTikTok, 10000);
    });

  tiktokConn.on(WebcastEvent.CHAT, data => {
    const user = {
      uniqueId: data.uniqueId,
      nickname: data.nickname || data.uniqueId,
      avatar: data.profilePictureUrl || ''
    };
    handleCommentEvent(user, data.comment);
  });

  tiktokConn.on(WebcastEvent.GIFT, data => {
    const user = {
      uniqueId: data.uniqueId,
      nickname: data.nickname || data.uniqueId,
      avatar: data.profilePictureUrl || ''
    };
    const repeatCount = data.gift?.repeat_count || data.repeatCount || 1;
    const giftValue = data.diamondCount || (data.gift?.diamond_count) || 1;
    handleGiftEvent(user, data.giftName, data.giftId, giftValue, repeatCount);
  });

  tiktokConn.on(WebcastEvent.LIKE, data => {
    const user = {
      uniqueId: data.uniqueId,
      nickname: data.nickname || data.uniqueId,
      avatar: data.profilePictureUrl || ''
    };
    handleLikeEvent(user, data.likeCount || 1);
  });

  tiktokConn.on(WebcastEvent.DISCONNECTED, () => {
    gameState.tiktokConnected = false;
    gameState.tiktokStatusMsg = 'Mất kết nối với TikTok Live. Đang tự kết nối lại...';
    io.emit('tiktokStatus', {
      connected: false,
      connecting: true,
      channel: gameState.connectedChannel,
      msg: gameState.tiktokStatusMsg
    });

    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectTikTok, 8000);
  });
}

// ==========================================
// REST API & SOCKET.IO
// ==========================================

app.get('/api/state', (req, res) => {
  res.json(getClientGameState());
});

app.get('/api/leaderboard', (req, res) => {
  res.json(persistentData);
});

// Endpoint Admin
app.post('/api/admin/start', (req, res) => {
  if (gameState.phase === 'waiting' || gameState.phase === 'cooldown') {
    startCountdown();
  }
  res.json({ success: true, phase: gameState.phase });
});

app.post('/api/admin/reset', (req, res) => {
  resetRace();
  res.json({ success: true });
});

app.post('/api/admin/config', (req, res) => {
  const { finishDistance, chatDistance, autoRestart } = req.body;
  if (finishDistance) raceConfig.finishDistance = Number(finishDistance);
  if (chatDistance) raceConfig.chatDistance = Number(chatDistance);
  if (autoRestart !== undefined) raceConfig.autoRestart = Boolean(autoRestart);
  io.emit('configUpdate', raceConfig);
  res.json({ success: true, config: raceConfig });
});

app.post('/api/admin/connect', (req, res) => {
  const { username, sessionId } = req.body;
  if (username) {
    TIKTOK_USERNAME = username.startsWith('@') ? username : '@' + username;
    gameState.connectedChannel = TIKTOK_USERNAME;
  }
  if (sessionId !== undefined) {
    TIKTOK_SESSION_ID = sessionId;
  }
  connectTikTok();
  res.json({ success: true, channel: gameState.connectedChannel });
});

// Giả lập sự kiện để Streamer test offline
app.post('/api/admin/simulate', (req, res) => {
  const { type, laneId, giftName, count, comment, nickname } = req.body;
  const user = {
    uniqueId: 'test_' + Math.floor(Math.random() * 1000),
    nickname: nickname || 'Fan Hâm Mộ',
    avatar: 'https://p16-sign-va.tiktokcdn.com/tos-maliva-avt-0068/default-avatar.jpeg'
  };

  if (type === 'gift') {
    const giftMap = {
      'rose': { name: 'Rose', id: 5655, val: 1 },
      'icecream': { name: 'Ice Cream Cone', id: 5827, val: 1 },
      'heart': { name: 'Finger Heart', id: 5487, val: 1 },
      'donut': { name: 'Doughnut', id: 5742, val: 1 },
      'tiktok': { name: 'TikTok', id: 5269, val: 1 },
      'crown': { name: 'Little Crown', id: 5312, val: 5 },
      'rocket': { name: 'Fireworks', id: 6012, val: 100 }
    };
    const g = giftMap[giftName] || giftMap['rose'];
    handleGiftEvent(user, g.name, g.id, g.val, Number(count) || 1);
  } else if (type === 'comment') {
    handleCommentEvent(user, comment || String((Number(laneId) || 0) + 1));
  } else if (type === 'like') {
    handleLikeEvent(user, Number(count) || 15);
  }

  res.json({ success: true });
});

io.on('connection', socket => {
  socket.emit('init', getClientGameState());
});

// Khởi chạy server
server.listen(PORT, () => {
  console.log(`\n================================================================`);
  console.log(`🏇 SERVER GAME ĐUA TỈNH THÀNH (HORSE & PROVINCE RACE)`);
  console.log(`📡 Cổng: http://localhost:${PORT}`);
  console.log(`🎛️ Trang Quản Trị Admin: http://localhost:${PORT}/admin.html`);
  console.log(`🎯 Kênh TikTok Live đích: ${gameState.connectedChannel}`);
  console.log(`================================================================\n`);
  connectTikTok();
});
