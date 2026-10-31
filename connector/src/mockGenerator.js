/**
 * Bộ tạo sự kiện giả lập (Mock Generator)
 * Dùng để kiểm thử toàn diện hệ thống khi không có luồng TikTok Live thật
 */
class MockGenerator {
    constructor({ onGift, onChat, onLike, onJoin }) {
        this.onGift = onGift;
        this.onChat = onChat;
        this.onLike = onLike;
        this.onJoin = onJoin;
        this.isRunning = false;
        this.timers = [];

        this.mockUsers = [
            { userId: 'u101', nickname: 'bum bum', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100' },
            { userId: 'u102', nickname: 'Chang0307', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100' },
            { userId: 'u103', nickname: 'kaydynces', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100' },
            { userId: 'u104', nickname: 'JOHNNY PHƯỚC', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100' },
            { userId: 'u105', nickname: 'Võ Ng Gia Bảo', avatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=100' },
            { userId: 'u106', nickname: 'Thyn Kim', avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100' },
            { userId: 'u107', nickname: 'Ngọc Cổ', avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100' },
            { userId: 'u108', nickname: 'Hoàng Vũ', avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100' },
            { userId: 'u109', nickname: 'Tiết Vy', avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100' },
            { userId: 'u110', nickname: 'Mukbang Yêu Đời', avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100' }
        ];

        this.mockComments = [
            'Mô Phật 🙏',
            'Nam Mô A Di Đà Phật',
            'Con cầu xin bình an cho cả gia đình',
            'Chúc mọi người luôn an lạc',
            'Mô Phật chứng giám lòng thành',
            'Nam Mô Quán Thế Âm Bồ Tát',
            'Cầu cho cha mẹ bách niên giai lão',
            'Tâm thanh tịnh, lòng an vui',
            'A Di Đà Phật 🙏🙏🙏',
            'Cảm tạ công đức vô lượng'
        ];
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        console.log('[MockGenerator] Đã kích hoạt chế độ giả lập sự kiện TikTok Live.');

        // Tạo comment định kỳ mỗi 2 - 4 giây
        const commentLoop = () => {
            if (!this.isRunning) return;
            const user = this.getRandomUser();
            const comment = this.mockComments[Math.floor(Math.random() * this.mockComments.length)];
            if (this.onChat) {
                this.onChat({
                    userId: user.userId,
                    nickname: user.nickname,
                    avatar: user.avatar,
                    comment
                });
            }
            const delay = 2000 + Math.random() * 2500;
            this.timers.push(setTimeout(commentLoop, delay));
        };
        commentLoop();

        // Tạo quà tặng định kỳ mỗi 4 - 8 giây
        const giftLoop = () => {
            if (!this.isRunning) return;
            const user = this.getRandomUser();
            const giftTypeRoll = Math.random();

            let giftName = 'Hoa hồng';
            let coins = 1;
            let repeatCount = 1;

            if (giftTypeRoll < 0.6) {
                // 60% xác suất: Dâng hương (1 coin) - có thể có combo x1, x2, x3
                giftName = 'Hoa hồng';
                coins = 1;
                repeatCount = Math.random() < 0.3 ? Math.floor(Math.random() * 3) + 1 : 1;
            } else if (giftTypeRoll < 0.85) {
                // 25% xác suất: Lễ Phật (5 coins)
                giftName = 'Bàn tay chắp lạy';
                coins = 5;
                repeatCount = 1;
            } else {
                // 15% xác suất: Dâng Hoa sen (10 - 20 coins)
                giftName = 'Đài Sen Vàng';
                coins = Math.random() < 0.5 ? 10 : 20;
                repeatCount = 1;
            }

            if (this.onGift) {
                this.onGift({
                    userId: user.userId,
                    nickname: user.nickname,
                    avatar: user.avatar,
                    giftName,
                    coins: coins * repeatCount,
                    repeatCount
                });
            }

            const delay = 4000 + Math.random() * 4000;
            this.timers.push(setTimeout(giftLoop, delay));
        };
        giftLoop();

        // Tạo lượt tham gia & like định kỳ
        const likeLoop = () => {
            if (!this.isRunning) return;
            const user = this.getRandomUser();
            if (this.onLike) {
                this.onLike({
                    userId: user.userId,
                    nickname: user.nickname,
                    likeCount: Math.floor(Math.random() * 5) + 1
                });
            }
            if (this.onJoin && Math.random() < 0.4) {
                this.onJoin(user);
            }
            this.timers.push(setTimeout(likeLoop, 1500));
        };
        likeLoop();
    }

    stop() {
        this.isRunning = false;
        for (const timer of this.timers) {
            clearTimeout(timer);
        }
        this.timers = [];
        console.log('[MockGenerator] Đã dừng chế độ giả lập.');
    }

    getRandomUser() {
        return this.mockUsers[Math.floor(Math.random() * this.mockUsers.length)];
    }
}

module.exports = MockGenerator;
