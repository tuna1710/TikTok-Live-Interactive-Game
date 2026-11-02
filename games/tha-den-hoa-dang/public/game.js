/**
 * game.js
 * Canvas 2D Engine: Dòng Sông Ánh Trăng, Đèn Hoa Đăng & Đèn Trời Khổng Minh (60 FPS)
 */

(() => {
  const socket = io();

  const canvas = document.getElementById('riverCanvas');
  const ctx = canvas.getContext('2d');
  const container = document.querySelector('.canvas-wrapper');

  // DOM Elements
  const channelNameEl = document.getElementById('channelName');
  const channelStatusEl = document.getElementById('channelStatus');
  const totalWishesEl = document.getElementById('totalWishes');
  const totalLikesEl = document.getElementById('totalLikes');
  const wishTickerUser = document.getElementById('wishTickerUser');
  const wishTickerText = document.getElementById('wishTickerText');
  const wishTickerAvatar = document.getElementById('wishTickerAvatar');
  const audioUnlockBtn = document.getElementById('audioUnlockBtn');

  // Kích thước canvas
  function resize() {
    if (!container) return;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
  }
  window.addEventListener('resize', resize);
  setTimeout(resize, 100);

  // Mở khóa âm thanh khi bấm
  if (audioUnlockBtn) {
    audioUnlockBtn.addEventListener('click', () => {
      window.zenAudio?.startWaterAmbience();
      audioUnlockBtn.style.display = 'none';
    });
  }
  document.body.addEventListener('click', () => {
    window.zenAudio?.startWaterAmbience();
    if (audioUnlockBtn) audioUnlockBtn.style.display = 'none';
  }, { once: true });

  // Danh sách thực thể
  let lanterns = [];
  let skyLanterns = [];
  const fireflies = [];
  const stars = [];
  const sparkles = [];

  // Khởi tạo các vì sao trên bầu trời đêm
  for (let i = 0; i < 70; i++) {
    stars.push({
      x: Math.random(),
      y: Math.random() * 0.45, // nửa trên bầu trời
      size: Math.random() * 1.5 + 0.5,
      alpha: Math.random() * 0.8 + 0.2,
      twinkleSpeed: Math.random() * 0.03 + 0.01
    });
  }

  // Khởi tạo đom đóm mặt nước
  for (let i = 0; i < 20; i++) {
    fireflies.push({
      x: Math.random(),
      y: Math.random() * 0.5 + 0.4,
      vx: (Math.random() - 0.5) * 0.0006,
      vy: (Math.random() - 0.5) * 0.0004,
      size: Math.random() * 2 + 1.2,
      pulse: Math.random() * Math.PI * 2
    });
  }

  let animTick = 0;

  // ==========================================
  // VÒNG LẶP RENDER CHÍNH (60 FPS)
  // ==========================================
  function render() {
    animTick += 0.02;
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    // 1. Vẽ Bầu Trời Đêm & Dãy Núi Xa
    drawSkyAndMoon(ctx, W, H);

    // 2. Vẽ Mặt Nước Dòng Sông Ánh Trăng
    drawRiver(ctx, W, H);

    // 3. Vẽ Đèn Hoa Đăng Trôi Trên Nước
    drawLanterns(ctx, W, H);

    // 4. Vẽ Đèn Trời Khổng Minh Bay Lên Cao
    drawSkyLanterns(ctx, W, H);

    // 5. Vẽ Đom Đóm & Hạt Lấp Lánh
    drawFirefliesAndSparkles(ctx, W, H);

    requestAnimationFrame(render);
  }

  // 1. Bầu Trời, Trăng Rằm & Dãy Núi Xa
  function drawSkyAndMoon(ctx, W, H) {
    const skyHeight = H * 0.42;

    // Nền bầu trời đêm tím thẫm
    const skyGrad = ctx.createLinearGradient(0, 0, 0, skyHeight);
    skyGrad.addColorStop(0, '#04020f');
    skyGrad.addColorStop(0.6, '#0f0a28');
    skyGrad.addColorStop(1, '#1b1242');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, skyHeight);

    // Vẽ các vì sao lấp lánh
    stars.forEach(s => {
      s.alpha += Math.sin(animTick * 3 + s.x * 100) * s.twinkleSpeed;
      const clampedAlpha = Math.max(0.1, Math.min(1, s.alpha));
      ctx.fillStyle = `rgba(255, 255, 255, ${clampedAlpha})`;
      ctx.beginPath();
      ctx.arc(s.x * W, s.y * skyHeight, s.size, 0, Math.PI * 2);
      ctx.fill();
    });

    // Mặt Trăng Rằm Dát Vàng (góc trên bên phải)
    const moonX = W * 0.78;
    const moonY = H * 0.14;
    const moonR = 34;

    // Quầng sáng vạn trượng của Trăng
    const haloGrad = ctx.createRadialGradient(moonX, moonY, moonR * 0.8, moonX, moonY, moonR * 3.5);
    haloGrad.addColorStop(0, 'rgba(254, 240, 138, 0.45)');
    haloGrad.addColorStop(0.5, 'rgba(251, 191, 36, 0.15)');
    haloGrad.addColorStop(1, 'rgba(251, 191, 36, 0)');
    ctx.fillStyle = haloGrad;
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR * 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Thân Mặt Trăng
    const moonGrad = ctx.createRadialGradient(moonX - 8, moonY - 8, 4, moonX, moonY, moonR);
    moonGrad.addColorStop(0, '#ffffff');
    moonGrad.addColorStop(0.7, '#fef08a');
    moonGrad.addColorStop(1, '#f59e0b');
    ctx.fillStyle = moonGrad;
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
    ctx.fill();

    // Dãy núi xa mờ sương (Đường chân trời)
    ctx.fillStyle = '#0a061c';
    ctx.beginPath();
    ctx.moveTo(0, skyHeight);
    ctx.quadraticCurveTo(W * 0.25, skyHeight - 28, W * 0.5, skyHeight - 12);
    ctx.quadraticCurveTo(W * 0.75, skyHeight - 34, W, skyHeight - 6);
    ctx.lineTo(W, skyHeight);
    ctx.closePath();
    ctx.fill();
  }

  // 2. Dòng Sông Ánh Trăng
  function drawRiver(ctx, W, H) {
    const riverTop = H * 0.38;
    const riverHeight = H - riverTop;

    // Mặt nước sâu thẳm phản chiếu bóng đêm
    const riverGrad = ctx.createLinearGradient(0, riverTop, 0, H);
    riverGrad.addColorStop(0, '#0d0a26');
    riverGrad.addColorStop(0.35, '#08061a');
    riverGrad.addColorStop(1, '#020108');
    ctx.fillStyle = riverGrad;
    ctx.fillRect(0, riverTop, W, riverHeight);

    // Vệt trăng phản chiếu trên mặt nước
    const moonX = W * 0.78;
    const reflectGrad = ctx.createLinearGradient(moonX, riverTop, moonX, H);
    reflectGrad.addColorStop(0, 'rgba(254, 240, 138, 0.18)');
    reflectGrad.addColorStop(0.4, 'rgba(251, 191, 36, 0.08)');
    reflectGrad.addColorStop(1, 'rgba(251, 191, 36, 0)');

    ctx.fillStyle = reflectGrad;
    ctx.beginPath();
    ctx.moveTo(moonX - 25, riverTop);
    ctx.lineTo(moonX + 25, riverTop);
    ctx.lineTo(moonX + 90, H);
    ctx.lineTo(moonX - 90, H);
    ctx.closePath();
    ctx.fill();

    // Gợn sóng lăn tăn nhấp nhô
    ctx.strokeStyle = 'rgba(254, 240, 138, 0.06)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 9; i++) {
      const y = riverTop + 25 + i * 45;
      const waveShift = Math.sin(animTick + i) * 15;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(W * 0.33 + waveShift, y - 4, W * 0.66 - waveShift, y + 4, W, y);
      ctx.stroke();
    }
  }

  // 3. Vẽ Đèn Hoa Đăng
  function drawLanterns(ctx, W, H) {
    const riverTop = H * 0.38;

    // Cập nhật vị trí & trôi
    lanterns.forEach(l => {
      l.x += l.speedX + Math.sin(animTick + l.y * 10) * 0.0001;
      l.y += l.speedY;

      // Giới hạn biên màn hình
      if (l.x < 0.08) l.speedX = Math.abs(l.speedX);
      if (l.x > 0.92) l.speedX = -Math.abs(l.speedX);
    });

    // Lọc bỏ đèn trôi quá xa xuống hạ lưu (y > 1.05)
    lanterns = lanterns.filter(l => l.y < 1.05);

    // Sắp xếp đèn theo trục Y để đèn ở gần (Y lớn) vẽ đè lên đèn ở xa
    const sorted = [...lanterns].sort((a, b) => a.y - b.y);

    sorted.forEach(l => {
      const x = l.x * W;
      const y = l.y * H;
      // Kích thước phối cảnh: Càng về hạ lưu (Y gần đáy) càng to hơn
      const perspective = 0.6 + (l.y - 0.38) * 0.8;
      const scale = (l.scale || 1.0) * perspective;

      drawSingleLotusLantern(ctx, x, y, l, scale);
    });
  }

  // Chi tiết từng bông hoa sen đèn nến
  function drawSingleLotusLantern(ctx, x, y, l, scale) {
    const bobbing = Math.sin(animTick * 2.5 + l.x * 20) * (2 * scale);
    const posY = y + bobbing;

    ctx.save();
    ctx.translate(x, posY);

    // 1. Quầng sáng phản chiếu dưới mặt nước
    const glowR = 30 * scale;
    const waterGlow = ctx.createRadialGradient(0, 4 * scale, 2, 0, 4 * scale, glowR);
    waterGlow.addColorStop(0, l.color.glow || 'rgba(251, 191, 36, 0.7)');
    waterGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = waterGlow;
    ctx.beginPath();
    ctx.ellipse(0, 6 * scale, glowR, glowR * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. Các cánh hoa sen xếp tầng
    const petalCount = 8;
    for (let i = 0; i < petalCount; i++) {
      const angle = (i / petalCount) * Math.PI * 2;
      const px = Math.cos(angle) * (14 * scale);
      const py = Math.sin(angle) * (7 * scale);

      ctx.fillStyle = l.color.petal;
      ctx.beginPath();
      ctx.ellipse(px, py, 9 * scale, 5 * scale, angle, 0, Math.PI * 2);
      ctx.fill();

      // Cánh trong
      ctx.fillStyle = l.color.inner;
      ctx.beginPath();
      ctx.ellipse(px * 0.6, py * 0.6, 5 * scale, 3 * scale, angle, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Tâm nhụy sen dát vàng
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.arc(0, 0, 5 * scale, 0, Math.PI * 2);
    ctx.fill();

    // 4. Ngọn nến lung linh nhấp nháy
    const flicker = Math.sin(animTick * 12 + l.x * 50) * 1.5;
    const flameHeight = (10 + flicker) * scale;

    // Ánh lửa cam vàng
    const flameGrad = ctx.createRadialGradient(0, -flameHeight * 0.5, 1, 0, -flameHeight * 0.5, 8 * scale);
    flameGrad.addColorStop(0, '#ffffff');
    flameGrad.addColorStop(0.4, '#fef08a');
    flameGrad.addColorStop(0.8, '#f59e0b');
    flameGrad.addColorStop(1, 'rgba(239, 68, 68, 0)');
    ctx.fillStyle = flameGrad;

    ctx.beginPath();
    ctx.moveTo(-3 * scale, 0);
    ctx.quadraticCurveTo(-4 * scale, -flameHeight * 0.6, 0, -flameHeight);
    ctx.quadraticCurveTo(4 * scale, -flameHeight * 0.6, 3 * scale, 0);
    ctx.closePath();
    ctx.fill();

    // 5. Thẻ tên người ước nguyện (Nhãn nổi)
    if (scale > 0.7) {
      drawLanternLabel(ctx, l, scale);
    }

    ctx.restore();
  }

  // Nhãn tên + điều ước treo bên cạnh đèn
  function drawLanternLabel(ctx, l, scale) {
    const textY = -18 * scale;
    const name = l.nickname || 'Phật Tử';
    const wish = l.wishText || 'Cầu bình an';

    ctx.font = `bold ${Math.round(9 * scale)}px "Be Vietnam Pro", sans-serif`;
    ctx.textAlign = 'center';

    // Đo độ dài tên
    const metrics = ctx.measureText(name);
    const boxW = Math.max(60 * scale, metrics.width + 16 * scale);
    const boxH = 14 * scale;

    // Nền nhãn mờ sang trọng
    ctx.fillStyle = 'rgba(6, 4, 20, 0.75)';
    ctx.strokeStyle = l.color.petal;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(-boxW / 2, textY - boxH, boxW, boxH, 6);
    ctx.fill();
    ctx.stroke();

    // Chữ tên
    ctx.fillStyle = '#fef08a';
    ctx.fillText(name, 0, textY - 3.5 * scale);
  }

  // 4. Vẽ Đèn Trời Khổng Minh
  function drawSkyLanterns(ctx, W, H) {
    skyLanterns.forEach(sky => {
      sky.y += sky.speedY;
      sky.x += sky.speedX;
    });

    // Lọc bỏ đèn đã bay qua đỉnh màn hình
    skyLanterns = skyLanterns.filter(sky => sky.y > -0.15);

    skyLanterns.forEach(sky => {
      const x = sky.x * W;
      const y = sky.y * H;
      const scale = Math.max(0.4, 1.0 - (1 - sky.y) * 0.5);

      ctx.save();
      ctx.translate(x, y);

      // Quầng sáng vàng đỏ xung quanh đèn trời
      const r = 24 * scale;
      const glow = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r * 2.5);
      glow.addColorStop(0, 'rgba(251, 191, 36, 0.7)');
      glow.addColorStop(0.6, 'rgba(239, 68, 68, 0.25)');
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, r * 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Thân đèn lồng Khổng Minh hình thang bo tròn
      const lanternGrad = ctx.createLinearGradient(0, -r, 0, r);
      lanternGrad.addColorStop(0, '#fef08a');
      lanternGrad.addColorStop(0.4, '#f59e0b');
      lanternGrad.addColorStop(1, '#dc2626');

      ctx.fillStyle = lanternGrad;
      ctx.beginPath();
      ctx.moveTo(-10 * scale, -16 * scale);
      ctx.lineTo(10 * scale, -16 * scale);
      ctx.lineTo(14 * scale, 12 * scale);
      ctx.lineTo(-14 * scale, 12 * scale);
      ctx.closePath();
      ctx.fill();

      // Tim lửa đỏ sáng đáy đèn
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 10 * scale, 3 * scale, 0, Math.PI * 2);
      ctx.fill();

      // Nhãn tên Đại gia hảo tâm
      ctx.font = `800 ${Math.round(10 * scale)}px sans-serif`;
      ctx.fillStyle = '#ffd700';
      ctx.textAlign = 'center';
      ctx.fillText(`🏮 ${sky.nickname}`, 0, -20 * scale);

      ctx.restore();
    });
  }

  // 5. Đom đóm & Hiệu ứng lấp lánh
  function drawFirefliesAndSparkles(ctx, W, H) {
    fireflies.forEach(f => {
      f.x += f.vx;
      f.y += f.vy;
      f.pulse += 0.05;

      if (f.x < 0) f.x = 1;
      if (f.x > 1) f.x = 0;
      if (f.y < 0.38) f.y = 0.85;
      if (f.y > 0.9) f.y = 0.4;

      const alpha = (Math.sin(f.pulse) + 1) * 0.45;
      ctx.fillStyle = `rgba(167, 243, 208, ${alpha})`;
      ctx.shadowColor = '#34d399';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(f.x * W, f.y * H, f.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // Vẽ và cập nhật sparkles (khi thả tim)
    for (let i = sparkles.length - 1; i >= 0; i--) {
      const sp = sparkles[i];
      sp.alpha -= sp.decay;
      sp.y -= 0.4;

      if (sp.alpha <= 0) {
        sparkles.splice(i, 1);
        continue;
      }

      ctx.fillStyle = `rgba(254, 240, 138, ${sp.alpha})`;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, sp.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ==========================================
  // XỬ LÝ SOCKET SỰ KIỆN TỪ SERVER
  // ==========================================

  socket.on('init', data => {
    if (channelNameEl) channelNameEl.textContent = data.connectedChannel || '@live';
    if (totalWishesEl) totalWishesEl.textContent = data.totalWishes || 0;
    if (totalLikesEl) totalLikesEl.textContent = Number(data.totalLikes || 0).toLocaleString();
    if (data.lanterns) lanterns = data.lanterns;
    if (data.skyLanterns) skyLanterns = data.skyLanterns;
  });

  socket.on('newLantern', lantern => {
    lanterns.push(lantern);

    // Cập nhật dòng ticker
    if (wishTickerUser && wishTickerText) {
      wishTickerUser.textContent = `${lantern.nickname}:`;
      wishTickerText.textContent = `"${lantern.wishText}"`;
      if (wishTickerAvatar && lantern.avatar) {
        wishTickerAvatar.src = lantern.avatar;
      }
    }

    // Âm thanh
    if (lantern.type === 'normal') {
      window.zenAudio?.playChime();
    } else {
      window.zenAudio?.playSingingBowl();
    }
  });

  socket.on('newSkyLantern', sky => {
    skyLanterns.push(sky);
    window.zenAudio?.playSkyAscend();
  });

  socket.on('riverSparkle', data => {
    const W = canvas.width;
    const H = canvas.height;
    for (let i = 0; i < (data.count || 12); i++) {
      sparkles.push({
        x: Math.random() * W,
        y: (Math.random() * 0.5 + 0.42) * H,
        size: Math.random() * 2.5 + 1,
        alpha: 1,
        decay: Math.random() * 0.03 + 0.015
      });
    }
  });

  socket.on('statsUpdate', data => {
    if (totalWishesEl) totalWishesEl.textContent = data.totalWishes || 0;
    if (totalLikesEl) totalLikesEl.textContent = Number(data.totalLikes || 0).toLocaleString();
  });

  socket.on('tiktokStatus', data => {
    if (channelStatusEl) {
      channelStatusEl.className = 'channel-status ' + (data.connected ? '' : 'offline');
    }
    if (channelNameEl) {
      channelNameEl.textContent = data.channel || '@live';
    }
  });

  socket.on('clearAll', () => {
    lanterns = [];
    skyLanterns = [];
  });

  requestAnimationFrame(render);
})();
