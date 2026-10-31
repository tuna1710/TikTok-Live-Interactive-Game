const WebSocket = require('ws');

class WebSocketServerBridge {
    constructor(options = { port: 8080 }) {
        this.options = typeof options === 'number' ? { port: options } : options;
        this.wssList = [];
        this.clients = new Set();
        this.initialStateProvider = null;
    }

    start(httpServer = null) {
        // 1. Tạo WebSocket Server gắn kèm HTTP Server (để hỗ trợ Cloudflare Tunnel / Ngrok qua cổng web duy nhất)
        if (httpServer) {
            const httpWss = new WebSocket.Server({ server: httpServer, path: '/ws' });
            this.setupWssListeners(httpWss, 'HTTP-Path /ws');
            this.wssList.push(httpWss);
        }

        // 2. Mở cổng độc lập (mặc định 8080) cho Unity Client / local tools
        const standalonePort = this.options.port || 8080;
        try {
            const standaloneWss = new WebSocket.Server({ port: standalonePort });
            this.setupWssListeners(standaloneWss, `Standalone Port ${standalonePort}`);
            this.wssList.push(standaloneWss);
            console.log(`[WebSocket] Standalone Server đang lắng nghe tại ws://localhost:${standalonePort}`);
        } catch (e) {
            console.warn(`[WebSocket] Không thể mở port riêng ${standalonePort}: ${e.message}`);
        }
    }

    setupWssListeners(wss, label) {
        wss.on('connection', (ws, req) => {
            const ip = req.socket.remoteAddress;
            console.log(`[WebSocket (${label})] Client 3D đã kết nối từ ${ip}. Tổng clients: ${this.clients.size + 1}`);
            this.clients.add(ws);

            // Gửi trạng thái đồng bộ ban đầu cho client mới kết nối
            if (typeof this.initialStateProvider === 'function') {
                const state = this.initialStateProvider();
                this.sendTo(ws, {
                    type: 'SYNC_STATE',
                    payload: state,
                    timestamp: Date.now()
                });
            }

            // Xử lý heartbeat / ping
            ws.on('message', (message) => {
                try {
                    const data = JSON.parse(message);
                    if (data.type === 'PING') {
                        this.sendTo(ws, { type: 'PONG', timestamp: Date.now() });
                    }
                } catch (e) {
                    // Ignore non-json
                }
            });

            ws.on('close', () => {
                this.clients.delete(ws);
                console.log(`[WebSocket (${label})] Client 3D đã ngắt kết nối. Còn lại: ${this.clients.size}`);
            });

            ws.on('error', (err) => {
                console.error(`[WebSocket (${label})] Lỗi kết nối client:`, err.message);
                this.clients.delete(ws);
            });
        });
    }

    /**
     * Gửi dữ liệu tới 1 client cụ thể
     */
    sendTo(client, data) {
        if (client && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    }

    /**
     * Broadcast dữ liệu tới tất cả các 3D clients đang kết nối
     */
    broadcast(type, payload) {
        if (this.clients.size === 0) return;

        const message = JSON.stringify({
            type,
            payload,
            timestamp: Date.now()
        });

        for (const client of this.clients) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        }
    }

    getClientCount() {
        return this.clients.size;
    }

    close() {
        for (const wss of this.wssList) {
            try {
                wss.close();
            } catch (e) {}
        }
        this.wssList = [];
    }
}

module.exports = WebSocketServerBridge;
