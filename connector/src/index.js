const express = require('express');
const http = require('http');
const config = require('./config');
const LeaderboardManager = require('./leaderboardManager');
const QueueManager = require('./queueManager');
const WebSocketServerBridge = require('./wsServer');
const TikTokLiveService = require('./tiktokService');
const MockGenerator = require('./mockGenerator');

console.log('====================================================');
console.log('   TIKTOK LIVE INTERACTIVE BRIDGE - CHÙA ONLINE     ');
console.log('====================================================');

// Khởi tạo các module
const leaderboard = new LeaderboardManager();
const queue = new QueueManager(config.gameplay.queueIntervalMs);
const wsBridge = new WebSocketServerBridge(config.ports.ws);

let roomStats = {
    state: 'INITIALIZING',
    message: 'Khởi tạo hệ thống...',
    username: config.tiktok.username,
    viewerCount: 0,
    totalLikes: 0,
    totalCoins: 0,
    mockMode: config.mockMode
};

// Cung cấp state ban đầu khi Unity hoặc Web 3D Client kết nối
wsBridge.initialStateProvider = () => ({
    room: roomStats,
    leaderboard: leaderboard.getTopDonators(10),
    stats: leaderboard.getStats(),
    config: {
        coinIncense: config.gameplay.coinIncense,
        coinBow: config.gameplay.coinBow,
        coinLotus: config.gameplay.coinLotus
    }
});

// Khởi động WebSocket Server
wsBridge.start();

// Khi hàng đợi dispatch một hành động tới Client 3D
queue.onDispatchAction = (item, remainingQueue) => {
    console.log(`[Action Dispatch] Thực hiện: ${item.actionType} bởi phật tử: ${item.user.nickname} (Quà: ${item.gift.name} x${item.gift.repeatCount || 1}) - Hàng đợi còn: ${remainingQueue}`);
    wsBridge.broadcast(item.actionType, {
        ...item,
        remainingQueue
    });
};

// Khi bảng xếp hạng được cập nhật
leaderboard.onLeaderboardUpdated = (topDonators) => {
    wsBridge.broadcast('LEADERBOARD_UPDATE', {
        top: topDonators,
        stats: leaderboard.getStats()
    });
};

/**
 * Xử lý sự kiện Quà tặng (GIFT) từ TikTok hoặc Mock
 */
function handleGiftEvent({ userId, nickname, avatar, giftName, coins, repeatCount }) {
    roomStats.totalCoins += coins;

    let actionType = 'ACTION_INCENSE';
    let priority = 3;
    let actionLabel = 'Dâng hương';

    if (coins >= config.gameplay.coinLotus) {
        actionType = 'ACTION_LOTUS';
        priority = 1;
        actionLabel = 'Dâng Hoa Sen';
    } else if (coins >= config.gameplay.coinBow) {
        actionType = 'ACTION_BOW';
        priority = 2;
        actionLabel = 'Lễ Phật';
    } else {
        actionType = 'ACTION_INCENSE';
        priority = 3;
        actionLabel = 'Dâng hương';
    }

    // Ghi nhận vào Bảng vinh danh Tấm Lòng Thành
    leaderboard.recordDonation({
        userId,
        nickname,
        avatar,
        coins,
        actionType: actionType === 'ACTION_LOTUS' ? 'lotus' : actionType === 'ACTION_BOW' ? 'bow' : 'incense'
    });

    // Đưa vào hàng đợi hoạt ảnh 3D
    queue.enqueue({
        actionType,
        actionLabel,
        priority,
        user: { userId, nickname, avatar },
        gift: { name: giftName, coins, repeatCount },
        timestamp: Date.now()
    });

    // Bắn thông báo ticker cảm ơn ngay lập tức lên màn hình
    wsBridge.broadcast('DONATION_ALERT', {
        user: { userId, nickname, avatar },
        gift: { name: giftName, coins, repeatCount },
        actionLabel,
        timestamp: Date.now()
    });
}

/**
 * Xử lý sự kiện Bình luận (CHAT)
 */
