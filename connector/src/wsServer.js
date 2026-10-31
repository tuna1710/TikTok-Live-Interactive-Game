const WebSocket = require('ws');

class WebSocketServerBridge {
    constructor(port = 8080) {
        this.port = port;
        this.wss = null;
        this.clients = new Set();
        this.initialStateProvider = null;
    }

    start() {
        this.wss = new WebSocket.Server({ port: this.port });

        this.wss.on('connection', (ws, req) => {
            const ip = req.socket.remoteAddress;
            console.log(`[WebSocket] Client 3D đã kết nối từ ${ip}. Tổng clients: ${this.clients.size + 1}`);
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

            // Xử lý tin nhắn từ client (nếu client gửi feedback hoặc heartbeat)
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
                console.log(`[WebSocket] Client 3D đã ngắt kết nối. Còn lại: ${this.clients.size}`);
            });

            ws.on('error', (err) => {
                console.error('[WebSocket] Lỗi kết nối client:', err.message);
                this.clients.delete(ws);
            });
        });

        console.log(`[WebSocket] WebSocket Server đang lắng nghe tại ws://localhost:${this.port}`);
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
        if (this.wss) {
            this.wss.close();
            this.wss = null;
        }
    }
}

module.exports = WebSocketServerBridge;
