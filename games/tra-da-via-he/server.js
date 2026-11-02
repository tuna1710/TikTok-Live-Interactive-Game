/**
 * TRÀ ĐÁ VỈA HÈ HÀ NỘI — Server Backend
 * Game Tương Tác TikTok LIVE 9:16 (Bốc đầu xe, chôm xe, ghế VIP 1 & 2, TTS Tiếng Việt)
 */

const express = require('express');
const http = require('http');
const path = require('path');
const https = require('https');
const { Server } = require('socket.io');
const cors = require('cors');

// Thư viện TikTok LIVE Connector (với fallback an toàn)
let WebcastPushConnection = null;
try {
  const tlc = require('tiktok-live-connector');
  WebcastPushConnection = tlc.WebcastPushConnection || tlc;
} catch (e) {
  console.warn('⚠️ [TikTok Connector] Chưa tìm thấy tiktok-live-connector, sẽ dùng chế độ mô phỏng.');
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const PORT = process.env.PORT || 3005;
const DEFAULT_TIKTOK_USER = process.env.TIKTOK_USERNAME || '@tra_da_via_he_hn';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// TRẠNG THÁI GAME (GAME STATE)
// ==========================================
const MAX_VIP1 = 3; // Thả 100 tim được ghế VIP 1 (3 ghế, người sau đẩy người trước)
const MAX_VIP2 = 4; // Follow được ghế VIP 2 (4 ghế, người sau đẩy người trước)
const MAX_REGULAR = 14; // Ghế nhựa đỏ thường

const gameState = {
  shopName: "Trà đá vỉa hè hà nội",
  connectedChannel: null,
  connectionStatus: 'disconnected',
  activeUsers: {}, // key: uniqueId -> user data
  vip1Seats: new Array(MAX_VIP1).fill(null), // 3 ghế VIP 1
  vip2Seats: new Array(MAX_VIP2).fill(null), // 4 ghế VIP 2
  regularSeats: new Array(MAX_REGULAR).fill(null), // Ghế thường
  motorcycle: {
    state: 'parked', // 'parked', 'driving', 'wheeling' (bốc đầu), 'stolen'
    currentRider: null,
    stolenBy: null,
    policeChasing: false
  },
  police: {
    active: false,
    targetUser: null,
    action: 'patrol' // 'patrol', 'chase', 'arrest'
  },
  wordGame: {
    question: "Đoán chữ",
    answer: "TRA DA VIA HE",
    display: "T _ A   _ A   V _ A   H _",
    timeRemaining: 420, // giây
    active: true,
    lastWinner: null
  },
  topSponsors: [], // Top khách sộp (dựa trên xu/điểm)
  recentActivities: []
};

// Danh sách từ vựng cho minigame đoán chữ vỉa hè
const WORD_LIST = [
  { answer: "TRA DA VIA HE", display: "T _ A   _ A   V _ A   H _", hint: "Nét văn hóa đường phố đặc trưng Hà Nội" },
  { answer: "KEO LAC", display: "K _ O   L _ C", hint: "Món ăn kèm hoàn hảo với trà đá nóng" },
  { answer: "NUOC MIA", display: "N _ O C   M _ A", hint: "Thức uống giải khát mát lạnh mùa hè" },
  { answer: "BOC DAU XE", display: "B _ C   D _ U   X _", hint: "Hành động chạy xe 1 bánh nguy hiểm" },
  { answer: "BANH MI PATE", display: "B _ N H   M _   P _ T E", hint: "Món ăn đường phố nổi tiếng toàn cầu" },
  { answer: "THUOC LAO", display: "T H _ O C   L _ O", hint: "Rít một hơi say đắm bên điếu cày" },
  { answer: "HO GUOM", display: "H _   G _ O M", hint: "Trái tim của thủ đô Hà Nội ngàn năm" },
  { answer: "CONG AN PHUONG", display: "C _ N G   A N   P H _ O N G", hint: "Lực lượng giữ gìn trật tự vỉa hè" }
];
let currentWordIndex = 0;

function switchWordGame() {
  currentWordIndex = (currentWordIndex + 1) % WORD_LIST.length;
  const item = WORD_LIST[currentWordIndex];
  gameState.wordGame.answer = item.answer;
  gameState.wordGame.display = item.display;
  gameState.wordGame.hint = item.hint;
  gameState.wordGame.timeRemaining = 450;
  io.emit('word_update', gameState.wordGame);
}

// Timer cho minigame đoán chữ
setInterval(() => {
  if (gameState.wordGame.active) {
    gameState.wordGame.timeRemaining--;
    if (gameState.wordGame.timeRemaining <= 0) {
      switchWordGame();
    }
  }
}, 1000);

// ==========================================
// LOGIC QUẢN LÝ GHẾ VÀ NGƯỜI CHƠI
// ==========================================
function getOrCreateUser(uniqueId, nickname, avatarUrl = '') {
  if (!gameState.activeUsers[uniqueId]) {
    gameState.activeUsers[uniqueId] = {
      uniqueId,
      nickname: nickname || uniqueId,
      avatarUrl: avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(uniqueId)}`,
      likesCount: 0,
      points: 0,
      seatType: 'none', // 'vip1', 'vip2', 'regular', 'none'
      seatIndex: -1,
      skin: 'default', // 'default', 'cr7', 'saitama', 'naruto', 'ninja'
      state: 'standing', // 'standing', 'sitting', 'driving', 'wheeling', 'arrested'
      joinedAt: Date.now()
    };
  } else {
    if (nickname) gameState.activeUsers[uniqueId].nickname = nickname;
    if (avatarUrl) gameState.activeUsers[uniqueId].avatarUrl = avatarUrl;
  }
  return gameState.activeUsers[uniqueId];
}

// Chuyển người dùng vào ghế thường (ghế nhựa đỏ)
function assignRegularSeat(user) {
  // Nếu đã ngồi ghế thường thì giữ nguyên
  if (user.seatType === 'regular' && user.seatIndex >= 0) return;

  // Tìm ghế thường trống
  let emptyIdx = gameState.regularSeats.findIndex(s => s === null);
  if (emptyIdx === -1) {
    // Đầy ghế thường thì đẩy người ngồi lâu nhất ra ngoài đứng
    emptyIdx = 0;
    const oldUserId = gameState.regularSeats[0];
    if (oldUserId && gameState.activeUsers[oldUserId]) {
      gameState.activeUsers[oldUserId].seatType = 'none';
      gameState.activeUsers[oldUserId].seatIndex = -1;
      gameState.activeUsers[oldUserId].state = 'standing';
    }
    // Xoay vòng ghế
    for (let i = 0; i < MAX_REGULAR - 1; i++) {
      gameState.regularSeats[i] = gameState.regularSeats[i + 1];
    }
    emptyIdx = MAX_REGULAR - 1;
  }

  // Gỡ ghế cũ nếu đang ngồi chỗ khác
  removeFromCurrentSeat(user);

  gameState.regularSeats[emptyIdx] = user.uniqueId;
  user.seatType = 'regular';
  user.seatIndex = emptyIdx;
  user.state = 'sitting';
}

// Chuyển người dùng vào ghế VIP 1 (3 ghế: dành cho thả >= 100 tim)
// Quy định: Người sau đẩy người trước
function assignVip1Seat(user) {
  if (user.seatType === 'vip1') return; // Đã ngồi VIP 1

  removeFromCurrentSeat(user);

  let targetIdx = -1;
  // Tìm ghế trống
  targetIdx = gameState.vip1Seats.findIndex(s => s === null);

  if (targetIdx === -1) {
    // Đã đủ 3 người: Người mới ĐẨY người ở vị trí 0 (người ngồi trước nhất) xuống ghế thường
    const pushedUserId = gameState.vip1Seats[0];
    if (pushedUserId && gameState.activeUsers[pushedUserId]) {
      const pushedUser = gameState.activeUsers[pushedUserId];
      pushedUser.seatType = 'none';
      assignRegularSeat(pushedUser);
      io.emit('seat_pushed', {
        from: 'vip1',
        pushedUser: pushedUser.nickname,
        newUser: user.nickname,
        message: `${pushedUser.nickname} đã nhường ghế VIP 1 cho ${user.nickname}!`
      });
    }

    // Dồn hàng đợi: [1 -> 0, 2 -> 1, người mới -> 2]
    for (let i = 0; i < MAX_VIP1 - 1; i++) {
      gameState.vip1Seats[i] = gameState.vip1Seats[i + 1];
    }
    targetIdx = MAX_VIP1 - 1;
  }

  gameState.vip1Seats[targetIdx] = user.uniqueId;
  user.seatType = 'vip1';
  user.seatIndex = targetIdx;
  user.state = 'sitting';
}

// Chuyển người dùng vào ghế VIP 2 (4 ghế: dành cho Follow)
// Quy định: Người sau đẩy người trước
function assignVip2Seat(user) {
  if (user.seatType === 'vip2') return;

  removeFromCurrentSeat(user);

  let targetIdx = gameState.vip2Seats.findIndex(s => s === null);
  if (targetIdx === -1) {
    // Đã đủ 4 người: Người mới ĐẨY người ở vị trí 0 xuống ghế thường
    const pushedUserId = gameState.vip2Seats[0];
    if (pushedUserId && gameState.activeUsers[pushedUserId]) {
      const pushedUser = gameState.activeUsers[pushedUserId];
      pushedUser.seatType = 'none';
      assignRegularSeat(pushedUser);
      io.emit('seat_pushed', {
        from: 'vip2',
        pushedUser: pushedUser.nickname,
        newUser: user.nickname,
        message: `${pushedUser.nickname} đã nhường ghế VIP 2 cho ${user.nickname}!`
      });
    }

    // Dồn hàng đợi
    for (let i = 0; i < MAX_VIP2 - 1; i++) {
      gameState.vip2Seats[i] = gameState.vip2Seats[i + 1];
    }
    targetIdx = MAX_VIP2 - 1;
  }

  gameState.vip2Seats[targetIdx] = user.uniqueId;
  user.seatType = 'vip2';
  user.seatIndex = targetIdx;
  user.state = 'sitting';
}

function removeFromCurrentSeat(user) {
  if (user.seatType === 'vip1' && user.seatIndex >= 0) {
    gameState.vip1Seats[user.seatIndex] = null;
  } else if (user.seatType === 'vip2' && user.seatIndex >= 0) {
    gameState.vip2Seats[user.seatIndex] = null;
  } else if (user.seatType === 'regular' && user.seatIndex >= 0) {
    gameState.regularSeats[user.seatIndex] = null;
  }
  user.seatType = 'none';
  user.seatIndex = -1;
}

// Hàm chuẩn hóa chuỗi tiếng Việt không dấu
function removeVietnameseTones(str) {
  if (!str) return '';
  return str.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().trim();
}

// ==========================================
// XỬ LÝ LỆNH CHAT VỈA HÈ (COMMAND PARSER)
// ==========================================
function handleChatCommand(user, rawComment) {
  const norm = removeVietnameseTones(rawComment);
  let actionResult = null;

  // Kiểm tra đoán chữ trước
  if (gameState.wordGame.active) {
    const cleanAns = removeVietnameseTones(gameState.wordGame.answer).replace(/\s+/g, '');
    const cleanComment = norm.replace(/\s+/g, '');
    if (cleanComment.includes(cleanAns) || cleanAns === cleanComment) {
      user.points += 50;
      gameState.wordGame.lastWinner = user.nickname;
      actionResult = {
        type: 'word_correct',
        user: user.nickname,
        answer: gameState.wordGame.answer,
        message: `🎉 Chúc mừng ${user.nickname} đã đoán chính xác: "${gameState.wordGame.answer}" (+50 điểm)!`
      };
      io.emit('game_action', actionResult);
      setTimeout(switchWordGame, 3000);
      return;
    }
  }

  // Các lệnh tương tác xe cộ & đường phố
  if (norm.includes('bocdau') || norm.includes('boc dau')) {
    // Lệnh BỐC ĐẦU XE MÁY
    user.state = 'wheeling';
    gameState.motorcycle.state = 'wheeling';
    gameState.motorcycle.currentRider = user.uniqueId;
    actionResult = {
      type: 'bocdau',
      user: user.nickname,
      avatar: user.avatarUrl,
      message: `🔥 ${user.nickname} ĐANG BỐC ĐẦU XE MÁY KHÉT LẸT VỈA HÈ!`,
      tts: `${user.nickname} đang bốc đầu xe máy khét lẹt vỉa hè!`
    };
    setTimeout(() => {
      if (gameState.motorcycle.state === 'wheeling') {
        gameState.motorcycle.state = 'parked';
        user.state = 'standing';
        io.emit('state_update', gameState);
      }
    }, 6000);

  } else if (norm.includes('chomxe') || norm.includes('chom xe') || norm.includes('trom xe')) {
    // Lệnh CHÔM XE
    user.state = 'driving';
    gameState.motorcycle.state = 'stolen';
    gameState.motorcycle.stolenBy = user.uniqueId;
    gameState.police.active = true;
    gameState.police.targetUser = user.uniqueId;
    gameState.police.action = 'chase';

    actionResult = {
      type: 'chomxe',
      user: user.nickname,
      avatar: user.avatarUrl,
      message: `🚨 BÁO ĐỘNG: ${user.nickname} VỪA BẺ KHÓA CHÔM XE MÁY CỦA QUÁN! CÔNG AN ĐANG ĐUỔI THEO!`,
      tts: `Báo động! ${user.nickname} vừa chôm xe máy của quán! Công an đang rượt đuổi!`
    };

    // Sau 5 giây công an tóm gọn
    setTimeout(() => {
      if (gameState.police.active && gameState.police.targetUser === user.uniqueId) {
        user.state = 'arrested';
        gameState.motorcycle.state = 'parked';
        gameState.police.action = 'arrest';
        io.emit('game_action', {
          type: 'arrested',
          user: user.nickname,
          message: `👮 CÔNG AN ĐÃ TÓM GỌN ${user.nickname} VỀ ĐỒN VÌ TỘI CHÔM XE!`,
          tts: `Công an phường đã tóm gọn ${user.nickname} vì tội chôm xe máy!`
        });
        setTimeout(() => {
          user.state = 'standing';
          gameState.police.active = false;
          io.emit('state_update', gameState);
        }, 5000);
      }
    }, 5500);

  } else if (norm.includes('laixe') || norm.includes('lai xe')) {
    // Lệnh LÁI XE
    user.state = 'driving';
    gameState.motorcycle.state = 'driving';
    gameState.motorcycle.currentRider = user.uniqueId;
    actionResult = {
      type: 'laixe',
      user: user.nickname,
      avatar: user.avatarUrl,
      message: `🛵 ${user.nickname} nổ máy phóng xe lượn quanh vỉa hè!`
    };
    setTimeout(() => {
      if (gameState.motorcycle.state === 'driving') {
        gameState.motorcycle.state = 'parked';
        user.state = 'standing';
        io.emit('state_update', gameState);
      }
    }, 5000);

  } else if (norm.includes('goicongan') || norm.includes('goi cong an')) {
    // Lệnh GỌI CÔNG AN
    gameState.police.active = true;
    actionResult = {
      type: 'goicongan',
      user: user.nickname,
      message: `🚓 ${user.nickname} đã gọi công an phường ra giữ gìn trật tự vỉa hè!`,
      tts: `${user.nickname} vừa gọi công an phường ra tuần tra vỉa hè!`
    };
    setTimeout(() => {
      gameState.police.active = false;
      io.emit('state_update', gameState);
    }, 6000);

  } else if (norm.includes('chomcoho') || norm.includes('chom cho')) {
    // Lệnh CHÔM CỜ HÓ
    actionResult = {
      type: 'chomcoho',
      user: user.nickname,
      message: `🐕 ${user.nickname} vừa bắt trộm chó chạy ngang vỉa hè!`,
      tts: `${user.nickname} vừa trộm mất cờ hó của quán!`
    };

  } else if (norm.includes('batcoc') || norm.includes('bat coc')) {
    // Lệnh BẮT CÓC
    actionResult = {
      type: 'batcoc',
      user: user.nickname,
      message: `😱 ${user.nickname} đang tìm cách bắt cóc khách trong quán!`,
      tts: `Cứu với! ${user.nickname} đang quậy bắt cóc người!`
    };

  } else if (norm.includes('quayxom') || norm.includes('quay xom')) {
    // Lệnh QUẬY XÓM
    actionResult = {
      type: 'quayxom',
      user: user.nickname,
      message: `💥 ${user.nickname} quậy tung nóc xóm vỉa hè!`,
      tts: `${user.nickname} đang quậy tưng bừng vỉa hè!`
    };

  } else if (norm.includes('choichai') || norm.includes('choi chai') || norm.includes('nem1')) {
    // Lệnh CHỌI CHAI / NÉM CHAI
    actionResult = {
      type: 'choichai',
      user: user.nickname,
      message: `🍾 ${user.nickname} vừa ném vỏ chai nhựa sang bàn đối diện!`,
      tts: `${user.nickname} ném chai nhựa vui nhộn!`
    };

  } else if (norm.includes('ngoighe') || norm.includes('ngoi')) {
    // Lệnh NGỒI GHẾ
    if (user.seatType === 'none') {
      assignRegularSeat(user);
    } else {
      user.state = 'sitting';
    }
    actionResult = {
      type: 'ngoi',
      user: user.nickname,
      message: `🪑 ${user.nickname} ngồi ngay ngắn thưởng thức trà đá!`
    };

  } else if (norm.includes('dungday') || norm.includes('dung day')) {
    // Lệnh ĐỨNG DẬY
    user.state = 'standing';
    actionResult = {
      type: 'dungday',
      user: user.nickname,
      message: `🚶 ${user.nickname} đứng dậy vươn vai hít thở không khí!`
    };

  } else if (norm.includes('nhay')) {
    // Lệnh NHẢY
    user.state = 'dancing';
    actionResult = {
      type: 'nhay',
      user: user.nickname,
      message: `💃 ${user.nickname} nhảy tưng bừng trên nền nhạc vỉa hè!`
    };
    setTimeout(() => {
      user.state = 'standing';
      io.emit('state_update', gameState);
    }, 4000);

  } else if (norm.includes('chaotoidi') || norm.includes('chao toi di')) {
    // Lệnh CHÀO TÔI ĐI
    actionResult = {
      type: 'chaotoidi',
      user: user.nickname,
      message: `👋 Chủ quán chào bạn ${user.nickname}! Mời bạn làm ly trà đá kẹo lạc nhé!`,
      tts: `Chủ quán xin chào bạn ${user.nickname}! Mời bạn làm ly trà đá kẹo lạc thơm ngon!`
    };

  } else {
    // Tin nhắn chat thường -> Nếu chưa có ghế thì vào quán ngồi ghế thường
    if (user.seatType === 'none') {
      assignRegularSeat(user);
    }
    actionResult = {
      type: 'chat_talk',
      user: user.nickname,
      comment: rawComment,
      message: `${user.nickname}: "${rawComment}"`
    };
  }

  if (actionResult) {
    io.emit('game_action', actionResult);
  }
}

// ==========================================
// ENDPOINT PROXY TTS (Google Translate tiếng Việt)
// ==========================================
app.get('/api/tts', (req, res) => {
  const text = (req.query.text || '').toString().trim();
  if (!text) return res.status(400).send('Missing text parameter');

  const cleanText = text
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
    .slice(0, 180)
    .trim();

  if (!cleanText) return res.status(400).send('Empty clean text');

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
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*'
    });
    gRes.pipe(res);
  }).on('error', (err) => {
    res.status(500).send('TTS Proxy error: ' + err.message);
  });
});

// ==========================================
// TÍCH HỢP TIKTOK LIVE CONNECTOR
// ==========================================
let tiktokLiveConnection = null;

function connectTikTok(username) {
  if (!username) return;
  const cleanUsername = username.replace(/^@/, '');

  if (tiktokLiveConnection) {
    try { tiktokLiveConnection.disconnect(); } catch (e) {}
  }

  if (!WebcastPushConnection) {
    gameState.connectedChannel = `@${cleanUsername}`;
    gameState.connectionStatus = 'simulated';
    io.emit('tiktok_status', { status: 'simulated', username: cleanUsername });
    console.log(`[TikTok] Chạy chế độ mô phỏng cho @${cleanUsername}`);
    return;
  }

  try {
    tiktokLiveConnection = new WebcastPushConnection(cleanUsername, {
      processInitialData: false,
      enableExtendedGiftInfo: true,
      requestPollingIntervalMs: 1000
    });

    tiktokLiveConnection.connect().then(state => {
      gameState.connectedChannel = `@${cleanUsername}`;
      gameState.connectionStatus = 'connected';
      io.emit('tiktok_status', { status: 'connected', username: cleanUsername, roomId: state.roomId });
      console.log(`[TikTok Connected] Phòng LIVE: ${cleanUsername} (RoomId: ${state.roomId})`);
    }).catch(err => {
      gameState.connectionStatus = 'error';
      io.emit('tiktok_status', { status: 'error', error: err.message });
      console.error(`[TikTok Connect Error] ${err.message}`);
    });

    // 1. Nhận sự kiện CHAT
    tiktokLiveConnection.on('chat', data => {
      const u = getOrCreateUser(data.uniqueId, data.nickname, data.profilePictureUrl);
      u.points += 1;
      handleChatCommand(u, data.comment);
      io.emit('state_update', gameState);
    });

    // 2. Nhận sự kiện THẢ TIM (LIKE)
    tiktokLiveConnection.on('like', data => {
      const u = getOrCreateUser(data.uniqueId, data.nickname, data.profilePictureUrl);
      const likesAdded = data.likeCount || 1;
      u.likesCount += likesAdded;
      u.points += likesAdded;

      // THẢ 100 TIM ĐƯỢC GHẾ VIP 1 (3 GHẾ) — Người sau đẩy người trước
      if (u.likesCount >= 100 && u.seatType !== 'vip1') {
        assignVip1Seat(u);
        const vipMsg = `👑 CHÚC MỪNG ${u.nickname} ĐÃ THẢ 100 TIM, VÀO GHẾ VIP 1!`;
        io.emit('game_action', {
          type: 'vip1_awarded',
          user: u.nickname,
          avatar: u.avatarUrl,
          message: vipMsg,
          tts: `Chúc mừng bạn ${u.nickname} đã thả một trăm tim và được mời vào hàng ghế VIP 1!`
        });
      }
      io.emit('state_update', gameState);
    });

    // 3. Nhận sự kiện FOLLOW (ĐƯỢC GHẾ VIP 2 - 4 GHẾ) — Người sau đẩy người trước
    tiktokLiveConnection.on('follow', data => {
      const u = getOrCreateUser(data.uniqueId, data.nickname, data.profilePictureUrl);
      u.points += 20;

      assignVip2Seat(u);
      const followMsg = `🌟 CẢM ƠN ${u.nickname} ĐÃ FOLLOW! ĐƯỢC MỜI VÀO GHẾ VIP 2!`;
      io.emit('game_action', {
        type: 'vip2_awarded',
        user: u.nickname,
        avatar: u.avatarUrl,
        message: followMsg,
        tts: `Cảm ơn bạn ${u.nickname} đã theo dõi kênh! Mời bạn an tọa tại hàng ghế VIP 2!`
      });
      io.emit('state_update', gameState);
    });

    // 4. Nhận sự kiện TẶNG QUÀ (GIFT)
    tiktokLiveConnection.on('gift', data => {
      if (data.giftType === 1 && !data.repeatEnd) return; // Tránh spam combo quà liên hoàn

      const u = getOrCreateUser(data.uniqueId, data.nickname, data.profilePictureUrl);
      const diamondCount = (data.diamondCount || 1) * (data.repeatCount || 1);
      u.points += diamondCount * 10;

      // Đổi Skin nếu tặng quà giá trị
      if (diamondCount >= 10) {
        const skins = ['cr7', 'saitama', 'naruto', 'ninja'];
        u.skin = skins[Math.floor(Math.random() * skins.length)];
      }

      // Xử lý khách sộp nếu quà >= 99 xu
      let isBigSponsor = diamondCount >= 99;
      let giftAnnouncement = `🎁 Cảm ơn ${u.nickname} đã tặng ${data.giftName} (x${data.repeatCount || 1})!`;
      let ttsText = `Cảm ơn ${u.nickname} đã gửi tặng ${data.giftName}! Chúc bạn vạn sự như ý!`;

      if (isBigSponsor) {
        giftAnnouncement = `🔥 KHÁCH SỘP XUẤT HIỆN: ${u.nickname} ĐÃ TẶNG ${data.giftName}! CẢ QUÁN NGẢ MŨ!`;
        ttsText = `Đại gia ${u.nickname} vừa tài trợ món quà ${data.giftName}! Cả quán trà đá ngả mũ bái phục!`;
      }

      // Đưa vào danh sách Top Khách Sộp
      updateTopSponsors(u, diamondCount);

      io.emit('game_action', {
        type: 'gift',
        user: u.nickname,
        avatar: u.avatarUrl,
        giftName: data.giftName,
        diamondCount,
        message: giftAnnouncement,
        tts: ttsText,
        isBig: isBigSponsor
      });

      io.emit('state_update', gameState);
    });

  } catch (err) {
    console.error('[TikTok Setup Error]', err);
  }
}

function updateTopSponsors(user, diamonds) {
  let existing = gameState.topSponsors.find(s => s.uniqueId === user.uniqueId);
  if (existing) {
    existing.diamonds += diamonds;
    existing.points = user.points;
  } else {
    gameState.topSponsors.push({
      uniqueId: user.uniqueId,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
      diamonds: diamonds,
      points: user.points
    });
  }
  gameState.topSponsors.sort((a, b) => b.diamonds - a.diamonds);
  if (gameState.topSponsors.length > 5) gameState.topSponsors.length = 5;
}

// Khởi chạy kết nối mặc định
connectTikTok(DEFAULT_TIKTOK_USER);

// ==========================================
// API QUẢN TRỊ & GIẢ LẬP (ADMIN TEST PANEL)
// ==========================================
app.get('/api/state', (req, res) => {
  res.json(gameState);
});

app.post('/api/connect', (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username is required' });
  connectTikTok(username);
  res.json({ success: true, username });
});

// Endpoint giả lập cho Admin test mọi tính năng
app.post('/api/admin/simulate', (req, res) => {
  const { action, username, comment, giftName, diamondCount } = req.body;
  const uname = username || 'Khach_VIP_' + Math.floor(Math.random() * 100);
  const u = getOrCreateUser(uname, uname);

  if (action === 'chat') {
    handleChatCommand(u, comment || 'Chào quán trà đá');
  } else if (action === 'bocdau') {
    handleChatCommand(u, 'bocdau');
  } else if (action === 'chomxe') {
    handleChatCommand(u, 'chomxe');
  } else if (action === 'goicongan') {
    handleChatCommand(u, 'goicongan');
  } else if (action === 'quayxom') {
    handleChatCommand(u, 'quayxom');
  } else if (action === 'choichai') {
    handleChatCommand(u, 'choichai');
  } else if (action === 'like100') {
    u.likesCount += 100;
    assignVip1Seat(u);
    io.emit('game_action', {
      type: 'vip1_awarded',
      user: u.nickname,
      avatar: u.avatarUrl,
      message: `👑 [Mô Phỏng] ${u.nickname} đã thả 100 tim, vào ghế VIP 1!`,
      tts: `Chúc mừng bạn ${u.nickname} đã thả một trăm tim và được mời vào hàng ghế VIP 1!`
    });
  } else if (action === 'follow') {
    assignVip2Seat(u);
    io.emit('game_action', {
      type: 'vip2_awarded',
      user: u.nickname,
      avatar: u.avatarUrl,
      message: `🌟 [Mô Phỏng] ${u.nickname} đã Follow, vào ghế VIP 2!`,
      tts: `Cảm ơn bạn ${u.nickname} đã theo dõi kênh! Mời bạn an tọa tại hàng ghế VIP 2!`
    });
  } else if (action === 'gift') {
    const diamonds = parseInt(diamondCount) || 10;
    const gName = giftName || 'Hoa Hồng';
    u.points += diamonds * 10;
    updateTopSponsors(u, diamonds);
    io.emit('game_action', {
      type: 'gift',
      user: u.nickname,
      avatar: u.avatarUrl,
      giftName: gName,
      diamondCount: diamonds,
      message: `🎁 [Mô Phỏng] ${u.nickname} tặng ${gName} (${diamonds} xu)!`,
      tts: `Cảm ơn bạn ${u.nickname} đã gửi tặng ${gName}!`,
      isBig: diamonds >= 99
    });
  } else if (action === 'reset') {
    gameState.vip1Seats.fill(null);
    gameState.vip2Seats.fill(null);
    gameState.regularSeats.fill(null);
    gameState.motorcycle.state = 'parked';
    gameState.police.active = false;
  }

  io.emit('state_update', gameState);
  res.json({ success: true, action, user: u });
});

// Socket.io connection
io.on('connection', socket => {
  socket.emit('init_state', gameState);

  socket.on('request_state', () => {
    socket.emit('state_update', gameState);
  });
});

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🍵 SERVER GAME TRÀ ĐÁ VỈA HÈ HÀ NỘI ĐÃ KHỞI CHẠY`);
  console.log(`📍 Cổng: http://localhost:${PORT}`);
  console.log(`🎮 Màn hình Game 9:16: http://localhost:${PORT}/index.html`);
  console.log(`⚙️ Bảng Quản Trị / Test: http://localhost:${PORT}/admin.html`);
  console.log(`=======================================================`);
});