function handleChatEvent({ userId, nickname, avatar, comment }) {
    // Gửi sự kiện comment tới client 3D để hiển thị bong bóng chat
    wsBridge.broadcast('CHAT_MESSAGE', {
        user: { userId, nickname, avatar },
        comment,
        timestamp: Date.now()
    });

    // Thêm người xem vào danh sách thẻ tên phật tử hai bên điện
    wsBridge.broadcast('VIEWER_TAG', {
        user: { userId, nickname, avatar },
        action: 'comment',
        timestamp: Date.now()
    });
}

/**
 * Xử lý sự kiện Thả tim (LIKE)
 */
function handleLikeEvent({ userId, nickname, likeCount, totalLikes }) {
    if (totalLikes) roomStats.totalLikes = totalLikes;
    wsBridge.broadcast('LIKE_BURST', {
        user: { userId, nickname },
        likeCount: likeCount || 1,
        totalLikes: roomStats.totalLikes,
        timestamp: Date.now()
    });
}

/**
 * Xử lý sự kiện Tham gia phòng (JOIN)
 */
function handleJoinEvent(user) {
    wsBridge.broadcast('VIEWER_TAG', {
        user,
        action: 'join',
        timestamp: Date.now()
    });
}

// Khởi tạo dịch vụ TikTok Live và Mock Generator
let tiktokService = null;
let mockGenerator = new MockGenerator({
    onGift: handleGiftEvent,
    onChat: handleChatEvent,
    onLike: handleLikeEvent,
    onJoin: handleJoinEvent
});

if (config.mockMode) {
    roomStats.state = 'MOCK_MODE';
    roomStats.message = 'Đang chạy chế độ giả lập sự kiện kiểm thử';
    mockGenerator.start();
} else {
    tiktokService = new TikTokLiveService({
        username: config.tiktok.username,
        onGift: handleGiftEvent,
        onChat: handleChatEvent,
        onLike: handleLikeEvent,
        onFollow: (data) => wsBridge.broadcast('FOLLOW_ALERT', data),
        onShare: (data) => wsBridge.broadcast('SHARE_ALERT', data),
        onRoomUser: ({ viewerCount }) => {
            roomStats.viewerCount = viewerCount;
            wsBridge.broadcast('ROOM_STATS', roomStats);
        },
        onStatusChange: (status) => {
            roomStats.state = status.state;
            roomStats.message = status.message;
            wsBridge.broadcast('ROOM_STATS', roomStats);
        }
    });
    tiktokService.connect();
}

// ==========================================
// TẠO HTTP SERVER & DASHBOARD ĐIỀU KHIỂN
// ==========================================
const app = express();
app.use(express.json());

