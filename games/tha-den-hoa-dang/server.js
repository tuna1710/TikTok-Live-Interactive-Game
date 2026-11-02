require('dotenv').config();
const path = require('path');
const http = require('http');
const https = require('https');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const { TikTokLiveConnection, WebcastEvent, ControlEvent } = require('tiktok-live-connector');

const PORT = Number(process.env.PORT) || 3004;
let TIKTOK_USERNAME = process.env.TIKTOK_USERNAME || '@2166541467';
let TIKTOK_SESSION_ID = process.env.TIKTOK_SESSION_ID || '';
let tiktokConn = null;
let reconnectTimer = null;

// Bộ nhớ chống trùng lặp tin nhắn cũ khi kết nối / reconnect
const seenMessageIds = new Set();
function isDuplicateMessage(msgId) {
  if (!msgId) return false;
  if (seenMessageIds.has(msgId)) return true;
  seenMessageIds.add(msgId);
  if (seenMessageIds.size > 1200) {
    const firstKey = seenMessageIds.values().next().value;
    seenMessageIds.delete(firstKey);
  }
  return false;
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// ==========================================
// TRẠNG THÁI HỆ THỐNG THẢ ĐÈN HOA ĐĂNG
// ==========================================
const MAX_RIVER_LANTERNS = 45; // Giữ tối đa 45 đèn trên sông để 60 FPS mượt mà
const MAX_SKY_LANTERNS = 15;

let gameState = {
  totalWishes: 0,
  totalLikes: 0,
  totalGifts: 0,
  lanterns: [],       // Đèn hoa đăng trôi trên sông
  skyLanterns: [],    // Đèn lồng Khổng Minh bay lên trời
  recentWishes: [],   // Lịch sử lời ước
  connectedChannel: TIKTOK_USERNAME.startsWith('@') ? TIKTOK_USERNAME : '@' + TIKTOK_USERNAME,
  tiktokConnected: false,
  tiktokConnecting: false,
  tiktokStatusMsg: 'Đang khởi động hệ thống...'
};

function getClientState() {
  return {
    totalWishes: gameState.totalWishes,
    totalLikes: gameState.totalLikes,
    totalGifts: gameState.totalGifts,
    lanternsCount: gameState.lanterns.length,
    recentWishes: gameState.recentWishes.slice(0, 15),
    connectedChannel: gameState.connectedChannel,
    tiktokConnected: gameState.tiktokConnected,
    tiktokConnecting: gameState.tiktokConnecting,
    tiktokStatusMsg: gameState.tiktokStatusMsg
  };
}

// ==========================================
// TẠO ĐÈN HOA ĐĂNG & ĐÈN TRỜI
// ==========================================

const LOTUS_COLORS = [
  { name: 'Hồng Phấn Cát Tường', petal: '#f472b6', inner: '#fbcfe8', glow: 'rgba(244, 114, 182, 0.6)' },
  { name: 'Vàng Kim Tài Lộc', petal: '#fbbf24', inner: '#fef08a', glow: 'rgba(251, 191, 36, 0.7)' },
  { name: 'Đỏ Thắm Bình An', petal: '#ef4444', inner: '#fca5a5', glow: 'rgba(239, 68, 68, 0.6)' },
  { name: 'Xanh Ngọc Thanh Tịnh', petal: '#34d399', inner: '#a7f3d0', glow: 'rgba(52, 211, 153, 0.6)' },
  { name: 'Lam Ngọc An Lành', petal: '#38bdf8', inner: '#bae6fd', glow: 'rgba(56, 189, 248, 0.6)' }
];

function extractUserFromEvent(data) {
  const u = data?.user || data?.userDetails || data || {};
  const uniqueId = u.uniqueId || u.displayId || data?.uniqueId || '';
  const nickname = u.nickname || uniqueId || data?.nickname || 'Khán Giả';
  const avatar =
    u.profilePictureUrl ||
    u.avatarLarge?.urlList?.[0] ||
    u.avatarThumb?.urlList?.[0] ||
    u.avatarMedium?.urlList?.[0] ||
    data?.profilePictureUrl ||
    '';
  return { nickname, uniqueId, avatar };
}

function createLantern(user, wishText, type = 'normal', giftInfo = null) {
  gameState.totalWishes++;

  // Chọn màu sắc ngẫu nhiên hoặc màu đặc biệt nếu tặng quà
  let colorTheme = LOTUS_COLORS[Math.floor(Math.random() * LOTUS_COLORS.length)];
  let sizeScale = 1.0;

  if (type === 'gold_gift') {
    colorTheme = { name: 'Hoàng Kim Đại Lộc', petal: '#ffd700', inner: '#fffbeb', glow: 'rgba(255, 215, 0, 0.9)' };
    sizeScale = 1.35;
  } else if (type === 'royal_gift') {
    colorTheme = { name: 'Thất Bảo Cung Đình', petal: '#f43f5e', inner: '#ffd700', glow: 'rgba(244, 63, 94, 0.9)' };
    sizeScale = 1.5;
  }

  const cleanWish = (wishText || '').toString().trim() || 'Cầu bình an & vạn sự như ý';
  const lantern = {
    id: 'lan_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    uniqueId: user.uniqueId,
    nickname: user.nickname || user.uniqueId || 'Khán Giả',
    avatar: user.avatar || '',
    wishText: cleanWish,
    type,
    giftName: giftInfo?.giftName || null,
    giftEmoji: giftInfo?.giftEmoji || null,
    color: colorTheme,
    scale: sizeScale,
    // Vị trí xuất phát ngẫu nhiên ở phần trên của sông
    x: Math.random() * 0.75 + 0.12, // tỉ lệ 0.12 - 0.87
    y: Math.random() * 0.18 + 0.38, // xuất phát ở thượng lưu
    speedX: (Math.random() - 0.5) * 0.0003,
    speedY: Math.random() * 0.0004 + 0.0003, // trôi từ từ xuống hạ lưu
    life: 1.0, // thời gian tồn tại
    decayRate: 0.0004 + Math.random() * 0.0002,
    createdAt: Date.now()
  };

  gameState.lanterns.push(lantern);

  // Giới hạn số lượng đèn trôi trên sông
  if (gameState.lanterns.length > MAX_RIVER_LANTERNS) {
    gameState.lanterns.shift();
  }

  // Thêm vào danh sách ước nguyện gần đây
  gameState.recentWishes.unshift({
    id: lantern.id,
    nickname: lantern.nickname,
    avatar: lantern.avatar,
    wishText: lantern.wishText,
    type: lantern.type,
    giftName: lantern.giftName,
    time: 'Vừa xong'
  });
  if (gameState.recentWishes.length > 30) {
    gameState.recentWishes.pop();
  }

  // Phát tín hiệu Socket cho các client đang xem
  io.emit('newLantern', lantern);
  io.emit('statsUpdate', {
    totalWishes: gameState.totalWishes,
    totalLikes: gameState.totalLikes,
    totalGifts: gameState.totalGifts
  });

  return lantern;
}

function createSkyLantern(user, giftName, giftEmoji, diamondCount) {
  gameState.totalGifts++;

  const skyLantern = {
    id: 'sky_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    uniqueId: user.uniqueId,
    nickname: user.nickname || 'Đại Gia Hảo Tâm',
    avatar: user.avatar || '',
    giftName: giftName || 'Quà Lớn',
    giftEmoji: giftEmoji || '🏮',
    diamondCount: diamondCount || 99,
    x: Math.random() * 0.6 + 0.2, // vị trí xuất phát
    y: 0.75,                     // từ dưới bay lên bầu trời
    speedY: -(Math.random() * 0.0012 + 0.001),
    speedX: (Math.random() - 0.5) * 0.0004,
    life: 1.0,
    createdAt: Date.now()
  };

  gameState.skyLanterns.push(skyLantern);
  if (gameState.skyLanterns.length > MAX_SKY_LANTERNS) {
    gameState.skyLanterns.shift();
  }

  io.emit('newSkyLantern', skyLantern);
  return skyLantern;
}

// Dọn dẹp đèn hết hạn mỗi 3 giây
setInterval(() => {
  const now = Date.now();
  // Giữ đèn tối thiểu 45 giây và tối đa 3 phút
  gameState.lanterns = gameState.lanterns.filter(l => now - l.createdAt < 180000);
  gameState.skyLanterns = gameState.skyLanterns.filter(l => now - l.createdAt < 75000);
}, 3000);

// ==========================================
// KẾT NỐI TIKTOK LIVE VỚI THIẾT LẬP AN TOÀN
// ==========================================

function connectTikTok() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (tiktokConn) {
    try {
      tiktokConn.removeAllListeners();
      tiktokConn.disconnect();
    } catch (_) {}
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

  const cleanUser = TIKTOK_USERNAME.replace(/^@/, '').trim();
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

  tiktokConn.on(ControlEvent.CONNECTED, state => {
    gameState.tiktokConnecting = false;
    gameState.tiktokConnected = true;
    const roomId = state?.roomId || tiktokConn?.roomId || '';
    gameState.tiktokStatusMsg = `Đã kết nối thành công phòng Live: ${cleanUser} (Room ID: ${roomId})`;
    console.log(`[Thả Đèn Hoa Đăng] ✅ ${gameState.tiktokStatusMsg}`);

    io.emit('tiktokStatus', {
      connected: true,
      connecting: false,
      channel: gameState.connectedChannel,
      msg: gameState.tiktokStatusMsg
    });
  });

  tiktokConn.on(ControlEvent.DISCONNECTED, reason => {
    gameState.tiktokConnecting = true;
    gameState.tiktokConnected = false;
    gameState.tiktokStatusMsg = `Mất kết nối TikTok (@${cleanUser}). Đang tự động kết nối lại...`;
    console.warn(`[Thả Đèn Hoa Đăng] ⚠️ Mất kết nối phòng @${cleanUser}:`, reason?.reason || reason || '');

    io.emit('tiktokStatus', {
      connected: false,
      connecting: true,
      channel: gameState.connectedChannel,
      msg: gameState.tiktokStatusMsg
    });

    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectTikTok, 5000);
  });

  tiktokConn.on(ControlEvent.ERROR, err => {
    const errMsg = err?.message || String(err);
    console.warn(`[Thả Đèn Hoa Đăng] ⚠️ Lỗi Socket TikTok:`, errMsg);
  });

  tiktokConn.connect()
    .then(state => {
      gameState.tiktokConnecting = false;
      gameState.tiktokConnected = true;
      gameState.tiktokStatusMsg = `Đã kết nối thành công phòng Live: ${cleanUser}`;
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
      console.warn(`[Thả Đèn Hoa Đăng] ⚠️ ${gameState.tiktokStatusMsg}`);

      io.emit('tiktokStatus', {
        connected: false,
        connecting: false,
        channel: gameState.connectedChannel,
        msg: gameState.tiktokStatusMsg
      });

      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connectTikTok, 10000);
    });

  // Khán giả bình luận -> Tự động thả đèn hoa đăng mang lời ước
  tiktokConn.on(WebcastEvent.CHAT, data => {
    const { nickname, uniqueId, avatar } = extractUserFromEvent(data);
    const rawWish = (data?.content || data?.comment || '').toString().trim();
    const wish = rawWish || 'Cầu bình an & vạn sự như ý';

    // Bỏ qua tin nhắn trùng lặp khi vừa kết nối / reconnect
    const msgId = data?.msgId || (uniqueId + '_' + wish);
    if (isDuplicateMessage(msgId)) {
      return;
    }

    console.log(`[Bình luận / Lời ước] ${nickname} (${uniqueId}): "${wish}"`);
    createLantern({ uniqueId, nickname, avatar }, wish, 'normal');
  });

  // Khán giả tặng quà -> Thả Đèn Sen Vàng Hoàng Kim hoặc Đèn Khổng Minh
  tiktokConn.on(WebcastEvent.GIFT, data => {
    const { nickname, uniqueId, avatar } = extractUserFromEvent(data);
    const giftObj = data?.gift || data?.giftDetails || {};
    const giftName = giftObj?.name || data?.giftName || data?.describe || 'Hoa Hồng';
    const diamondCount = Number(giftObj?.diamondCount || giftObj?.diamond_count || data?.diamondCount || 1);
    const repeatCount = Math.max(1, Number(data?.repeatCount || data?.comboCount || 1));
    const totalCoins = diamondCount * repeatCount;

    const giftMsgId = data?.msgId || (uniqueId + '_' + giftName + '_' + repeatCount);
    if (isDuplicateMessage(giftMsgId)) {
      return;
    }

    console.log(`[Quà Tặng] ${nickname} gửi ${giftName} x${repeatCount} (${totalCoins} xu)`);

    // Phát sự kiện Cảm Ơn Quà Tặng lên màn hình Stream & Giọng đọc AI
    io.emit('giftThankYou', {
      uniqueId,
      nickname,
      avatar,
      giftName,
      repeatCount,
      totalCoins
    });

    const userObj = { uniqueId, nickname, avatar };
    if (totalCoins >= 99) {
      // Quà lớn: Thả Đèn Lồng Khổng Minh bay lên bầu trời sao
      createSkyLantern(userObj, giftName, '🏮', totalCoins);
    } else if (totalCoins >= 10) {
      // Quà trung: Đèn Hoa Sen Thất Bảo rực rỡ
      createLantern(userObj, `Kính cúng dường ${giftName} (${totalCoins} xu)`, 'royal_gift', { giftName, giftEmoji: '✨' });
    } else {
      // Quà 1-9 xu: Đèn Hoa Sen Hoàng Kim đại lộc
      createLantern(userObj, `Kính tặng ${giftName} cầu tài lộc`, 'gold_gift', { giftName, giftEmoji: '🌹' });
    }
  });

  // Thả tim
  tiktokConn.on(WebcastEvent.LIKE, data => {
    const count = Number(data.likeCount || 1);
    gameState.totalLikes += count;

    if (gameState.totalLikes % 40 === 0) {
      io.emit('riverSparkle', { count: 12 });
    }
    io.emit('statsUpdate', {
      totalWishes: gameState.totalWishes,
      totalLikes: gameState.totalLikes,
      totalGifts: gameState.totalGifts
    });
  });
}

