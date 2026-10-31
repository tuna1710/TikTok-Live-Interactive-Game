/**
 * Audio Manager - Quản lý âm thanh Chùa Online
 * Sử dụng Web Audio API để tạo tiếng chuông chùa & tiếng mõ chân thực
 * không phụ thuộc vào file ngoài, kết hợp nhạc nền tụng kinh
 */
class AudioManager {
    constructor() {
        this.ctx = null;
        this.isMuted = false;
        this.woodenFishInterval = null;
        this.isWoodenFishPlaying = false;
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

    /**
     * Tiếng Chuông Chùa Gia Trì (Singing Bowl / Buddhist Temple Bell)
     * Tạo âm thanh ngân vang "Boong..." sâu lắng với nhiều họa âm
     */
    playBell() {
        if (this.isMuted) return;
        this.init();

        const now = this.ctx.currentTime;
        const freqs = [220, 440, 680, 1120, 1650]; // Các họa âm chuông đồng
        const gains = [0.6, 0.4, 0.25, 0.15, 0.08];

        freqs.forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now);
            // Dao động nhẹ tần số (vibrato tự nhiên của chuông đồng)
            osc.frequency.exponentialRampToValueAtTime(freq * 0.998, now + 4.5);

            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(gains[i] * 0.4, now + 0.03); // Attack nhanh
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 4.5); // Decay ngân dài 4.5 giây

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(now);
            osc.stop(now + 4.6);
        });
    }

    /**
     * Tiếng Mõ Chùa (Buddhist Wooden Fish / Mộc Ngư)
     * Âm gõ "Cốc... cốc..." trầm ấm, dứt khoát
     */
    playWoodenFish() {
        if (this.isMuted) return;
        this.init();

        const now = this.ctx.currentTime;

        // Bộ tạo âm chính cho tiếng gỗ
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(580, now);
        osc.frequency.exponentialRampToValueAtTime(320, now + 0.07);

        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(450, now);
        filter.Q.setValueAtTime(3.5, now);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.35, now + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.13);
    }

    /**
     * Bật/Tắt gõ mõ tự động theo nhịp tụng kinh (mỗi 1.2 giây một tiếng mõ)
     */
    toggleWoodenFishAuto(enable = true) {
        if (enable && !this.isWoodenFishPlaying) {
            this.isWoodenFishPlaying = true;
            this.playWoodenFish();
            this.woodenFishInterval = setInterval(() => {
                this.playWoodenFish();
            }, 1200);
        } else if (!enable && this.woodenFishInterval) {
            clearInterval(this.woodenFishInterval);
            this.woodenFishInterval = null;
            this.isWoodenFishPlaying = false;
        }
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        return this.isMuted;
    }
}

window.AudioManager = AudioManager;
