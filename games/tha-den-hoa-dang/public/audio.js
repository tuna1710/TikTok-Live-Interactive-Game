/**
 * audio.js
 * Hệ thống âm thanh thiền định & Giọng đọc AI tiếng Việt (TTS)
 * - Tự động tổng hợp tiếng suối chảy, chuông gió phong thủy, chuông ngân.
 * - Hàng đợi giọng đọc AI (TTS) tiếng Việt dịu dàng cảm ơn người tặng quà và đọc lời chúc.
 * - Tự động hạ nhỏ tiếng suối khi giọng đọc phát (Auto-ducking).
 * - 100% không lo bị quét bản quyền âm thanh!
 */

class ZenAudioEngine {
  constructor() {
    this.ctx = null;
    this.unlocked = false;
    this.waterNode = null;
    this.waterGain = null;
    this.waterFilter = null;
    this.waterRunning = false;
    this.sfxEnabled = true;

    // Cấu hình Giọng đọc AI (TTS)
    this.ttsEnabled = true;
    this.ttsQueue = [];
    this.ttsPlaying = false;
    this.currentAudio = null;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    this.unlocked = true;
  }

  // 1. Tiếng dòng nước róc rách đêm trăng (Tạo bằng thuật toán Brownian/Pink Noise)
  startWaterAmbience() {
    if (this.waterRunning) return;
    this.init();

    try {
      const bufferSize = this.ctx.sampleRate * 2;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);

      let lastOut = 0.0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        data[i] = (lastOut + 0.02 * white) / 1.02;
        lastOut = data[i];
        data[i] *= 3.5;
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(380, this.ctx.currentTime);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.12, this.ctx.currentTime);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      noise.start();
      this.waterNode = noise;
      this.waterGain = gain;
      this.waterFilter = filter;
      this.waterRunning = true;

      this._startWaterLFO();
    } catch (e) {
      console.warn('Không thể khởi tạo tiếng nước:', e);
    }
  }

  _startWaterLFO() {
    if (!this.ctx || !this.waterFilter) return;
    setInterval(() => {
      if (this.waterFilter && this.ctx) {
        const freq = 340 + Math.sin(Date.now() / 1400) * 80;
        this.waterFilter.frequency.setValueAtTime(freq, this.ctx.currentTime);
      }
    }, 200);
  }

  duckWaterVolume() {
    if (this.waterGain && this.ctx) {
      this.waterGain.gain.setValueAtTime(0.03, this.ctx.currentTime);
    }
  }

  restoreWaterVolume() {
    if (this.waterGain && this.ctx) {
      this.waterGain.gain.setValueAtTime(0.12, this.ctx.currentTime);
    }
  }

  // 2. Tiếng Chuông Gió Phong Thủy (Khi thả đèn hoa đăng)
  playChime() {
    if (!this.sfxEnabled) return;
    this.init();

    const frequencies = [880, 1108.73, 1318.51, 1661.22, 1975.53];
    const f = frequencies[Math.floor(Math.random() * frequencies.length)];

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(f, this.ctx.currentTime);

    gain.gain.setValueAtTime(0.18, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 2.2);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 2.2);
  }

  // 3. Tiếng Chuông Đồng Ngân Vang (Khi tặng Đèn Sen Vàng / Đèn Thất Bảo)
  playSingingBowl() {
    if (!this.sfxEnabled) return;
    this.init();

    const baseF = 432;
    [baseF, baseF * 1.5, baseF * 2.7].forEach((f, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, this.ctx.currentTime);

      const vol = 0.15 / (idx + 1);
      gain.gain.setValueAtTime(vol, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 3.5);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 3.5);
    });
  }

  // 4. Tiếng Đèn Lồng Khổng Minh Bay Lên Bầu Trời Sao
  playSkyAscend() {
    if (!this.sfxEnabled) return;
    this.init();

    const chord = [523.25, 659.25, 783.99, 1046.50, 1318.51];
    chord.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime + idx * 0.12);

      gain.gain.setValueAtTime(0.16, this.ctx.currentTime + idx * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + idx * 0.12 + 2.5);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(this.ctx.currentTime + idx * 0.12);
      osc.stop(this.ctx.currentTime + idx * 0.12 + 2.5);
    });
  }

  // ==========================================
  // 5. HÀNG ĐỢI GIỌNG ĐỌC AI TIẾNG VIỆT (TTS)
  // ==========================================

  speak(text) {
    if (!this.ttsEnabled || !text) return;
    // Giới hạn độ dài câu nói
    const clean = text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();
    if (!clean) return;

    // Không để hàng đợi quá 5 câu để tránh dồn ứ âm thanh
    if (this.ttsQueue.length > 4) {
      this.ttsQueue.splice(1, 1);
    }
    this.ttsQueue.push(clean.slice(0, 140));
    this.processTtsQueue();
  }

  processTtsQueue() {
    if (this.ttsPlaying || this.ttsQueue.length === 0) return;

    this.ttsPlaying = true;
    const textToSpeak = this.ttsQueue.shift();
    this.duckWaterVolume();

    // 1. Thử phát bằng Google Translate TTS Engine trực tiếp
    const url = 'https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=' + encodeURIComponent(textToSpeak);
    const audio = new Audio(url);
    this.currentAudio = audio;

    const onFinish = () => {
      this.ttsPlaying = false;
      this.currentAudio = null;
      this.restoreWaterVolume();
      setTimeout(() => this.processTtsQueue(), 300);
    };

    audio.onended = onFinish;
    audio.onerror = () => {
      // 2. Dự phòng: Sử dụng Web Speech API của trình duyệt
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        utterance.lang = 'vi-VN';
        utterance.rate = 0.95;
        utterance.onend = onFinish;
        utterance.onerror = onFinish;
        window.speechSynthesis.speak(utterance);
      } else {
        onFinish();
      }
    };

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        // Nếu trình duyệt chặn autoplay
        onFinish();
      });
    }
  }

  // Đọc lời cảm ơn khi tặng quà
  speakThankYou(nickname, giftName, count = 1) {
    const thankTexts = [
      `Cảm ơn ${nickname} đã gửi tặng ${giftName}. Chúc bạn và gia đình vạn sự bình an, phúc lộc dồi dào!`,
      `Tri ân tấm lòng vàng của ${nickname} đã ủng hộ ${giftName}. Chúc bạn thân tâm an lạc, vạn sự hanh thông!`,
      `Xin cảm ơn ${nickname} đã thắp sáng ${giftName}. Chúc gia đạo luôn êm ấm, đắc tài đắc lộc!`
    ];
    const picked = thankTexts[Math.floor(Math.random() * thankTexts.length)];
    this.speak(picked);
  }

  // Đọc lời ước khi thả đèn
  speakWish(nickname, wishText) {
    if (wishText && wishText.length > 2) {
      this.speak(`${nickname} ước nguyện: ${wishText}`);
    }
  }
}

window.zenAudio = new ZenAudioEngine();
