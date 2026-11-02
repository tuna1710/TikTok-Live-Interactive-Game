/**
 * audio.js
 * Hệ thống âm thanh thiền định & thiên nhiên thuần Web Audio API
 * Tự động tổng hợp tiếng suối chảy, chuông gió phong thủy, tiếng chuông ngân.
 * Vĩnh viễn KHÔNG BAO GIỜ bị quét bản quyền âm thanh trên TikTok Live!
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
        // Brownian noise filter
        data[i] = (lastOut + 0.02 * white) / 1.02;
        lastOut = data[i];
        data[i] *= 3.5;
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;

      // Filter mô phỏng âm thanh nước đêm
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(380, this.ctx.currentTime);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.12, this.ctx.currentTime); // Nhẹ nhàng êm dịu

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      noise.start();
      this.waterNode = noise;
      this.waterGain = gain;
      this.waterFilter = filter;
      this.waterRunning = true;

      // Tạo gợn sóng nhịp nhàng (LFO)
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

  // 2. Tiếng Chuông Gió Phong Thủy (Khi thả đèn hoa đăng)
  playChime() {
    if (!this.sfxEnabled) return;
    this.init();

    const frequencies = [880, 1108.73, 1318.51, 1661.22, 1975.53]; // Cung ngũ cung thanh tịnh A5-B6
    const f = frequencies[Math.floor(Math.random() * frequencies.length)];

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(f, this.ctx.currentTime);

    // Tiếng chuông ngân vang từ từ tắt
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

    const baseF = 432; // Tần số 432Hz chữa lành tâm thức
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

  // 4. Tiếng Đèn Lồng Khổng Minh Bay Lên Bầu Trời Sao (Hợp âm huyền ảo)
  playSkyAscend() {
    if (!this.sfxEnabled) return;
    this.init();

    const chord = [523.25, 659.25, 783.99, 1046.50, 1318.51]; // C5, E5, G5, C6, E6
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
}

window.zenAudio = new ZenAudioEngine();
