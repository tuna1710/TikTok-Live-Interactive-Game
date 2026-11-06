/**
 * game.js - Logic tương tác client cho game Bạn Có Thông Minh Hơn Học Sinh Lớp 5?
 */

const socket = io();

// DOM Elements
const gradeBadge = document.getElementById('gradeBadge');
const subjectBadge = document.getElementById('subjectBadge');
const roundBadge = document.getElementById('roundBadge');
const likesCount = document.getElementById('likesCount');
const questionText = document.getElementById('questionText');
const optBtnA = document.getElementById('optBtnA');
const optBtnB = document.getElementById('optBtnB');
const optBtnC = document.getElementById('optBtnC');
const optBtnD = document.getElementById('optBtnD');
const optTextA = document.getElementById('optTextA');
const optTextB = document.getElementById('optTextB');
const optTextC = document.getElementById('optTextC');
const optTextD = document.getElementById('optTextD');
const answeredStatsText = document.getElementById('answeredStatsText');
const timerBadgeText = document.getElementById('timerBadgeText');
const timerFill = document.getElementById('timerFill');
const revealExplanation = document.getElementById('revealExplanation');

const teacherSpeechBubble = document.getElementById('teacherSpeechBubble');
const presidentAvatar = document.getElementById('presidentAvatar');
const presidentName = document.getElementById('presidentName');
const presidentRuleTip = document.getElementById('presidentRuleTip');

const deskBankLeft = document.getElementById('deskBankLeft');
const deskBankRight = document.getElementById('deskBankRight');
const giftBannerPopup = document.getElementById('giftBannerPopup');
const giftBannerText = document.getElementById('giftBannerText');
const followBannerPopup = document.getElementById('followBannerPopup');
const followBannerText = document.getElementById('followBannerText');
const confettiCanvas = document.getElementById('confettiCanvas');

let currentGameState = 'QUESTION';
let totalDuration = 20;
let currentDuration = 20;
let soundEnabled = true;

// ==========================================
// HỆ THỐNG GIỌNG NÓI TTS CÔ GIÁO (HÀNG ĐỢI ƯU TIÊN)
// ==========================================
// Ưu tiên đọc:
// 1: Lên làm lớp trưởng (Cao nhất)
// 2: Follow kênh (Ưu tiên 2)
// 3: Đọc câu hỏi, công bố đáp án, câu thoại thông thường
let ttsAudio = new Audio();
let ttsQueue = []; // Mỗi phần tử: { text, priority, time }
let isPlayingTts = false;
let currentTtsItem = null;

function playTeacherVoice(text, priority = 3) {
  if (!text) return;
  const clean = text
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
    .trim();
  if (!clean) return;

  const item = { text: clean, priority: Number(priority) || 3, time: Date.now() };

  // 1: Lớp trưởng (Ưu tiên 1 - Cao nhất)
  // Nếu đang đọc câu thoại bình thường (priority > 1), ngắt ngay lập tức để xướng tên Lớp Trưởng!
  if (item.priority === 1 && isPlayingTts && currentTtsItem && currentTtsItem.priority > 1) {
    try {
      ttsAudio.pause();
      ttsAudio.currentTime = 0;
    } catch (e) {}
    isPlayingTts = false;
    currentTtsItem = null;
    insertTtsItem(item);
    processTtsQueue();
    return;
  }

  // 2: Follow kênh (Ưu tiên 2)
  // Nếu đang đọc câu thoại thường (priority >= 3), ngắt để cảm ơn bạn vừa Follow kênh!
  if (item.priority === 2 && isPlayingTts && currentTtsItem && currentTtsItem.priority >= 3) {
    try {
      ttsAudio.pause();
      ttsAudio.currentTime = 0;
    } catch (e) {}
    isPlayingTts = false;
    currentTtsItem = null;
    insertTtsItem(item);
    processTtsQueue();
    return;
  }

  // Chèn vào hàng đợi có sắp xếp theo độ ưu tiên
  insertTtsItem(item);

  if (!isPlayingTts) {
    processTtsQueue();
  }
}

function insertTtsItem(item) {
  // Sắp xếp theo priority tăng dần (1 -> 2 -> 3). Cùng priority thì FIFO
  let inserted = false;
  for (let i = 0; i < ttsQueue.length; i++) {
    if (item.priority < ttsQueue[i].priority) {
      ttsQueue.splice(i, 0, item);
      inserted = true;
      break;
    }
  }
  if (!inserted) {
    ttsQueue.push(item);
  }

  // Lọc bớt câu thường (priority >= 3) nếu hàng đợi tích tụ quá 2 câu thường
  let normalCount = 0;
  for (let i = ttsQueue.length - 1; i >= 0; i--) {
    if (ttsQueue[i].priority >= 3) {
      normalCount++;
      if (normalCount > 2) {
        ttsQueue.splice(i, 1);
      }
    }
  }
}

