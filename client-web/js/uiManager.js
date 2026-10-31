/**
 * UIManager - Quản lý toàn bộ giao diện tương tác HUD trên màn hình
 * Bao gồm: Bảng Tấm Lòng Thành, Tường danh sách Phật tử 2 bên,
 * Chữ chạy Kinh A Di Đà, Bong bóng chat bay, Ticker cảm ơn.
 */
class UIManager {
    constructor() {
        this.leaderboardEl = document.getElementById('leaderboard-list');
        this.leftBadgesEl = document.getElementById('left-badges');
        this.rightBadgesEl = document.getElementById('right-badges');
        this.subtitlesEl = document.getElementById('subtitles-text');
        this.tickerEl = document.getElementById('ticker-text');
        this.speechBubbleEl = document.getElementById('speech-bubble');

        this.leftBadges = [];
        this.rightBadges = [];
        this.maxBadges = 32;

        this.chants = [
            'Xá Lợi Phất! Nếu có thiện nam tử, thiện nữ nhân nào nghe nói đức Phật A Di Đà...',
            'liền chấp trì danh hiệu, hoặc trong một ngày, hoặc hai ngày, hoặc ba ngày...',
            'hoặc bốn ngày, hoặc năm ngày, hoặc sáu ngày, hoặc bảy ngày, một lòng không loạn...',
            'Người đó khi lâm chung, đức Phật A Di Đà cùng hàng Thánh chúng hiện thân ở trước...',
            'Người đó lúc chết tâm không điên đảo, liền được vãng sanh về cõi nước Cực Lạc của đức Phật A Di Đà.',
            'Nam Mô A Di Đà Phật 🙏 Nam Mô Đại Bi Quán Thế Âm Bồ Tát 🙏',
            'Nguyện đem công đức này, hướng về khắp tất cả, đệ tử và chúng sanh, đều trọn thành Phật đạo.'
        ];
        this.currentChantIndex = 0;

        this.initDefaultViewerBadges();
        this.initChantsLoop();
    }

