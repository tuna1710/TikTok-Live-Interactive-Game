/**
 * Quản lý Bảng xếp hạng "TẤM LÒNG THÀNH"
 * Tích lũy số coin/công đức của người xem trong suốt buổi livestream
 */
class LeaderboardManager {
    constructor() {
        this.donators = new Map(); // userId -> { userId, nickname, avatar, totalCoins, actions: { incense, bow, lotus }, lastSeen }
        this.onLeaderboardUpdated = null;
    }

    /**
     * Ghi nhận một khoản cúng dường / donate
     */
    recordDonation({ userId, nickname, avatar, coins, actionType }) {
        if (!userId) {
            userId = nickname || 'anonymous';
        }

        const existing = this.donators.get(userId) || {
            userId,
            nickname: nickname || 'Phật tử ẩn danh',
            avatar: avatar || '',
            totalCoins: 0,
            actions: {
                incense: 0,
                bow: 0,
                lotus: 0
            },
            firstSeen: Date.now(),
            lastSeen: Date.now()
        };

        existing.nickname = nickname || existing.nickname;
        if (avatar) existing.avatar = avatar;
        existing.totalCoins += coins;
        existing.lastSeen = Date.now();

        if (actionType && existing.actions[actionType] !== undefined) {
            existing.actions[actionType]++;
        }

        this.donators.set(userId, existing);

        if (typeof this.onLeaderboardUpdated === 'function') {
            this.onLeaderboardUpdated(this.getTopDonators(10));
        }

        return existing;
    }

    /**
     * Lấy danh sách Top N người cúng dường nhiều nhất
     */
    getTopDonators(limit = 10) {
        const sorted = Array.from(this.donators.values())
            .sort((a, b) => b.totalCoins - a.totalCoins)
            .slice(0, limit);

        return sorted.map((item, index) => ({
            rank: index + 1,
            userId: item.userId,
            nickname: item.nickname,
            avatar: item.avatar,
            totalCoins: item.totalCoins,
            actions: item.actions
        }));
    }

    /**
     * Lấy tổng quan thống kê
     */
    getStats() {
        let totalCoins = 0;
        let totalIncense = 0;
        let totalBow = 0;
        let totalLotus = 0;

        for (const d of this.donators.values()) {
            totalCoins += d.totalCoins;
            totalIncense += d.actions.incense;
            totalBow += d.actions.bow;
            totalLotus += d.actions.lotus;
        }

        return {
            totalDonators: this.donators.size,
            totalCoins,
            totalIncense,
            totalBow,
            totalLotus
        };
    }

    /**
     * Đặt lại bảng xếp hạng (khi bắt đầu phiên live mới)
     */
    reset() {
        this.donators.clear();
        if (typeof this.onLeaderboardUpdated === 'function') {
            this.onLeaderboardUpdated([]);
        }
    }
}

module.exports = LeaderboardManager;
