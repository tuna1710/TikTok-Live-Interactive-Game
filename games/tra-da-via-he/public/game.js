/**
 * GAME CLIENT & CANVAS RENDERER — Trà Đá Vỉa Hè Hà Nội 9:16
 * Đồ họa Vỉa hè Hà Nội, Ghế VIP 1 (3 ghế), VIP 2 (4 ghế), Ghế nhựa đỏ thường, Bốc đầu xe máy, Công an rượt đuổi
 */

const canvas = document.getElementById('streetCanvas');
const ctx = canvas.getContext('2d');

const socket = io();

// Kích thước chuẩn nội bộ Canvas
const W = 1080;
const H = 1350;

// Trạng thái cục bộ
let gameState = {
  shopName: "Trà đá vỉa hè hà nội",
  vip1Seats: [null, null, null],
  vip2Seats: [null, null, null, null],
  regularSeats: new Array(14).fill(null),
  activeUsers: {},
  motorcycle: { state: 'parked', currentRider: null, stolenBy: null },
  police: { active: false, targetUser: null, action: 'patrol' },
  wordGame: { question: "", display: "T _ A   _ A   V _ A   H _", timeRemaining: 420 },
  topSponsors: []
};

// Hiệu ứng hạt (Khói xe, pháo hoa, v.v.)
let particles = [];
// Chai nhựa đang ném
let thrownBottles = [];
// Bong bóng chat hiển thị
let chatBubbles = [];

// Tải sẵn avatar cache
const avatarImgCache = {};
function getAvatarImage(url) {
  if (!url) return null;
  if (!avatarImgCache[url]) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    avatarImgCache[url] = img;
  }
  return avatarImgCache[url];
}

// ==========================================
// KẾT NỐI SOCKET & SỰ KIỆN
// ==========================================
socket.on('init_state', state => {
  gameState = state;
  updateHUD();
});

socket.on('state_update', state => {
  gameState = state;
  updateHUD();
});

socket.on('word_update', wg => {
  gameState.wordGame = wg;
  updateHUD();
});

socket.on('seat_pushed', data => {
  addActivityFeed(`⚡ [Đổi Ghế] ${data.message}`, 'feed-vip1');
  if (window.soundManager) window.soundManager.speak(data.message);
});

socket.on('game_action', action => {
  handleIncomingAction(action);
});

function handleIncomingAction(action) {
  // 1. Thêm vào bảng tin toast góc dưới
  let feedClass = '';
  if (action.type === 'vip1_awarded') feedClass = 'feed-vip1';
  else if (action.type === 'vip2_awarded') feedClass = 'feed-vip2';
  else if (action.type === 'gift') feedClass = 'feed-gift';

  if (action.message) {
    addActivityFeed(action.message, feedClass);
  }

  // 2. Phát âm thanh & TTS
  if (action.tts && window.soundManager) {
    window.soundManager.speak(action.tts);
  }

  if (action.type === 'bocdau') {
    if (window.soundManager) window.soundManager.playMotorRev();
    showBigBanner("BỐC ĐẦU!!!", `${action.user} ĐANG BỐC ĐẦU KHÉT LẸT!`);
    // Tạo cụm khói xe dày đặc
    for (let i = 0; i < 40; i++) {
      particles.push({
        x: 480 + (Math.random() - 0.5) * 60,
        y: 1160,
        vx: (Math.random() - 0.7) * 4,
        vy: -Math.random() * 3 - 1,
        size: Math.random() * 25 + 10,
        alpha: 1,
        color: '#e0e0e0'
      });
    }

  } else if (action.type === 'chomxe' || action.type === 'goicongan') {
    if (window.soundManager) window.soundManager.playPoliceSiren();
    showBigBanner("CÔNG AN TỚI!", "TRẬT TỰ VỈA HÈ — ĐẦU HÀNG MAU!");

  } else if (action.type === 'vip1_awarded') {
    if (window.soundManager) window.soundManager.playChimeVIP();
    showBigBanner("👑 GHẾ VIP 1", `${action.user} THẢ 100 TIM!`);

  } else if (action.type === 'vip2_awarded') {
    if (window.soundManager) window.soundManager.playChimeVIP();
    showBigBanner("🌟 GHẾ VIP 2", `${action.user} ĐÃ FOLLOW!`);

  } else if (action.type === 'choichai') {
    if (window.soundManager) window.soundManager.playGlassClink();
    // Tạo hiệu ứng chai bay
    thrownBottles.push({
      startX: 300 + Math.random() * 400,
      startY: 900,
      x: 300,
      y: 900,
      targetX: 200 + Math.random() * 600,
      targetY: 850 + Math.random() * 100,
      progress: 0,
      rotation: 0
    });

  } else if (action.type === 'chat_talk') {
    chatBubbles.push({
      user: action.user,
      text: action.comment,
      createdAt: Date.now(),
      duration: 5000
    });
    if (chatBubbles.length > 5) chatBubbles.shift();
  }
}