    getRandomColor() {
        const colors = ['#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#f1c40f', '#e67e22', '#1abc9c', '#34495e'];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    /**
     * Khởi tạo danh sách dày đặc các Phật tử 2 bên đạo tràng giống clip gốc
     */
    initDefaultViewerBadges() {
        if (!this.leftBadgesEl || !this.rightBadgesEl) return;
        this.leftBadgesEl.innerHTML = '';
        this.rightBadgesEl.innerHTML = '';

        const leftNames = [
            'st', 'ngư', 'Văn', 'Hực', 'nenph', 'Võ Ng Gia Bả...',
            'Ngọc Y', 'anh', 'Việt', 'Thanh sơn', 'su', 'Gnas 2.0',
            'Thứ H', 'Swe', 'mpe', 'Quoc', 'nào có bả', 'vi',
            'Vuong', 'pho', 'Hu', 'Flora', 'djket', 'Khủng lon',
            'kent', 'Vk Gà rán', 'Mint', 'sống có phủ...'
        ];

        const rightNames = [
            'Ti', '-ng', 'Chuối', 'Thu', 'Bac', 'Trấn quỳnh',
            'Nie', 'Công', 'Bình Trị', 'tro', 'Ngu', 'And',
            'Đỗ Đ', 'Nguyệt Dương', 'Bo cute', 'td', 'Hii', 'Ngọc C',
            'Tí Đ', 'Tr Phc', 'Huong', 'Folo', 'Tạp Hóa', 'Ẩn danh',
            'Ye', 'Lâm', 'Tu', 'godzilla'
        ];

        leftNames.forEach(name => {
            const badge = document.createElement('div');
            badge.className = 'viewer-badge';
            const color = this.getRandomColor();
            const initial = name[0].toUpperCase();
            badge.innerHTML = `
                <span class="badge-icon-circle" style="background-color: ${color}">${initial}</span>
                <span class="badge-name">${this.truncate(name, 11)}</span>
            `;
            this.leftBadgesEl.appendChild(badge);
            this.leftBadges.push(badge);
        });

        rightNames.forEach(name => {
            const badge = document.createElement('div');
            badge.className = 'viewer-badge';
            const color = this.getRandomColor();
            const initial = name[0].toUpperCase();
            badge.innerHTML = `
                <span class="badge-icon-circle" style="background-color: ${color}">${initial}</span>
                <span class="badge-name">${this.truncate(name, 11)}</span>
            `;
            this.rightBadgesEl.appendChild(badge);
            this.rightBadges.push(badge);
        });
    }

    /**
     * Bảng xếp hạng Tấm Lòng Thành
     */
    updateLeaderboard(topList) {
        if (!this.leaderboardEl) return;
        this.leaderboardEl.innerHTML = '';

        if (!topList || topList.length === 0) {
            this.leaderboardEl.innerHTML = '<div class="empty-lb">Chưa có công đức</div>';
            return;
        }

        topList.slice(0, 3).forEach((item, idx) => {
            const row = document.createElement('div');
            row.className = `lb-item rank-${idx + 1}`;
            row.innerHTML = `
                <span class="lb-rank">(${idx + 1})</span>
                <span class="lb-name">${this.truncate(item.nickname, 14)}</span>
                <span class="lb-coins">${item.totalCoins}</span>
            `;
            this.leaderboardEl.appendChild(row);
        });
    }

    /**
     * Thêm thẻ tên Phật tử (Viewer Badges) vào hai bên đạo tràng
     */
    addViewerBadge(user) {
        const isLeft = Math.random() < 0.5;
        const targetEl = isLeft ? this.leftBadgesEl : this.rightBadgesEl;
        const targetList = isLeft ? this.leftBadges : this.rightBadges;

        const badge = document.createElement('div');
        badge.className = 'viewer-badge fade-in';
        const color = user.color || this.getRandomColor();
        const initial = (user.nickname || 'P')[0].toUpperCase();
        badge.innerHTML = `
            <span class="badge-icon-circle" style="background-color: ${color}">${initial}</span>
            <span class="badge-name">${this.truncate(user.nickname || 'Phật tử', 11)}</span>
        `;

        targetEl.appendChild(badge);
        targetList.push(badge);

        if (targetList.length > this.maxBadges) {
            const old = targetList.shift();
            if (old && old.parentNode) old.parentNode.removeChild(old);
        }
    }

    /**
     * Hiển thị bong bóng chat trên đầu nhân vật
     */
    showChatBubble(nickname, comment) {
        if (!this.speechBubbleEl) return;
        this.speechBubbleEl.innerHTML = `<strong>${this.truncate(nickname, 12)}:</strong> ${comment}`;
        this.speechBubbleEl.style.opacity = '1';
        this.speechBubbleEl.style.transform = 'translate(-50%, -10px)';

        if (this.bubbleTimeout) clearTimeout(this.bubbleTimeout);
        this.bubbleTimeout = setTimeout(() => {
            this.speechBubbleEl.style.opacity = '0';
            this.speechBubbleEl.style.transform = 'translate(-50%, 0)';
        }, 3500);
    }

    /**
     * Thông báo cảm ơn người cúng dường / donate ở dải băng phía dưới
     */
    showDonationAlert(user, gift, actionLabel) {
        if (!this.tickerEl) return;
        const text = `Cảm ơn ${user.nickname} đã gửi ${gift.name} x${gift.repeatCount || 1} • ${actionLabel}`;
        this.tickerEl.innerText = text;
        this.tickerEl.classList.remove('slide-anim');
        void this.tickerEl.offsetWidth; // trigger reflow
        this.tickerEl.classList.add('slide-anim');
    }

    /**
     * Chạy tuần tự các câu kinh Phật A Di Đà
     */
    initChantsLoop() {
        if (!this.subtitlesEl) return;
        this.subtitlesEl.innerText = this.chants[this.currentChantIndex];

        setInterval(() => {
            this.subtitlesEl.style.opacity = '0';
            setTimeout(() => {
                this.currentChantIndex = (this.currentChantIndex + 1) % this.chants.length;
                this.subtitlesEl.innerText = this.chants[this.currentChantIndex];
                this.subtitlesEl.style.opacity = '1';
            }, 600);
        }, 7000);
    }

    truncate(str, max = 12) {
        if (!str) return '';
        return str.length > max ? str.substring(0, max) + '..' : str;
    }
}

window.UIManager = UIManager;