// ==========================================
// REST API & ADMIN CONTROLS
// ==========================================

// Endpoint Proxy TTS (Google Translate TTS tiếng Việt)
// Loại bỏ lỗi CORS và 404 do Referer header từ trình duyệt
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
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*'
    });
    gRes.pipe(res);
  }).on('error', (err) => {
    console.error('[TTS Proxy Error]', err.message);
    if (!res.headersSent) {
      res.status(500).send('TTS proxy request failed');
    }
  });
});

app.get('/api/state', (req, res) => {
  res.json(getClientState());
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

app.post('/api/admin/clear', (req, res) => {
  gameState.lanterns = [];
  gameState.skyLanterns = [];
  io.emit('clearAll');
  res.json({ success: true });
});

// Giả lập sự kiện để Streamer Test Offline
app.post('/api/admin/simulate', (req, res) => {
  const { type, nickname, wish, giftType } = req.body;
  const user = {
    uniqueId: 'test_' + Math.floor(Math.random() * 1000),
    nickname: nickname || 'Phật Tử Tâm Thiện',
    avatar: 'https://p16-sign-va.tiktokcdn.com/tos-maliva-avt-0068/default-avatar.jpeg'
  };

  if (type === 'comment') {
    createLantern(user, wish || 'Cầu gia đình vạn sự an khang, tấn tài tấn lộc', 'normal');
  } else if (type === 'gold_gift') {
    io.emit('giftThankYou', { uniqueId: user.uniqueId, nickname: user.nickname, avatar: user.avatar, giftName: 'Hoa Hồng', repeatCount: 1, totalCoins: 1 });
    createLantern(user, 'Kính tặng Hoa Hồng cầu bình an', 'gold_gift', { giftName: 'Hoa Hồng', giftEmoji: '🌹' });
  } else if (type === 'royal_gift') {
    io.emit('giftThankYou', { uniqueId: user.uniqueId, nickname: user.nickname, avatar: user.avatar, giftName: 'Vương Miện', repeatCount: 1, totalCoins: 10 });
    createLantern(user, 'Kính tặng Vương Miện cầu công danh', 'royal_gift', { giftName: 'Vương Miện', giftEmoji: '👑' });
  } else if (type === 'sky_gift') {
    io.emit('giftThankYou', { uniqueId: user.uniqueId, nickname: user.nickname, avatar: user.avatar, giftName: 'Pháo Hoa Khổng Minh', repeatCount: 1, totalCoins: 100 });
    createSkyLantern(user, 'Pháo Hoa Khổng Minh', '🎆', 100);
  } else if (type === 'like') {
    gameState.totalLikes += 50;
    io.emit('riverSparkle', { count: 20 });
    io.emit('statsUpdate', {
      totalWishes: gameState.totalWishes,
      totalLikes: gameState.totalLikes,
      totalGifts: gameState.totalGifts
    });
  }

  res.json({ success: true });
});

io.on('connection', socket => {
  socket.emit('init', {
    ...getClientState(),
    lanterns: gameState.lanterns,
    skyLanterns: gameState.skyLanterns
  });
});

// Khởi chạy server
server.listen(PORT, () => {
  console.log(`\n================================================================`);
  console.log(`🏮 SERVER GAME THẢ ĐÈN HOA ĐĂNG CẦU NGUYỆN (FLOATING LANTERNS)`);
  console.log(`📡 Cổng: http://localhost:${PORT}`);
  console.log(`🎛️ Bảng Điều Khiển Admin: http://localhost:${PORT}/admin.html`);
  console.log(`🎯 Kênh TikTok Live đích: ${gameState.connectedChannel}`);
  console.log(`================================================================\n`);
  connectTikTok();
});