function processTtsQueue() {
  if (ttsQueue.length === 0) {
    isPlayingTts = false;
    currentTtsItem = null;
    return;
  }
  isPlayingTts = true;
  currentTtsItem = ttsQueue.shift();

  if (teacherSpeechBubble && currentTtsItem.text) {
    teacherSpeechBubble.textContent = currentTtsItem.text;
  }

  const url = `/api/tts?text=${encodeURIComponent(currentTtsItem.text)}`;
  ttsAudio.src = url;
  ttsAudio.play().catch(e => {
    console.log('TTS autoplay policy:', e);
    setTimeout(() => {
      isPlayingTts = false;
      currentTtsItem = null;
      processTtsQueue();
    }, 1200);
  });

  ttsAudio.onended = () => {
    isPlayingTts = false;
    currentTtsItem = null;
    setTimeout(processTtsQueue, 350);
  };
  ttsAudio.onerror = () => {
    isPlayingTts = false;
    currentTtsItem = null;
    setTimeout(processTtsQueue, 350);
  };
}

// ==========================================
// KHỞI TẠO BÀN HỌC (40 BÀN)
// ==========================================
const deskElements = [];

function initDesks() {
  deskBankLeft.innerHTML = '';
  deskBankRight.innerHTML = '';
  deskElements.length = 0;

  for (let i = 0; i < 40; i++) {
    const isRight = i >= 20;
    const deskWrap = document.createElement('div');
    deskWrap.className = 'desk-unit';
    deskWrap.id = `desk_${i}`;

    deskWrap.innerHTML = `
      <div class="student-seated" id="student_wrap_${i}" style="display: none;">
        <div class="answer-bubble" id="ans_bubble_${i}" style="display: none;"></div>
        <div class="result-mark" id="res_mark_${i}" style="display: none;"></div>
        <div class="student-chat-bubble" id="chat_bubble_${i}" style="display: none;"></div>
        <div class="student-backpack" id="backpack_${i}">
          <div class="red-scarf"></div>
        </div>
        <div class="student-tag-name" id="tag_name_${i}">---</div>
      </div>
      <div class="wooden-desk"></div>
    `;

    if (isRight) {
      deskBankRight.appendChild(deskWrap);
    } else {
      deskBankLeft.appendChild(deskWrap);
    }

    deskElements.push(deskWrap);
  }
}

initDesks();

// Cập nhật vị trí học sinh trên bàn
function updateDeskStudent(deskId, student) {
  const studentWrap = document.getElementById(`student_wrap_${deskId}`);
  const tagName = document.getElementById(`tag_name_${deskId}`);
  const backpack = document.getElementById(`backpack_${deskId}`);
  const ansBubble = document.getElementById(`ans_bubble_${deskId}`);
  const resMark = document.getElementById(`res_mark_${deskId}`);

  if (!student) {
    if (studentWrap) studentWrap.style.display = 'none';
    return;
  }

  if (studentWrap) studentWrap.style.display = 'flex';
  if (tagName) tagName.textContent = student.nickname || student.username;
  if (backpack) backpack.style.background = student.bagColor || '#3b82f6';

  // Hiển thị đáp án đang chọn
  if (student.currentAnswer && currentGameState === 'QUESTION') {
    if (ansBubble) {
      ansBubble.style.display = 'flex';
      ansBubble.textContent = student.currentAnswer;
    }
  } else if (!student.currentAnswer) {
    if (ansBubble) ansBubble.style.display = 'none';
  }

  // Hiển thị kết quả đúng / sai
  if (student.isCorrect !== null && student.isCorrect !== undefined && currentGameState === 'REVEAL') {
    if (resMark) {
      resMark.style.display = 'flex';
      resMark.className = `result-mark ${student.isCorrect ? 'correct' : 'wrong'}`;
      resMark.textContent = student.isCorrect ? '✓' : '✗';
    }
  } else {
    if (resMark) resMark.style.display = 'none';
  }
}

// Hiển thị bóng chat trên đầu học sinh
function showStudentChat(deskId, message) {
  const chatBubble = document.getElementById(`chat_bubble_${deskId}`);
  if (!chatBubble) return;
  chatBubble.textContent = message;
  chatBubble.style.display = 'block';

  // Tự ẩn sau 3.5s
  setTimeout(() => {
    chatBubble.style.display = 'none';
  }, 3500);
}