function showBigBanner(title, sub) {
  const overlay = document.getElementById('big-event-overlay');
  const titleEl = document.getElementById('big-event-text');
  const subEl = document.getElementById('big-event-sub');

  titleEl.innerText = title;
  subEl.innerText = sub || '';
  overlay.classList.remove('hidden');

  setTimeout(() => {
    overlay.classList.add('hidden');
  }, 3500);
}

function addActivityFeed(text, className = '') {
  const feed = document.getElementById('activity-feed');
  const item = document.createElement('div');
  item.className = `feed-item ${className}`;
  item.innerText = text;
  feed.appendChild(item);

  setTimeout(() => {
    if (item.parentNode) item.parentNode.removeChild(item);
  }, 6000);

  while (feed.children.length > 4) {
    feed.removeChild(feed.firstChild);
  }
}

// Cập nhật DOM HUD
function updateHUD() {
  // Cập nhật minigame đoán chữ (nếu có trên giao diện)
  const wgDisplay = document.getElementById('wordgame-display');
  const wgTimer = document.getElementById('wordgame-timer');
  if (wgDisplay && gameState.wordGame) {
    wgDisplay.innerText = gameState.wordGame.display || '';
  }
  if (wgTimer && gameState.wordGame) {
    const m = Math.floor(gameState.wordGame.timeRemaining / 60);
    const s = gameState.wordGame.timeRemaining % 60;
    wgTimer.innerText = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  // Cập nhật danh sách khách sộp
  const sponsorListEl = document.getElementById('sponsor-list');
  if (gameState.topSponsors && gameState.topSponsors.length > 0) {
    sponsorListEl.innerHTML = gameState.topSponsors.slice(0, 3).map((sp, i) => `
      <div class="sponsor-item">
        <span>${i === 0 ? '🥇' : (i === 1 ? '🥈' : '🥉')} ${sp.nickname}</span>
        <strong>${sp.diamonds} xu</strong>
      </div>
    `).join('');
  } else {
    sponsorListEl.innerHTML = `<div class="empty-sponsor">Chưa có đại gia tài trợ</div>`;
  }

  // Đếm ghế
  const vip1Count = gameState.vip1Seats.filter(s => s !== null).length;
  const vip2Count = gameState.vip2Seats.filter(s => s !== null).length;
  document.getElementById('seat-status').innerText = `🪑 VIP1: ${vip1Count}/3 | VIP2: ${vip2Count}/4`;
}

// ==========================================
// VÒNG LẶP RENDER CANVAS (GRAPHICS LOOP)
// ==========================================
let lastTime = performance.now();

function gameLoop(now) {
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  updatePhysics(dt);
  renderCanvas();

  requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);

function updatePhysics(dt) {
  // Cập nhật hạt khói/bụi
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.alpha -= dt * 0.7;
    p.size += dt * 10;
    if (p.alpha <= 0) particles.splice(i, 1);
  }

  // Cập nhật chai ném
  for (let i = thrownBottles.length - 1; i >= 0; i--) {
    const b = thrownBottles[i];
    b.progress += dt * 1.5;
    b.rotation += dt * 12;
    b.x = b.startX + (b.targetX - b.startX) * b.progress;
    b.y = b.startY + (b.targetY - b.startY) * b.progress - Math.sin(b.progress * Math.PI) * 120;
    if (b.progress >= 1) {
      thrownBottles.splice(i, 1);
    }
  }

  // Dọn dẹp bong bóng chat cũ
  const currTime = Date.now();
  chatBubbles = chatBubbles.filter(b => currTime - b.createdAt < b.duration);
}

