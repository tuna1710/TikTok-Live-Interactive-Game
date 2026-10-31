let TikTokLiveConnectionClass = null;
try {
    const tlc = require('tiktok-live-connector');
    TikTokLiveConnectionClass = tlc.TikTokLiveConnection || tlc.WebcastPushConnection || tlc.default;
} catch (err) {
    console.error('[TikTokService] Lỗi nạp thư viện tiktok-live-connector:', err);
}

class TikTokLiveService {
    constructor({ username, onGift, onChat, onLike, onFollow, onShare, onRoomUser, onStatusChange }) {
        this.username = username;
        this.onGift = onGift;
        this.onChat = onChat;
        this.onLike = onLike;
        this.onFollow = onFollow;
        this.onShare = onShare;
        this.onRoomUser = onRoomUser;
        this.onStatusChange = onStatusChange;

        this.connection = null;
        this.isConnected = false;
        this.reconnectTimer = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
    }

    connect() {
        if (!this.username) {
            console.error('[TikTokService] Lỗi: Chưa cung cấp TIKTOK_USERNAME!');
            return;
        }

        if (!TikTokLiveConnectionClass) {
            console.error('[TikTokService] Thư viện tiktok-live-connector không khả dụng!');
            this.updateStatus('ERROR', 'Thư viện kết nối chưa sẵn sàng');
            return;
        }

        console.log(`[TikTokService] Đang kết nối tới phòng TikTok Live của: @${this.username}...`);
        this.updateStatus('CONNECTING', `Đang kết nối tới @${this.username}`);

        try {
            this.connection = new TikTokLiveConnectionClass(this.username, {
                processInitialData: false,
                enableExtendedGiftInfo: true,
                enableWebsocketUpgrade: true,
                requestPollingIntervalMs: 2000,
                clientParams: {
                    app_language: 'vi-VN',
                    device_platform: 'web'
                }
            });
        } catch (err) {
            console.error('[TikTokService] Lỗi khi tạo đối tượng kết nối:', err.message);
            this.updateStatus('ERROR', err.message);
            this.scheduleReconnect();
            return;
        }

        // Đã kết nối thành công vào phòng Live
        this.connection.connect().then(state => {
            this.isConnected = true;
            this.reconnectAttempts = 0;
            console.log(`[TikTokService] Đã kết nối thành công tới phòng Live ID: ${state.roomId}`);
            this.updateStatus('CONNECTED', `Đang live tại phòng ID ${state.roomId}`);
        }).catch(err => {
            console.error(`[TikTokService] Không thể kết nối tới @${this.username}:`, err.message);
            this.updateStatus('ERROR', err.message);
            this.scheduleReconnect();
        });

        // Bắt sự kiện Bình luận (Chat)
        this.connection.on('chat', data => {
            if (this.onChat) {
                this.onChat({
                    userId: data.userId,
                    nickname: data.nickname,
                    avatar: data.profilePictureUrl,
                    comment: data.comment
                });
            }
        });

        // Bắt sự kiện Quà tặng (Gift)
        this.connection.on('gift', data => {
            // Đối với quà streak (như hoa hồng gửi liên tục):
            // Nếu giftType === 1 và chưa kết thúc streak, ta chỉ nhận khi streak hoàn tất hoặc xử lý theo từng nhịp
            if (data.giftType === 1 && !data.repeatEnd) {
                return;
            }

            const coins = (data.diamondCount || 1) * (data.repeatCount || 1);

            if (this.onGift) {
                this.onGift({
                    userId: data.userId,
                    nickname: data.nickname,
                    avatar: data.profilePictureUrl,
                    giftName: data.giftName,
                    giftId: data.giftId,
                    coins,
                    repeatCount: data.repeatCount || 1
                });
            }
        });

        // Bắt sự kiện Thả tim (Like)
        this.connection.on('like', data => {
            if (this.onLike) {
                this.onLike({
                    userId: data.userId,
                    nickname: data.nickname,
                    likeCount: data.likeCount,
                    totalLikes: data.totalLikeCount
                });
            }
        });

        // Bắt sự kiện Follow
        this.connection.on('follow', data => {
            if (this.onFollow) {
                this.onFollow({
                    userId: data.userId,
                    nickname: data.nickname
                });
            }
        });

        // Bắt sự kiện Share
        this.connection.on('share', data => {
            if (this.onShare) {
                this.onShare({
                    userId: data.userId,
                    nickname: data.nickname
                });
            }
        });

        // Thống kê người xem trong phòng
        this.connection.on('roomUser', data => {
            if (this.onRoomUser) {
                this.onRoomUser({
                    viewerCount: data.viewerCount
                });
            }
        });

        // Phòng Live kết thúc
        this.connection.on('streamEnd', () => {
            console.log('[TikTokService] Buổi livestream đã kết thúc.');
            this.isConnected = false;
            this.updateStatus('DISCONNECTED', 'Buổi livestream đã kết thúc');
            this.scheduleReconnect();
        });

        // Lỗi kết nối
        this.connection.on('error', err => {
            console.error('[TikTokService] Lỗi kết nối stream:', err);
            this.updateStatus('ERROR', err.message || 'Lỗi kết nối');
        });
    }

    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('[TikTokService] Đã thử kết nối lại tối đa số lần cho phép. Dừng thử lại.');
            return;
        }

        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        console.log(`[TikTokService] Sẽ thử kết nối lại sau ${delay / 1000}s (Lần ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => {
            this.connect();
        }, delay);
    }

    updateStatus(state, message) {
        if (this.onStatusChange) {
            this.onStatusChange({ state, message, username: this.username });
        }
    }

    disconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.connection) {
            this.connection.disconnect();
            this.connection = null;
        }
        this.isConnected = false;
        this.updateStatus('DISCONNECTED', 'Đã ngắt kết nối thủ công');
    }
}

module.exports = TikTokLiveService;