// Cập nhật câu hỏi lên bảng đen
function updateQuestionUI(q, round) {
  if (round) roundBadge.textContent = `Câu ${round}/30`;
  if (q) {
    gradeBadge.textContent = q.grade || 'Lớp 3';
    subjectBadge.textContent = q.subject || 'Toán';
    questionText.textContent = q.question || '';
    optTextA.textContent = q.options?.A || '';
    optTextB.textContent = q.options?.B || '';
    optTextC.textContent = q.options?.C || '';
    optTextD.textContent = q.options?.D || '';
  }

  // Reset hiệu ứng đáp án
  [optBtnA, optBtnB, optBtnC, optBtnD].forEach(btn => {
    btn.classList.remove('is-correct', 'is-wrong');
  });

  revealExplanation.textContent = '💡 Bình luận A, B, C hoặc D để ghi điểm vào lớp!';
}

// ==========================================
// SOCKET.IO EVENT HANDLERS
// ==========================================
socket.on('init_game', data => {
  currentGameState = data.gameState;
  totalDuration = data.timerCountdown || 20;
  currentDuration = totalDuration;

  if (data.currentQuestion) {
    updateQuestionUI(data.currentQuestion, data.roundNumber);
  }

  if (data.totalLikes !== undefined) {
    likesCount.textContent = Number(data.totalLikes).toLocaleString();
  }

  if (data.classPresident) {
    updatePresidentUI(data.classPresident);
  }

  if (data.teacherSpeech) {
    teacherSpeechBubble.textContent = data.teacherSpeech.text;
  }

  if (data.desks) {
    data.desks.forEach(d => {
      updateDeskStudent(d.id, d.student);
    });
  }
});

socket.on('round_question', data => {
  currentGameState = 'QUESTION';
  totalDuration = data.duration || 20;
  currentDuration = totalDuration;

  updateQuestionUI(data.question, data.roundNumber);

  // Xóa các biểu tượng Đúng / Sai vòng trước
  for (let i = 0; i < 40; i++) {
    const resMark = document.getElementById(`res_mark_${i}`);
    const ansBubble = document.getElementById(`ans_bubble_${i}`);
    if (resMark) resMark.style.display = 'none';
    if (ansBubble) ansBubble.style.display = 'none';
  }

  answeredStatsText.textContent = '✍️ Đã có 0 bạn trả lời';
  timerFill.style.width = '100%';

  if (data.teacherSpeech) {
    teacherSpeechBubble.textContent = data.teacherSpeech.text;
    playTeacherVoice(data.teacherSpeech.text, data.teacherSpeech.priority || 3);
  }

  if (window.soundManager) window.soundManager.playSchoolBell();
});

socket.on('round_reveal', data => {
  currentGameState = 'REVEAL';

  // Highlight đáp án đúng
  const correctOpt = data.correct; // 'A', 'B', 'C', 'D'
  const mapBtn = { A: optBtnA, B: optBtnB, C: optBtnC, D: optBtnD };

  ['A', 'B', 'C', 'D'].forEach(letter => {
    if (letter === correctOpt) {
      mapBtn[letter].classList.add('is-correct');
    } else {
      mapBtn[letter].classList.add('is-wrong');
    }
  });

  // Hiển thị lời giải thích & tỉ lệ đúng
  revealExplanation.textContent = `${data.explanation || ''} • ${data.stats.correctCount}/${data.stats.total} bạn đúng!`;

  if (data.teacherSpeech) {
    teacherSpeechBubble.textContent = data.teacherSpeech.text;
    playTeacherVoice(data.teacherSpeech.text, data.teacherSpeech.priority || 3);
  }

  // Cập nhật dấu Đúng / Sai trên từng bàn học sinh
  if (data.desks) {
    data.desks.forEach(d => {
      if (d.student) {
        const resMark = document.getElementById(`res_mark_${d.id}`);
        const ansBubble = document.getElementById(`ans_bubble_${d.id}`);
        if (ansBubble) ansBubble.style.display = 'none';
        if (resMark) {
          resMark.style.display = 'flex';
          resMark.className = `result-mark ${d.student.isCorrect ? 'correct' : 'wrong'}`;
          resMark.textContent = d.student.isCorrect ? '✓' : '✗';
        }
      }
    });
  }

  if (data.stats.correctCount > 0) {
    if (window.soundManager) window.soundManager.playCorrect();
    spawnConfetti(40);
  } else {
    if (window.soundManager) window.soundManager.playWrong();
  }
});

socket.on('timer_tick', data => {
  currentDuration = data.timerCountdown;
  timerBadgeText.textContent = `⏱️ ${currentDuration}s`;

  if (totalDuration > 0) {
    const pct = Math.max(0, Math.min(100, (currentDuration / totalDuration) * 100));
    timerFill.style.width = `${pct}%`;
  }

  if (currentDuration <= 5 && currentDuration > 0 && currentGameState === 'QUESTION') {
    if (window.soundManager) window.soundManager.playTick();
  }

  if (data.presidentRemaining > 0) {
    presidentRuleTip.textContent = `⏳ Còn ${data.presidentRemaining}s giữ chức`;
  } else {
    presidentRuleTip.textContent = '🎁 Tặng quà lên bục';
  }
});