function renderCanvas() {
  ctx.clearRect(0, 0, W, H);

  // 1. Vẽ Hậu Cảnh (Nhà phố cổ Hà Nội, tường vàng, cửa sổ chấn song xanh)
  renderBackground();

  // 2. Vẽ Lòng Đường Xe Chạy (Vạch kẻ đường, lề đường)
  renderRoadAndPavement();

  // 3. Vẽ Quầy Trà Đá & Quán Nước (Bàn gỗ, ấm tích ủ rơm, phích nước, kẹo lạc, điếu cày)
  renderTeaStall();

  // 4. Vẽ Các Hàng Ghế (VIP 1, VIP 2, Ghế nhựa đỏ thường)
  renderSeatsAndSitters();

  // 5. Vẽ Xe Máy (Dream / Wave) & Hành động Bốc Đầu / Chạy Xe
  renderMotorcycleAndActions();

  // 6. Vẽ Chú Công An Phường Tuần Tra / Rượt Đuổi
  renderPolice();

  // 7. Vẽ Chai ném & Hạt khói
  renderParticles();

  // 8. Vẽ Bong bóng Chat trên đầu người chơi
  renderChatBubbles();
}

// 1. HẬU CẢNH NHÀ PHỐ HÀ NỘI
function renderBackground() {
  // Trời chiều / chập tối vỉa hè
  const skyGrad = ctx.createLinearGradient(0, 0, 0, 450);
  skyGrad.addColorStop(0, '#1a237e');
  skyGrad.addColorStop(1, '#ff8f00');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, W, 450);

  // Tường nhà phố cổ màu vàng đặc trưng
  ctx.fillStyle = '#fbc02d';
  ctx.fillRect(0, 200, W, 350);

  // Mái ngói rêu phong
  ctx.fillStyle = '#8d442d';
  ctx.beginPath();
  ctx.moveTo(0, 200);
  ctx.lineTo(W / 2, 140);
  ctx.lineTo(W, 200);
  ctx.fill();

  // Cửa sổ gỗ lá sách màu xanh cổ kính
  ctx.fillStyle = '#1b5e20';
  ctx.fillRect(120, 240, 100, 120);
  ctx.fillRect(490, 240, 100, 120);
  ctx.fillRect(860, 240, 100, 120);

  // Cột điện & dây điện chằng chịt đặc trưng Hà Nội
  ctx.strokeStyle = '#212121';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.moveTo(960, 0);
  ctx.lineTo(960, 600);
  ctx.stroke();

  // Hộp điện & dây cáp võng
  ctx.fillStyle = '#757575';
  ctx.fillRect(935, 180, 50, 70);

  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#111';
  for (let y = 150; y <= 220; y += 22) {
    ctx.beginPath();
    ctx.moveTo(0, y - 20);
    ctx.quadraticCurveTo(W / 2, y + 80, 960, y);
    ctx.stroke();
  }

  // Tán cây bàng xanh mát vỉa hè
  ctx.fillStyle = '#2e7d32';
  ctx.beginPath();
  ctx.arc(80, 150, 160, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(220, 120, 130, 0, Math.PI * 2);
  ctx.fill();
}

// 2. VỈA HÈ & LÒNG ĐƯỜNG
function renderRoadAndPavement() {
  // Gạch vỉa hè (Màu xám zíc zắc đỏ)
  ctx.fillStyle = '#9e9e9e';
  ctx.fillRect(0, 480, W, 580);

  // Kẻ ô gạch vỉa hè
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 2;
  for (let x = 0; x < W; x += 80) {
    ctx.beginPath();
    ctx.moveTo(x, 480);
    ctx.lineTo(x, 1060);
    ctx.stroke();
  }
  for (let y = 480; y < 1060; y += 60) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  // Gờ bó vỉa hè (Curb) màu sọc vàng đen
  const curbY = 1060;
  ctx.fillStyle = '#424242';
  ctx.fillRect(0, curbY, W, 30);
  for (let x = 0; x < W; x += 100) {
    ctx.fillStyle = (Math.floor(x / 100) % 2 === 0) ? '#ffeb3b' : '#212121';
    ctx.fillRect(x, curbY, 100, 30);
  }

  // Lòng đường nhựa màu tối
  const roadY = 1090;
  ctx.fillStyle = '#212121';
  ctx.fillRect(0, roadY, W, H - roadY);

  // Vạch kẻ đường đứt đoạn màu trắng
  ctx.fillStyle = '#ffffff';
  for (let x = 40; x < W; x += 160) {
    ctx.fillRect(x, 1210, 90, 14);
  }
}

