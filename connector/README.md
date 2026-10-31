# TikTok Live Connector & Bridge Service

Dịch vụ trung gian Node.js nhận luồng sự kiện thời gian thực từ TikTok Live (Quà tặng/Coin, Bình luận, Thả tim, Chia sẻ, Theo dõi), chuẩn hóa dữ liệu, điều phối hàng đợi (Queue Manager) và truyền phát qua WebSocket tới Client 3D (Unity / WebGL / Three.js).

---

## 🚀 Tính năng của Module

1. **Kết nối TikTok Live Webcast:**
   - Bắt sự kiện trực tiếp từ kênh TikTok thông qua `tiktok-live-connector`.
   - Cơ chế tự động kết nối lại (Auto-reconnect with exponential backoff) khi mạng gián đoạn.
2. **Quy đổi Quà tặng sang Hành động (Gift Mapping):**
   - **1 Coin (Hoa hồng / Rose):** Kích hoạt `ACTION_INCENSE` (Dâng hương).
   - **5 Coins:** Kích hoạt `ACTION_BOW` (Lễ Phật - Quỳ lạy).
   - **10+ Coins:** Kích hoạt `ACTION_LOTUS` (Dâng hoa sen vàng hào quang).
3. **Quản lý Hàng đợi (Priority Queue Manager):**
   - Đảm bảo các nhân vật 3D không bị đè animation khi có bão quà tặng.
   - Quà lớn (Hoa sen, Lễ Phật) được ưu tiên xếp trước, dâng hương xếp sau với thời gian giãn cách `QUEUE_INTERVAL_MS` (mặc định 3 giây).
4. **Bảng xếp hạng "TẤM LÒNG THÀNH" (Leaderboard):**
   - Tự động cộng dồn số coin của từng user trong suốt buổi livestream.
   - Broadcast danh sách Top 10 tới Client 3D ngay khi có thay đổi.
5. **Chế độ Giả lập (Mock Mode):**
   - Cho phép chạy thử nghiệm toàn bộ hệ thống mà không cần phòng Live TikTok thật đang phát sóng.
   - Tự động sinh bình luận ("Mô Phật", cầu an...), quà tặng combo và lượt thả tim.
6. **Web Dashboard & REST API:**
   - Giao diện web trực quan tại `http://localhost:3000` để theo dõi trạng thái, xem thống kê, thử nghiệm kích hoạt dâng hương/lễ Phật bằng nút bấm.

---

## 🛠 Hướng dẫn Cài đặt & Chạy

### 1. Cài đặt thư viện dependencies
```bash
cd connector
npm install
```

### 2. Thiết lập cấu hình
Sao chép file `.env.example` thành `.env` và cập nhật tên kênh TikTok của bạn:
```bash
cp .env.example .env
```
Nội dung file `.env`:
```ini
TIKTOK_USERNAME=zuno_live
HTTP_PORT=3000
WS_PORT=8080
MOCK_MODE=false
GIFT_COIN_INCENSE=1
GIFT_COIN_BOW=5
GIFT_COIN_LOTUS=10
QUEUE_INTERVAL_MS=3000
```

### 3. Khởi chạy dịch vụ

- **Chạy thực tế kết nối kênh TikTok:**
```bash
npm start
```

- **Chạy chế độ Giả lập (Mock Mode để test local):**
```bash
npm run mock
```

- **Mở Dashboard điều khiển trên trình duyệt:**  
Truy cập: [http://localhost:3000](http://localhost:3000)

---

## 📡 Giao thức WebSocket cho Client 3D (ws://localhost:8080)

Client 3D (Unity, WebGL) kết nối tới `ws://localhost:8080` để nhận các gói tin JSON sau:

### 1. Khi Client vừa kết nối (`SYNC_STATE`)
```json
{
  "type": "SYNC_STATE",
  "payload": {
    "room": { "state": "CONNECTED", "viewerCount": 140, "totalCoins": 850 },
    "leaderboard": [
      { "rank": 1, "nickname": "kaydynces", "totalCoins": 333 },
      { "rank": 2, "nickname": "JOHNNY PHƯỚC", "totalCoins": 276 }
    ],
    "config": { "coinIncense": 1, "coinBow": 5, "coinLotus": 10 }
  }
}
```

### 2. Hành động Dâng hương / Lễ Phật / Dâng hoa sen
```json
{
  "type": "ACTION_INCENSE", // hoặc "ACTION_BOW", "ACTION_LOTUS"
  "payload": {
    "id": "1698745200_a1b2",
    "actionType": "ACTION_INCENSE",
    "actionLabel": "Dâng hương",
    "priority": 3,
    "user": {
      "userId": "u101",
      "nickname": "bum bum",
      "avatar": "https://..."
    },
    "gift": {
      "name": "Hoa hồng",
      "coins": 2,
      "repeatCount": 2
    },
    "remainingQueue": 0
  }
}
```

### 3. Bình luận người xem (`CHAT_MESSAGE`)
```json
{
  "type": "CHAT_MESSAGE",
  "payload": {
    "user": { "userId": "u102", "nickname": "Chang0307", "avatar": "https://..." },
    "comment": "Nam Mô A Di Đà Phật 🙏"
  }
}
```

### 4. Cập nhật Bảng xếp hạng Tấm Lòng Thành (`LEADERBOARD_UPDATE`)
```json
{
  "type": "LEADERBOARD_UPDATE",
  "payload": {
    "top": [
      { "rank": 1, "nickname": "kaydynces", "totalCoins": 333 },
      { "rank": 2, "nickname": "JOHNNY PHƯỚC", "totalCoins": 276 },
      { "rank": 3, "nickname": "Mukbang", "totalCoins": 154 }
    ],
    "stats": { "totalCoins": 1250, "totalIncense": 120, "totalBow": 35, "totalLotus": 12 }
  }
}
```

---

## 🔌 Danh sách REST API Endpoints

- `GET /api/status`: Lấy trạng thái kết nối phòng live, số coin, thống kê queue.
- `GET /api/leaderboard?limit=10`: Lấy danh sách Top người cúng dường.
- `POST /api/trigger`: Giả lập kích hoạt quà tặng (`{ "nickname": "...", "coins": 5, "giftName": "..." }`).
- `POST /api/comment`: Giả lập gửi bình luận (`{ "nickname": "...", "comment": "Mô Phật" }`).
- `POST /api/mock/toggle`: Bật/Tắt chế độ giả lập Mock Mode.
- `POST /api/reset`: Đặt lại bảng xếp hạng và làm trống hàng đợi.
