/**
 * Main Controller - Kết nối WebSocket Bridge & Điều phối Sự kiện
 */
document.addEventListener('DOMContentLoaded', () => {
    const audio = new AudioManager();
    const ui = new UIManager();
    const scene = new Scene3D('canvas-container', audio);

    // Kích hoạt âm thanh khi người dùng click vào trang lần đầu (chính sách Autoplay của Browser)
    document.body.addEventListener('click', () => {
        audio.init();
        audio.toggleWoodenFishAuto(true);
    }, { once: true });

    // Tự động nhận diện URL WebSocket (hỗ trợ cả localhost, Cloudflare Tunnel, Google Colab và HTTPS)
    let wsUrl = '';
    if (window.location.protocol.startsWith('http')) {
        const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl = `${wsProto}//${window.location.host}/ws`;
    } else {
        wsUrl = 'ws://localhost:8080';
    }
    let ws = null;
    let reconnectTimer = null;

    function connectWebSocket() {
        console.log(`[WebSocket] Đang kết nối tới ${wsUrl}...`);
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('[WebSocket] Đã kết nối thành công tới Bridge!');
            if (reconnectTimer) {
                clearTimeout(reconnectTimer);
                reconnectTimer = null;
            }
        };

        ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                handleBridgeMessage(message);
            } catch (e) {
                console.error('[WebSocket] Lỗi xử lý tin nhắn:', e);
            }
        };

        ws.onclose = () => {
            console.warn('[WebSocket] Mất kết nối tới Bridge. Sẽ thử kết nối lại sau 3s...');
            if (!reconnectTimer) {
                reconnectTimer = setTimeout(connectWebSocket, 3000);
            }
        };

        ws.onerror = (err) => {
            console.error('[WebSocket] Lỗi kết nối:', err);
            ws.close();
        };
    }

    function handleBridgeMessage({ type, payload }) {
        switch (type) {
            case 'SYNC_STATE':
                if (payload.leaderboard) ui.updateLeaderboard(payload.leaderboard);
                break;

            case 'ACTION_INCENSE':
                // 1 Coin: Dâng hương
                ui.showDonationAlert(payload.user, payload.gift, 'Dâng hương');
                ui.showChatBubble(payload.user.nickname, 'Dâng hương cầu an 🙏');
                ui.addViewerBadge(payload.user);
                scene.triggerIncenseAction(payload.user.nickname);
                break;

            case 'ACTION_BOW':
                // 5 Coins: Lễ Phật
                ui.showDonationAlert(payload.user, payload.gift, 'Lễ Phật');
                ui.showChatBubble(payload.user.nickname, 'Thành tâm Lễ Phật 🙏');
                ui.addViewerBadge(payload.user);
                scene.triggerBowAction(payload.user.nickname);
                break;

            case 'ACTION_LOTUS':
                // 10+ Coins: Dâng Hoa Sen
                ui.showDonationAlert(payload.user, payload.gift, 'Dâng Hoa Sen');
                ui.showChatBubble(payload.user.nickname, 'Dâng đóa sen hồng cúng dường 🪷');
                ui.addViewerBadge(payload.user);
                scene.triggerLotusAction(payload.user.nickname);
                break;

            case 'CHAT_MESSAGE':
                ui.showChatBubble(payload.user.nickname, payload.comment);
                ui.addViewerBadge(payload.user);
                break;

            case 'VIEWER_TAG':
                ui.addViewerBadge(payload.user);
                break;

            case 'LEADERBOARD_UPDATE':
                if (payload.top) ui.updateLeaderboard(payload.top);
                break;

            case 'DONATION_ALERT':
                ui.showDonationAlert(payload.user, payload.gift, payload.actionLabel);
                break;

            default:
                break;
        }
    }

    connectWebSocket();
});
