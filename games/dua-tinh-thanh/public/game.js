/**
 * game.js
 * Canvas 2D Renderer & Game Controller cho Đua Tỉnh Thành
 */

(() => {
  const socket = io();

  // Canvas & Context
  const canvas = document.getElementById('raceCanvas');
  const ctx = canvas.getContext('2d');
  const container = document.querySelector('.track-wrapper');

  // DOM Elements
  const phaseText = document.getElementById('phaseText');
  const phaseTimer = document.getElementById('phaseTimer');
  const raceNumberEl = document.getElementById('raceNumber');
  const channelStatusEl = document.getElementById('channelStatus');
  const channelNameEl = document.getElementById('channelName');
  const eventFeedEl = document.getElementById('eventFeed');
  const winnerOverlay = document.getElementById('winnerOverlay');
  const winnerFlag = document.getElementById('winnerFlag');
  const winnerName = document.getElementById('winnerName');
  const winnerSupportersList = document.getElementById('winnerSupportersList');
  const totalLikesCount = document.getElementById('totalLikesCount');

  // State cục bộ
  let gameState = {
    raceNumber: 1,
    phase: 'waiting',
    phaseTimeLeft: 0,
    finishDistance: 1000,
    lanes: [],
    winner: null
  };

  // Hệ thống hạt hiệu ứng Nitro & Bụi đường đua
  const particles = [];

  function createNitroParticles(x, y, color) {
    for (let i = 0; i < 12; i++) {
      particles.push({
        x: x - 10,
        y: y + (Math.random() * 16 - 8),
        vx: -(Math.random() * 4 + 3),
        vy: (Math.random() * 2 - 1),
        radius: Math.random() * 4 + 2,
        color: Math.random() > 0.4 ? color : '#ffd700',
        alpha: 1,
        decay: Math.random() * 0.04 + 0.02
      });
    }
  }

  // Tự động căn chỉnh kích thước Canvas
  function resizeCanvas() {
    if (!container) return;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
  }
  window.addEventListener('resize', resizeCanvas);
  setTimeout(resizeCanvas, 100);

  // Khởi tạo hoạt ảnh bước chạy ngựa (Galloping Cycle)
  let animTick = 0;

  // ==========================================
  // RENDER VÒNG LẶP CANVAS (60 FPS)
  // ==========================================
  function render() {
    animTick += 0.15;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const W = canvas.width;
    const H = canvas.height;
    const laneCount = gameState.lanes.length || 5;
    const laneHeight = H / laneCount;
    const startX = 65; // Chừa chỗ cho Tên tỉnh & Avatar bên trái
    const finishX = W - 35; // Vạch đích bên phải
    const trackWidth = finishX - startX;

    // 1. Vẽ các làn đua
    gameState.lanes.forEach((lane, idx) => {
      const y = idx * laneHeight;

      // Nền làn đua xen kẽ
      ctx.fillStyle = idx % 2 === 0 ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.15)';
      ctx.fillRect(0, y, W, laneHeight);

      // Đường kẻ phân làn phản quang
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(0, y + laneHeight);
      ctx.lineTo(W, y + laneHeight);
      ctx.stroke();
      ctx.setLineDash([]);

      // Nhãn Tỉnh thành bên trái
      ctx.fillStyle = lane.color;
      ctx.fillRect(0, y + 2, 4, laneHeight - 4); // Dải màu đánh dấu

      ctx.font = 'bold 11px "Be Vietnam Pro", sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${lane.flag} ${lane.name}`, 10, y + laneHeight * 0.32);

      // Tiến độ %
      const progress = Math.min(1, (lane.distance || 0) / gameState.finishDistance);
      ctx.font = '800 10px sans-serif';
      ctx.fillStyle = lane.color;
      ctx.fillText(`${Math.round(progress * 100)}%`, 10, y + laneHeight * 0.72);

      // Thanh tiến độ phía dưới làn
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.fillRect(startX, y + laneHeight - 6, trackWidth, 4);

      ctx.fillStyle = lane.color;
      ctx.shadowColor = lane.color;
      ctx.shadowBlur = lane.nitroActive ? 12 : 4;
      ctx.fillRect(startX, y + laneHeight - 6, trackWidth * progress, 4);
      ctx.shadowBlur = 0;

      // Tọa độ của Ngựa trên đường đua
      const horseX = startX + trackWidth * progress;
      const horseY = y + laneHeight * 0.5;

      // Nếu đang Nitro: phụt lửa hạt
      if (lane.nitroActive || Math.random() < 0.15 && gameState.phase === 'racing') {
        createNitroParticles(horseX, horseY, lane.color);
      }

      // 2. Vẽ Chiến mã & Kỵ sĩ đại diện
      drawHorse(ctx, horseX, horseY, lane, animTick + idx);
    });

    // 3. Vẽ vạch đích ca-rô (Checkered Finish Line)
    drawFinishLine(ctx, finishX, 0, H);

    // 4. Cập nhật và vẽ các hạt hiệu ứng
    updateAndDrawParticles(ctx);

    requestAnimationFrame(render);
  }

  // Vẽ hình Chiến mã phong cách đồ họa neon
  function drawHorse(ctx, x, y, lane, cycle) {
    const isRunning = gameState.phase === 'racing';
    const bounce = isRunning ? Math.sin(cycle * 3) * 3 : 0;
    const legSwing = isRunning ? Math.sin(cycle * 3) * 6 : 0;

    ctx.save();
    ctx.translate(x, y + bounce);

    // Vòng tròn hào quang phát sáng của kỵ sĩ
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.fillStyle = lane.color + '33';
    ctx.fill();

    // Vòng bo viền kỵ sĩ
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fillStyle = lane.color;
    ctx.shadowColor = lane.color;
    ctx.shadowBlur = lane.nitroActive ? 15 : 6;
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Linh vật / Mascot bên trong vòng tròn
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(lane.mascot || '🏇', 0, 1);

    // Hiệu ứng tia lửa Nitro gắn phía sau đuôi
    if (lane.nitroActive) {
      ctx.font = '12px sans-serif';
      ctx.fillText('🔥', -20, 0);
    }

    ctx.restore();
  }

  // Vẽ vạch đích ca-rô
  function drawFinishLine(ctx, x, y, h) {
    const squareSize = 6;
    const cols = 2;
    const rows = Math.ceil(h / squareSize);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? '#ffffff' : '#111111';
        ctx.fillRect(x + c * squareSize, y + r * squareSize, squareSize, squareSize);
      }
    }

    // Biển báo Đích
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ĐÍCH', x + squareSize, 12);
  }

  // Cập nhật hạt
  function updateAndDrawParticles(ctx) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.alpha -= p.decay;

      if (p.alpha <= 0) {
        particles.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // ==========================================
  // XỬ LÝ SỰ KIỆN GIAO DIỆN & SOCKET
  // ==========================================

  function updateHUD() {
    raceNumberEl.textContent = `Chặng ${gameState.raceNumber}`;

    if (gameState.phase === 'waiting') {
      phaseText.innerHTML = '🏇 Chờ bình luận/tặng quà để xuất phát...';
      phaseTimer.style.display = 'none';
    } else if (gameState.phase === 'countdown') {
      phaseText.innerHTML = `⏳ Sắp xuất phát trong...`;
      phaseTimer.style.display = 'inline-block';
      phaseTimer.textContent = `${gameState.phaseTimeLeft}s`;
    } else if (gameState.phase === 'racing') {
      phaseText.innerHTML = `🏁 CUỘC ĐUA ĐANG DIỄN RA!`;
      phaseTimer.style.display = 'inline-block';
      phaseTimer.textContent = `${gameState.phaseTimeLeft}s`;
    } else if (gameState.phase === 'finished') {
      phaseText.innerHTML = `🎉 ${gameState.winner?.name || 'Chiến thắng'} VỀ NHẤT!`;
      phaseTimer.style.display = 'none';
    } else if (gameState.phase === 'cooldown') {
      phaseText.innerHTML = `⏳ Chuẩn bị chặng đua mới...`;
      phaseTimer.style.display = 'inline-block';
      phaseTimer.textContent = `${gameState.phaseTimeLeft}s`;
    }
  }

  // Socket Listeners
  socket.on('init', data => {
    gameState = { ...gameState, ...data };
    if (channelNameEl) channelNameEl.textContent = data.connectedChannel || '@live';
    updateHUD();
  });

  socket.on('stateUpdate', data => {
    gameState = { ...gameState, ...data };
    updateHUD();
  });

  socket.on('phaseChange', data => {
    const prevPhase = gameState.phase;
    gameState.phase = data.phase;
    gameState.phaseTimeLeft = data.timeLeft || 0;
    gameState.winner = data.winner;
    updateHUD();

    if (data.phase === 'countdown') {
      winnerOverlay.classList.remove('show');
      window.soundSystem?.playBeep(false);
    } else if (data.phase === 'racing') {
      window.soundSystem?.playWhistle();
    } else if (data.phase === 'finished' && data.winner) {
      showWinnerModal(data.winner);
      window.soundSystem?.playVictory();
    }
  });

  socket.on('timerTick', data => {
    gameState.phaseTimeLeft = data.timeLeft;
    updateHUD();

    if (gameState.phase === 'countdown') {
      if (data.timeLeft <= 3 && data.timeLeft > 0) {
        window.soundSystem?.playBeep(false);
      } else if (data.timeLeft === 0) {
        window.soundSystem?.playBeep(true);
      }
    }
  });

  socket.on('laneMove', data => {
    const lane = gameState.lanes.find(l => l.id === data.laneId);
    if (lane) {
      lane.distance = data.distance;
    }
  });

  socket.on('laneBoost', data => {
    const lane = gameState.lanes.find(l => l.id === data.laneId);
    if (lane) {
      lane.distance = data.distance;
      lane.nitroActive = true;
      setTimeout(() => { lane.nitroActive = false; }, 2000);
    }

    // Hiệu ứng âm thanh & popup
    window.soundSystem?.playNitro();
    showFloatingGift(data);
  });

  socket.on('likeUpdate', data => {
    if (totalLikesCount) {
      totalLikesCount.textContent = Number(data.totalLikes).toLocaleString();
    }
  });

  socket.on('tiktokStatus', data => {
    if (channelStatusEl) {
      channelStatusEl.className = 'channel-status ' + (data.connected ? '' : 'offline');
    }
    if (channelNameEl) {
      channelNameEl.textContent = data.channel || '@live';
    }
  });

  socket.on('newEvent', evt => {
    renderFeedItem(evt);
  });

  function renderFeedItem(evt) {
    if (!eventFeedEl) return;
    const div = document.createElement('div');
    div.className = `feed-item ${evt.type}`;

    if (evt.type === 'gift') {
      div.innerHTML = `${evt.giftEmoji} <b>${evt.nickname}</b> tặng quà cho <b>${evt.laneName}</b> (+${evt.distance}m)!`;
    } else if (evt.type === 'vote') {
      div.innerHTML = `💬 <b>${evt.nickname}</b> cổ vũ <b>${evt.laneName}</b>!`;
    } else if (evt.type === 'cheer') {
      div.innerHTML = `❤️ <b>${evt.nickname}</b> đã thả tim tiếp sức cho <b>${evt.laneName}</b>!`;
    } else {
      div.innerHTML = `💬 <b>${evt.nickname}:</b> ${evt.comment}`;
    }

    eventFeedEl.insertBefore(div, eventFeedEl.firstChild);
    while (eventFeedEl.children.length > 5) {
      eventFeedEl.removeChild(eventFeedEl.lastChild);
    }
  }

  function showFloatingGift(data) {
    const container = document.querySelector('.game-container');
    if (!container) return;

    const popup = document.createElement('div');
    popup.className = 'floating-gift';
    popup.innerHTML = `<span>${data.giftEmoji}</span> <span>${data.user}: +${data.addedDist}m</span>`;
    popup.style.left = '50%';
    popup.style.top = '40%';
    popup.style.transform = 'translate(-50%, -50%)';

    container.appendChild(popup);
    setTimeout(() => { popup.remove(); }, 1800);
  }

  function showWinnerModal(winner) {
    if (!winnerOverlay) return;
    winnerFlag.textContent = `${winner.flag} ${winner.mascot}`;
    winnerName.textContent = `${winner.name} VÔ ĐỊCH!`;
    winnerName.style.color = winner.color;

    // Danh sách Top 3 Nhà tài trợ
    winnerSupportersList.innerHTML = '';
    if (winner.topSupporters && winner.topSupporters.length > 0) {
      winner.topSupporters.forEach((sup, idx) => {
        const row = document.createElement('div');
        row.className = 'supporter-row';
        row.innerHTML = `
          <span class="supporter-rank">#${idx + 1}</span>
          <span class="supporter-name">${sup.nickname}</span>
          <span class="supporter-points">+${sup.totalContrib}m</span>
        `;
        winnerSupportersList.appendChild(row);
      });
    } else {
      winnerSupportersList.innerHTML = '<div style="font-size:11px; color:#94a3b8; padding:4px;">Cộng đồng khán giả cùng tiếp sức!</div>';
    }

    winnerOverlay.classList.add('show');

    // Bắn pháo hoa rực rỡ
    if (typeof confetti === 'function') {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      });
      setTimeout(() => {
        confetti({
          particleCount: 50,
          angle: 60,
          spread: 55,
          origin: { x: 0 }
        });
        confetti({
          particleCount: 50,
          angle: 120,
          spread: 55,
          origin: { x: 1 }
        });
      }, 400);
    }
  }

  // Khởi động vòng lặp render
  requestAnimationFrame(render);
})();
