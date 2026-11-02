/**
 * audio.js
 * Bộ âm thanh chân thực được tổng hợp 100% bằng Web Audio API
 * Không cần tải bất kỳ file MP3 ngoài nào, hoạt động tức thì và siêu nhẹ.
 */

class SoundSystem {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // Tiếng bíp đếm ngược (3, 2, 1)
  playBeep(isFinal = false) {
    if (!this.enabled) return;
    this.init();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(isFinal ? 880 : 440, this.ctx.currentTime); // A5 hoặc A4

    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + (isFinal ? 0.6 : 0.3));

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + (isFinal ? 0.6 : 0.3));
  }

  // Tiếng súng lệnh xuất phát
  playWhistle() {
    if (!this.enabled) return;
    this.init();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(900, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1400, this.ctx.currentTime + 0.15);

    gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.35);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.35);
  }

  // Tiếng Nitro phụt lửa khi có Quà tặng
  playNitro() {
    if (!this.enabled) return;
    this.init();
    const bufferSize = this.ctx.sampleRate * 0.4;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(1200, this.ctx.currentTime + 0.2);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.5, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.4);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    noise.start();
    noise.stop(this.ctx.currentTime + 0.4);
  }

  // Tiếng chuông khi nhận quà nhỏ
  playChime() {
    if (!this.enabled) return;
    this.init();
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime + idx * 0.06);

      gain.gain.setValueAtTime(0.2, this.ctx.currentTime + idx * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + idx * 0.06 + 0.25);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(this.ctx.currentTime + idx * 0.06);
      osc.stop(this.ctx.currentTime + idx * 0.06 + 0.25);
    });
  }

  // Khúc nhạc kèn chiến thắng rộn ràng
  playVictory() {
    if (!this.enabled) return;
    this.init();
    const fanfare = [
      { f: 523.25, d: 0.15 }, // C5
      { f: 659.25, d: 0.15 }, // E5
      { f: 783.99, d: 0.15 }, // G5
      { f: 1046.50, d: 0.45 } // C6
    ];

    let t = this.ctx.currentTime;
    fanfare.forEach(note => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(note.f, t);

      gain.gain.setValueAtTime(0.4, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + note.d);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + note.d);
      t += note.d + 0.05;
    });
  }
}

window.soundSystem = new SoundSystem();
