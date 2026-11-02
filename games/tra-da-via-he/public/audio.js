/**
 * AUDIO & TTS MANAGER — Trà Đá Vỉa Hè Hà Nội
 * Tổng hợp hiệu ứng âm thanh (Web Audio API) + Hàng đợi Giọng nói TTS Tiếng Việt
 */

class SoundManager {
  constructor() {
    this.ctx = null;
    this.ttsQueue = [];
    this.isSpeaking = false;
    this.currentAudio = null;
    this.ttsEnabled = true;

    // Khởi tạo AudioContext sau tương tác đầu tiên của người dùng
    const initAudio = () => {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      window.removeEventListener('click', initAudio);
      window.removeEventListener('touchstart', initAudio);
      window.removeEventListener('keydown', initAudio);
    };

    window.addEventListener('click', initAudio);
    window.addEventListener('touchstart', initAudio);
    window.addEventListener('keydown', initAudio);
  }

  getAudioContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    return this.ctx;
  }

  // ==========================================
  // HIỆU ỨNG ÂM THANH (SYNTHESIZED SOUNDS)
  // ==========================================

  // 1. Tiếng rồ ga bốc đầu xe máy (Motorcycle Wheelie Rev)
  playMotorRev() {
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = 'sawtooth';
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(400, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(1800, ctx.currentTime + 0.8);
      filter.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 1.8);

      // Tần số động cơ rồ lên
      osc.frequency.setValueAtTime(65, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(160, ctx.currentTime + 0.5);
      osc.frequency.linearRampToValueAtTime(260, ctx.currentTime + 1.0);
      osc.frequency.exponentialRampToValueAtTime(90, ctx.currentTime + 2.0);

      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 2.2);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 2.2);
    } catch (e) {
      console.warn('Audio err:', e);
    }
  }

  // 2. Tiếng còi cảnh sát hú "í o í o" (Police Siren)
  playPoliceSiren() {
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      const now = ctx.currentTime;
      // Chu kỳ hú cao thấp
      for (let i = 0; i < 4; i++) {
        osc.frequency.setValueAtTime(600, now + i * 0.6);
        osc.frequency.linearRampToValueAtTime(950, now + i * 0.6 + 0.3);
      }

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 2.5);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(now + 2.5);
    } catch (e) {
      console.warn('Audio err:', e);
    }
  }

  // 3. Tiếng leng keng cốc trà đá / kẹo lạc
  playGlassClink() {
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1800, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(2400, ctx.currentTime + 0.1);

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } catch (e) {}
  }

  // 4. Tiếng nhận quà / Thăng cấp ghế VIP
  playChimeVIP() {
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      const now = ctx.currentTime;

      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.12);

        gain.gain.setValueAtTime(0.2, now + idx * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.5);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.12);
        osc.stop(now + idx * 0.12 + 0.5);
      });
    } catch (e) {}
  }

  // ==========================================
  // HÀNG ĐỢI GIỌNG NÓI TTS TIẾNG VIỆT
  // ==========================================
  speak(text) {
    if (!text || !this.ttsEnabled) return;
    this.ttsQueue.push(text);
    this.processQueue();
  }

  processQueue() {
    if (this.isSpeaking || this.ttsQueue.length === 0) return;

    const textToSpeak = this.ttsQueue.shift();
    this.isSpeaking = true;

    // Gọi endpoint /api/tts của Server
    const ttsUrl = `/api/tts?text=${encodeURIComponent(textToSpeak)}`;
    const audio = new Audio(ttsUrl);
    this.currentAudio = audio;

    const onComplete = () => {
      this.isSpeaking = false;
      this.currentAudio = null;
      setTimeout(() => this.processQueue(), 350);
    };

    audio.onended = onComplete;
    audio.onerror = () => {
      console.warn('[TTS Proxy fallback] Dùng Web Speech API cho:', textToSpeak);
      this.fallbackWebSpeech(textToSpeak, onComplete);
    };

    audio.play().catch(err => {
      console.warn('[Audio play blocked/error]', err);
      this.fallbackWebSpeech(textToSpeak, onComplete);
    });
  }

  fallbackWebSpeech(text, callback) {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'vi-VN';
      utterance.rate = 1.05;
      utterance.onend = callback;
      utterance.onerror = callback;
      window.speechSynthesis.speak(utterance);
    } else {
      callback();
    }
  }
}

window.soundManager = new SoundManager();