// Dashboard Web UI
app.get('/', (req, res) => {
    const stats = leaderboard.getStats();
    const top = leaderboard.getTopDonators(5);
    res.send(`
    <!DOCTYPE html>
    <html lang="vi">
    <head>
        <meta charset="UTF-8">
        <title>TikTok Live Interactive Bridge - Chùa Online</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            :root { --primary: #e67e22; --dark: #1e1e24; --card: #2b2b36; --text: #f0f0f0; --accent: #27ae60; }
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: var(--dark); color: var(--text); margin: 0; padding: 20px; }
            .container { max-width: 900px; margin: 0 auto; }
            h1 { color: #f39c12; margin-bottom: 5px; }
            .badge { display: inline-block; padding: 4px 10px; border-radius: 20px; font-size: 13px; font-weight: bold; }
            .badge-success { background: #27ae60; color: white; }
            .badge-warning { background: #e67e22; color: white; }
            .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0; }
            .card { background: var(--card); padding: 18px; border-radius: 10px; box-shadow: 0 4px 10px rgba(0,0,0,0.3); }
            .card h3 { margin-top: 0; font-size: 14px; opacity: 0.8; text-transform: uppercase; }
            .card .val { font-size: 28px; font-weight: bold; color: #f1c40f; }
            .btn-group { display: flex; flex-wrap: wrap; gap: 10px; margin: 20px 0; }
            button { background: #d35400; border: none; color: white; padding: 12px 18px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: bold; transition: 0.2s; }
            button:hover { background: #e67e22; }
            button.alt { background: #2980b9; }
            button.alt:hover { background: #3498db; }
            button.danger { background: #c0392b; }
            button.danger:hover { background: #e74c3c; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { text-align: left; padding: 10px; border-bottom: 1px solid #444; }
            th { background: #333; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🪷 TikTok Live Bridge: Chùa Online</h1>
            <p>Trạng thái kết nối: <span class="badge ${roomStats.state === 'CONNECTED' || roomStats.state === 'MOCK_MODE' ? 'badge-success' : 'badge-warning'}">${roomStats.state}</span> - ${roomStats.message}</p>
            <p><strong>TikTok Kênh:</strong> @${roomStats.username} | <strong>WebSocket 3D Client:</strong> ws://localhost:${config.ports.ws} (${wsBridge.getClientCount()} clients kết nối)</p>

            <div class="grid">
                <div class="card">
                    <h3>Tổng Coin Cúng Dường</h3>
                    <div class="val">${roomStats.totalCoins} 🪙</div>
                </div>
                <div class="card">
                    <h3>Hàng đợi Hành động</h3>
                    <div class="val">${queue.getQueueLength()} ⏳</div>
                </div>
                <div class="card">
                    <h3>Số Lượt Dâng Hương</h3>
                    <div class="val">${stats.totalIncense} 🕯️</div>
                </div>
                <div class="card">
                    <h3>Số Lượt Lễ Phật</h3>
                    <div class="val">${stats.totalBow} 🙏</div>
                </div>
                <div class="card">
                    <h3>Số Lượt Dâng Hoa Sen</h3>
                    <div class="val">${stats.totalLotus} 🪷</div>
                </div>
            </div>

            <div class="card">
                <h3>🎮 Bảng Thao Tác Thử Nghiệm Tương Tác Nhanh</h3>
                <div class="btn-group">
                    <button onclick="triggerAction('ACTION_INCENSE', 1, 'Hoa hồng')">🕯️ Thử Dâng Hương (1 Coin)</button>
                    <button onclick="triggerAction('ACTION_BOW', 5, 'Bàn tay lạy')">🙏 Thử Lễ Phật (5 Coins)</button>
                    <button onclick="triggerAction('ACTION_LOTUS', 10, 'Đài Sen Vàng')">🪷 Thử Dâng Hoa Sen (10 Coins)</button>
                    <button class="alt" onclick="triggerComment()">💬 Thử Gửi Bình Luận</button>
                    <button class="alt" onclick="toggleMock()">🔀 Bật/Tắt Mock Mode</button>
                    <button class="danger" onclick="resetLeaderboard()">🔄 Đặt lại Bảng Xếp Hạng</button>
                </div>
            </div>

            <div class="card" style="margin-top: 20px;">
                <h3>🏆 Bảng Xếp Hạng "TẤM LÒNG THÀNH" (Top Donators)</h3>
                <table>
                    <thead>
                        <tr>
                            <th>Hạng</th>
                            <th>Phật tử</th>
                            <th>Tổng Coin</th>
                            <th>Dâng hương</th>
                            <th>Lễ Phật</th>
                            <th>Dâng sen</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${top.length === 0 ? '<tr><td colspan="6" style="text-align:center;">Chưa có dữ liệu cúng dường</td></tr>' : 
                        top.map(d => `
                            <tr>
                                <td>#${d.rank}</td>
                                <td><strong>${d.nickname}</strong></td>
                                <td style="color:#f1c40f; font-weight:bold;">${d.totalCoins} 🪙</td>
                                <td>${d.actions.incense}</td>
                                <td>${d.actions.bow}</td>
                                <td>${d.actions.lotus}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>

        <script>
            function triggerAction(action, coins, giftName) {
                fetch('/api/trigger', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        nickname: 'Thử nghiệm ' + Math.floor(Math.random() * 900 + 100),
                        coins: coins,
                        giftName: giftName
                    })
                }).then(() => location.reload());
            }

            function triggerComment() {
                const comments = ['Mô Phật 🙏', 'Nam Mô A Di Đà Phật', 'Con cầu an cho gia đình', 'A Di Đà Phật'];
                const comment = comments[Math.floor(Math.random() * comments.length)];
                fetch('/api/comment', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        nickname: 'Phật tử ' + Math.floor(Math.random() * 900 + 100),
                        comment: comment
                    })
                }).then(() => alert('Đã gửi bình luận mô phỏng: ' + comment));
            }

            function toggleMock() {
                fetch('/api/mock/toggle', { method: 'POST' }).then(() => location.reload());
            }

            function resetLeaderboard() {
                if (confirm('Bạn có chắc muốn đặt lại bảng xếp hạng?')) {
                    fetch('/api/reset', { method: 'POST' }).then(() => location.reload());
                }
            }
        </script>
    </body>
    </html>
    `);
});

// REST API Endpoints
app.get('/api/status', (req, res) => {
    res.json({
        room: roomStats,
        stats: leaderboard.getStats(),
        queueLength: queue.getQueueLength(),
        connectedClients: wsBridge.getClientCount()
    });
});

app.get('/api/leaderboard', (req, res) => {
    const limit = parseInt(req.query.limit || '10', 10);
    res.json(leaderboard.getTopDonators(limit));
});

app.post('/api/trigger', (req, res) => {
    const { nickname, coins, giftName, avatar } = req.body;
    handleGiftEvent({
        userId: 'manual_' + Date.now(),
        nickname: nickname || 'Phật tử hảo tâm',
        avatar: avatar || '',
        giftName: giftName || 'Hoa cúng',
        coins: parseInt(coins || 1, 10),
        repeatCount: 1
    });
    res.json({ success: true, message: 'Đã kích hoạt hành động thành công' });
});

app.post('/api/comment', (req, res) => {
    const { nickname, comment, avatar } = req.body;
    handleChatEvent({
        userId: 'manual_chat_' + Date.now(),
        nickname: nickname || 'Phật tử ẩn danh',
        avatar: avatar || '',
        comment: comment || 'Nam Mô A Di Đà Phật'
    });
    res.json({ success: true, message: 'Đã gửi bình luận thành công' });
});

app.post('/api/mock/toggle', (req, res) => {
    if (mockGenerator.isRunning) {
        mockGenerator.stop();
        roomStats.mockMode = false;
        roomStats.state = 'MOCK_STOPPED';
        roomStats.message = 'Chế độ giả lập đã tắt';
    } else {
        if (tiktokService) tiktokService.disconnect();
        mockGenerator.start();
        roomStats.mockMode = true;
        roomStats.state = 'MOCK_MODE';
        roomStats.message = 'Đang chạy chế độ giả lập sự kiện kiểm thử';
    }
    wsBridge.broadcast('ROOM_STATS', roomStats);
    res.json({ success: true, mockMode: roomStats.mockMode });
});

app.post('/api/reset', (req, res) => {
    leaderboard.reset();
    queue.clear();
    roomStats.totalCoins = 0;
    wsBridge.broadcast('ROOM_STATS', roomStats);
    res.json({ success: true, message: 'Đã đặt lại dữ liệu thành công' });
});

// Khởi chạy HTTP Server
const server = app.listen(config.ports.http, () => {
    console.log(`[HTTP Dashboard] Bảng điều khiển Web & REST API đang chạy tại: http://localhost:${config.ports.http}`);
});

// Xử lý dừng server gọn gàng
process.on('SIGINT', () => {
    console.log('\n[Shutdown] Đang dừng server...');
    if (tiktokService) tiktokService.disconnect();
    if (mockGenerator) mockGenerator.stop();
    wsBridge.close();
    server.close(() => {
        console.log('[Shutdown] Đã dừng toàn bộ dịch vụ an toàn.');
        process.exit(0);
    });
});