// 3. QUẦY BÁN TRÀ ĐÁ & ĂN VẶT
function renderTeaStall() {
  // Bàn gỗ bán trà đá (Góc trái vỉa hè)
  const bx = 60, by = 550, bw = 240, bh = 140;

  // Thân bàn gỗ
  ctx.fillStyle = '#5d4037';
  ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = '#8d6e63';
  ctx.fillRect(bx - 10, by - 15, bw + 20, 20); // Mặt bàn

  // 1. Ấm tích ủ rơm (Giữ nhiệt pha trà xanh nóng)
  ctx.fillStyle = '#d7ccc8';
  ctx.beginPath();
  ctx.arc(bx + 40, by + 10, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#8d6e63'; // Lớp cót rơm bện
  ctx.stroke();

  // 2. Phích nước Rạng Đông đỏ
  ctx.fillStyle = '#d32f2f';
  ctx.fillRect(bx + 90, by - 25, 30, 55);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(bx + 95, by - 35, 20, 10); // Nắp phích nhôm

  // 3. Lọ thủy tinh kẹo lạc & hạt hướng dương
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.fillRect(bx + 140, by - 15, 35, 45);
  ctx.fillStyle = '#ffb300'; // Hạt kẹo lạc vàng ươm bên trong
  ctx.fillRect(bx + 143, by - 5, 29, 32);

  // 4. Điếu cày thuốc lào bằng tre tựa vào bàn
  ctx.strokeStyle = '#d7ccc8';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.moveTo(bx + 210, by + 120);
  ctx.lineTo(bx + 195, by - 20);
  ctx.stroke();
  // Nõ điếu
  ctx.fillStyle = '#4e342e';
  ctx.fillRect(bx + 195, by + 40, 18, 12);

  // Biển chữ nhỏ: "TRÀ ĐÁ 3K • KẸO LẠC"
  ctx.fillStyle = '#fffde7';
  ctx.fillRect(bx + 30, by + 60, 170, 36);
  ctx.strokeStyle = '#d32f2f';
  ctx.lineWidth = 2;
  ctx.strokeRect(bx + 30, by + 60, 170, 36);
  ctx.fillStyle = '#b71c1c';
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText("TRÀ ĐÁ 3K • KẸO LẠC", bx + 115, by + 84);

  // Xe đẩy Nước Mía Siêu Sạch (Góc phải)
  const mx = 820, my = 530;
  ctx.fillStyle = '#388e3c';
  ctx.fillRect(mx, my, 180, 160);
  ctx.fillStyle = '#ffeb3b';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText("NƯỚC MÍA", mx + 90, my + 40);
  ctx.font = '14px sans-serif';
  ctx.fillText("SIÊU SẠCH", mx + 90, my + 65);
  // Bánh xe đẩy
  ctx.fillStyle = '#212121';
  ctx.beginPath();
  ctx.arc(mx + 30, my + 160, 22, 0, Math.PI * 2);
  ctx.arc(mx + 150, my + 160, 22, 0, Math.PI * 2);
  ctx.fill();
}

// 4. CÁC HÀNG GHẾ & NGƯỜI NGỒI (VIP 1, VIP 2, GHẾ THƯỜNG)
function renderSeatsAndSitters() {
  // ==========================================
  // KHU GHẾ VIP 1 (3 GHẾ - THẢ 100 TIM)
  // Vị trí trung tâm trang trọng
  // ==========================================
  ctx.fillStyle = 'rgba(255, 215, 0, 0.2)';
  ctx.fillRect(340, 520, 400, 130);
  ctx.strokeStyle = '#ffd700';
  ctx.lineWidth = 3;
  ctx.strokeRect(340, 520, 400, 130);

  ctx.fillStyle = '#ffd700';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText("👑 HÀNG GHẾ VIP 1 (THẢ 100 TIM • NGƯỜI SAU ĐẨY NGƯỜI TRƯỚC)", 540, 542);

  const vip1Pos = [
    { x: 400, y: 590 },
    { x: 540, y: 590 },
    { x: 680, y: 590 }
  ];

  vip1Pos.forEach((pos, idx) => {
    // Vẽ ghế nhung đỏ viền vàng VIP
    ctx.fillStyle = '#b71c1c';
    ctx.beginPath();
    ctx.roundRect(pos.x - 35, pos.y - 30, 70, 60, 8);
    ctx.fill();
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 3;
    ctx.stroke();

    const userId = gameState.vip1Seats[idx];
    renderSeatOccupant(userId, pos.x, pos.y, `VIP1 #${idx + 1}`);
  });

  // ==========================================
  // KHU GHẾ VIP 2 (4 GHẾ - BẤM FOLLOW)
  // ==========================================
  ctx.fillStyle = 'rgba(3, 169, 244, 0.15)';
  ctx.fillRect(280, 670, 520, 120);
  ctx.strokeStyle = '#03a9f4';
  ctx.lineWidth = 3;
  ctx.strokeRect(280, 670, 520, 120);

  ctx.fillStyle = '#81d4fa';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText("🌟 HÀNG GHẾ VIP 2 (FOLLOW KÊNH • NGƯỜI SAU ĐẨY NGƯỜI TRƯỚC)", 540, 692);

  const vip2Pos = [
    { x: 340, y: 740 },
    { x: 470, y: 740 },
    { x: 610, y: 740 },
    { x: 740, y: 740 }
  ];

  vip2Pos.forEach((pos, idx) => {
    // Vẽ ghế bọc da xanh dương VIP 2
    ctx.fillStyle = '#0277bd';
    ctx.beginPath();
    ctx.roundRect(pos.x - 30, pos.y - 25, 60, 50, 6);
    ctx.fill();
    ctx.strokeStyle = '#81d4fa';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    const userId = gameState.vip2Seats[idx];
    renderSeatOccupant(userId, pos.x, pos.y, `VIP2 #${idx + 1}`);
  });

  // ==========================================
  // KHU GHẾ NHỰA ĐỎ THƯỜNG (DÀNH CHO CHAT VÀO QUÁN)
  // Xếp quanh các bàn tròn nhỏ vỉa hè
  // ==========================================
  const regularRows = [
    // Bàn 1
    { x: 120, y: 860 }, { x: 220, y: 860 }, { x: 120, y: 950 }, { x: 220, y: 950 },
    // Bàn 2
    { x: 420, y: 860 }, { x: 530, y: 860 }, { x: 640, y: 860 },
    { x: 420, y: 950 }, { x: 530, y: 950 }, { x: 640, y: 950 },
    // Bàn 3
    { x: 840, y: 860 }, { x: 940, y: 860 }, { x: 840, y: 950 }, { x: 940, y: 950 }
  ];

  regularRows.forEach((pos, idx) => {
    // Vẽ ghế nhựa đỏ Song Long vỉa hè
    ctx.fillStyle = '#d32f2f';
    ctx.beginPath();
    ctx.roundRect(pos.x - 22, pos.y - 20, 44, 40, 4);
    ctx.fill();
    ctx.strokeStyle = '#b71c1c';
    ctx.lineWidth = 2;
    ctx.stroke();

    const userId = gameState.regularSeats[idx];
    renderSeatOccupant(userId, pos.x, pos.y, `${idx + 1}`);
  });
}

function renderSeatOccupant(userId, cx, cy, label) {
  if (!userId || !gameState.activeUsers[userId]) {
    // Ghế trống
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, cx, cy + 4);
    return;
  }

  const u = gameState.activeUsers[userId];
  const radius = 22;

  // Vẽ vòng tròn Avatar
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();

  const img = getAvatarImage(u.avatarUrl);
  if (img && img.complete) {
    ctx.drawImage(img, cx - radius, cy - radius, radius * 2, radius * 2);
  } else {
    // Mặc định màu theo loại ghế
    ctx.fillStyle = u.seatType === 'vip1' ? '#ffd700' : (u.seatType === 'vip2' ? '#03a9f4' : '#e57373');
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    ctx.fillStyle = '#000';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(u.nickname ? u.nickname.charAt(0).toUpperCase() : '?', cx, cy + 5);
  }
  ctx.restore();

  // Viền Avatar
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.lineWidth = u.seatType === 'vip1' ? 4 : (u.seatType === 'vip2' ? 3 : 2);
  ctx.strokeStyle = u.seatType === 'vip1' ? '#ffd700' : (u.seatType === 'vip2' ? '#00e5ff' : '#ffffff');
  ctx.stroke();

  // Tên hiển thị bên dưới
  ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
  ctx.beginPath();
  ctx.roundRect(cx - 45, cy + radius + 4, 90, 18, 4);
  ctx.fill();

  ctx.fillStyle = u.seatType === 'vip1' ? '#ffeb3b' : '#ffffff';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  const shortName = u.nickname.length > 9 ? u.nickname.slice(0, 8) + '..' : u.nickname;
  ctx.fillText(shortName, cx, cy + radius + 17);

  // Cốc trà đá nhỏ trước mặt
  ctx.fillStyle = 'rgba(255, 179, 0, 0.8)';
  ctx.fillRect(cx - 6, cy - radius - 16, 12, 14);
}