socket.on('student_answered', data => {
  const ansBubble = document.getElementById(`ans_bubble_${data.deskId}`);
  if (ansBubble) {
    ansBubble.style.display = 'flex';
    ansBubble.textContent = data.answer;
  }

  answeredStatsText.textContent = `✍️ Đã có ${data.stats.total} bạn trả lời`;
  if (window.soundManager) window.soundManager.playPop();
});

socket.on('student_chat', data => {
  showStudentChat(data.deskId, data.message);
});

// Sự kiện Lên làm lớp trưởng (Ưu tiên đọc #1 - Cao nhất)
socket.on('new_class_president', data => {
  updatePresidentUI(data.president);

  // Hiển thị banner chúc mừng
  giftBannerText.textContent = `${data.president.nickname} tặng ${data.giftName} lên làm Lớp Trưởng!`;
  giftBannerPopup.classList.add('active');
  setTimeout(() => giftBannerPopup.classList.remove('active'), 4500);

  if (data.teacherSpeech) {
    teacherSpeechBubble.textContent = data.teacherSpeech.text;
    playTeacherVoice(data.teacherSpeech.text, data.teacherSpeech.priority || 1);
  }

  if (window.soundManager) window.soundManager.playFanfare();
  spawnConfetti(80);
});

// Sự kiện Follow kênh (Ưu tiên đọc #2)
socket.on('user_follow', data => {
  if (data.user) {
    showFollowBanner(data.user);
  }

  if (data.teacherSpeech) {
    playTeacherVoice(data.teacherSpeech.text, data.teacherSpeech.priority || 2);
  }

  if (window.soundManager) window.soundManager.playPop();
});

function showFollowBanner(user) {
  if (!followBannerPopup || !followBannerText) return;
  const name = user.nickname || user.username || 'Khán giả';
  followBannerText.textContent = `Cảm ơn ${name} đã bấm Follow lớp học! ❤️`;
  followBannerPopup.classList.add('active');
  setTimeout(() => {
    followBannerPopup.classList.remove('active');
  }, 4000);
}

socket.on('president_expired', () => {
  presidentName.textContent = 'Đang trống';
  presidentAvatar.src = 'https://api.dicebear.com/7.x/bottts/svg?seed=vacant';
  presidentRuleTip.textContent = '🎁 Tặng quà lên bục';
});

socket.on('likes_update', data => {
  likesCount.textContent = Number(data.totalLikes).toLocaleString();
  spawnFloatingHeart();
});

socket.on('celebration_effect', () => {
  spawnConfetti(60);
});

socket.on('game_state_update', data => {
  if (data.desks) {
    data.desks.forEach(d => updateDeskStudent(d.id, d.student));
  }
});

function updatePresidentUI(p) {
  if (!p) return;
  presidentName.textContent = p.nickname || 'Đang trống';
  if (p.avatar) presidentAvatar.src = p.avatar;
}

// Trái tim bay khi có Like
function spawnFloatingHeart() {
  const heart = document.createElement('div');
  heart.className = 'floating-heart';
  const emojis = ['❤️', '💖', '⭐', '✨', '🌹'];
  heart.textContent = emojis[Math.floor(Math.random() * emojis.length)];
  document.querySelector('.game-viewport').appendChild(heart);
  setTimeout(() => heart.remove(), 2000);
}

// ==========================================
// HỆ THỐNG PHÁO GIẤY CONFETTI
// ==========================================
const ctx = confettiCanvas.getContext('2d');
let particles = [];

function resizeCanvas() {
  confettiCanvas.width = confettiCanvas.parentElement.clientWidth;
  confettiCanvas.height = confettiCanvas.parentElement.clientHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function spawnConfetti(count = 50) {
  const colors = ['#f43f5e', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#ffffff'];
  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * confettiCanvas.width,
      y: -10,
      w: Math.random() * 8 + 4,
      h: Math.random() * 8 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 4,
      vy: Math.random() * 4 + 3,
      rot: Math.random() * 360,
      vRot: (Math.random() - 0.5) * 10
    });
  }
}

function renderConfetti() {
  ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.rot += p.vRot;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate((p.rot * Math.PI) / 180);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    ctx.restore();

    if (p.y > confettiCanvas.height + 20) {
      particles.splice(i, 1);
    }
  }
  requestAnimationFrame(renderConfetti);
}
renderConfetti();

// Cho phép bấm màn hình bất kỳ đâu để kích hoạt Web Audio API
document.addEventListener('click', () => {
  if (window.soundManager) window.soundManager.init();
}, { once: true });