// 5. VẼ XE MÁY (DREAM / WAVE) & HÀNH ĐỘNG BỐC ĐẦU / LÁI XE / CHÔM XE
function renderMotorcycleAndActions() {
  const moto = gameState.motorcycle;
  let mx = 480;
  let my = 1170;
  let angle = 0;

  if (moto.state === 'wheeling') {
    // BỐC ĐẦU XE MÁY: Bốc 1 bánh nghiêng 55 độ, rung lắc dữ dội
    angle = -Math.PI / 3.2; // Nghiêng khoảng 55 độ
    my = 1140 + Math.sin(Date.now() / 50) * 8; // Rung rồ ga
  } else if (moto.state === 'driving' || moto.state === 'stolen') {
    // Lái xe chạy trên đường
    mx = 200 + ((Date.now() / 6) % (W - 200));
  }

  ctx.save();
  ctx.translate(mx, my);
  ctx.rotate(angle);

  // Bánh xe sau
  ctx.fillStyle = '#212121';
  ctx.beginPath();
  ctx.arc(-55, 20, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#b0bec5';
  ctx.beginPath();
  ctx.arc(-55, 20, 12, 0, Math.PI * 2);
  ctx.fill();

  // Bánh xe trước
  ctx.fillStyle = '#212121';
  ctx.beginPath();
  ctx.arc(60, 20, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#b0bec5';
  ctx.beginPath();
  ctx.arc(60, 20, 12, 0, Math.PI * 2);
  ctx.fill();

  // Khung xe máy Honda Wave màu đỏ/xanh
  ctx.fillStyle = '#1565c0'; // Màu xanh Wave Alpha
  ctx.beginPath();
  ctx.moveTo(-50, 15);
  ctx.lineTo(-20, -15);
  ctx.lineTo(30, -10);
  ctx.lineTo(50, 15);
  ctx.lineTo(10, 25);
  ctx.closePath();
  ctx.fill();

  // Yên xe màu đen
  ctx.fillStyle = '#111';
  ctx.fillRect(-45, -24, 60, 12);

  // Ống xả pô xe mạ crom
  ctx.fillStyle = '#cfd8dc';
  ctx.fillRect(-50, 12, 45, 8);

  // Đầu xe & Đèn xe
  ctx.fillStyle = '#0d47a1';
  ctx.fillRect(40, -45, 18, 40);
  ctx.fillStyle = '#ffeb3b';
  ctx.beginPath();
  ctx.arc(58, -40, 8, 0, Math.PI * 2);
  ctx.fill();

  // Nếu có người đang bốc đầu hoặc lái xe: Vẽ nhân vật cưỡi trên xe
  if (moto.state === 'wheeling' || moto.state === 'driving' || moto.state === 'stolen') {
    const riderId = moto.currentRider || moto.stolenBy;
    const rider = gameState.activeUsers[riderId];
    const rName = rider ? rider.nickname : "Tổ Lái";
    const avatar = rider ? getAvatarImage(rider.avatarUrl) : null;

    // Đầu nhân vật
    ctx.save();
    ctx.beginPath();
    ctx.arc(-10, -60, 24, 0, Math.PI * 2);
    ctx.clip();
    if (avatar && avatar.complete) {
      ctx.drawImage(avatar, -34, -84, 48, 48);
    } else {
      ctx.fillStyle = '#ffb74d';
      ctx.fill();
    }
    ctx.restore();

    // Viền đầu
    ctx.beginPath();
    ctx.arc(-10, -60, 24, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#fff';
    ctx.stroke();

    // Tên quái xế
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(-60, -102, 100, 20);
    ctx.fillStyle = '#ffeb3b';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(rName.slice(0, 10), -10, -88);
  }

  ctx.restore();
}

// 6. CHÚ CÔNG AN PHƯỜNG TUẦN TRA / RƯỢT BẮT
function renderPolice() {
  if (!gameState.police.active) return;

  const px = 180 + ((Date.now() / 5) % 650);
  const py = 1110;

  // Xe cảnh sát / hoặc Chú công an đi tuần
  ctx.fillStyle = '#1b5e20'; // Màu áo công an xanh rêu
  ctx.fillRect(px, py - 60, 36, 50);

  // Mũ Kepi công an có sao vàng
  ctx.fillStyle = '#2e7d32';
  ctx.fillRect(px - 4, py - 78, 44, 18);
  ctx.fillStyle = '#ffd700';
  ctx.beginPath();
  ctx.arc(px + 18, py - 69, 5, 0, Math.PI * 2);
  ctx.fill();

  // Đèn còi hú trên đầu nhấp nháy xanh - đỏ
  const flash = Math.floor(Date.now() / 150) % 2 === 0;
  ctx.fillStyle = flash ? '#d50000' : '#29b6f6';
  ctx.beginPath();
  ctx.arc(px + 18, py - 90, 12, 0, Math.PI * 2);
  ctx.fill();

  // Nhãn "CÔNG AN PHƯỜNG"
  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  ctx.fillRect(px - 30, py - 120, 100, 20);
  ctx.fillStyle = '#00e676';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText("CÔNG AN PHƯỜNG", px + 20, py - 106);
}

// 7. VẼ HẠT KHÓI & CHAI NÉM
function renderParticles() {
  // Hạt khói xe
  particles.forEach(p => {
    ctx.save();
    ctx.fillStyle = p.color;
    ctx.globalAlpha = p.alpha;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  // Chai nhựa đang ném
  thrownBottles.forEach(b => {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.rotation);
    ctx.fillStyle = 'rgba(76, 175, 80, 0.85)'; // Chai nhựa màu xanh
    ctx.fillRect(-6, -18, 12, 36);
    ctx.fillStyle = '#ff5722'; // Nắp chai đỏ
    ctx.fillRect(-4, -22, 8, 5);
    ctx.restore();
  });
}

// 8. VẼ BONG BÓNG CHAT NỔI
function renderChatBubbles() {
  const now = Date.now();
  chatBubbles.forEach((b, i) => {
    const age = now - b.createdAt;
    const alpha = Math.max(0, 1 - (age / b.duration));
    const bx = 200 + (i * 180) % (W - 350);
    const by = 820 - (i * 45);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.strokeStyle = '#212121';
    ctx.lineWidth = 2;

    const text = `${b.user}: ${b.text}`;
    ctx.font = 'bold 13px sans-serif';
    const textW = ctx.measureText(text).width;

    ctx.beginPath();
    ctx.roundRect(bx - 10, by - 22, textW + 20, 30, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#111827';
    ctx.fillText(text, bx, by);
    ctx.restore();
  });
}
