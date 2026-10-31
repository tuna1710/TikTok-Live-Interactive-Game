# TikTok Live Interactive Game - Chùa Online (Virtual Buddhist Temple)

<div align="center">

![TikTok Live Interactive Game](https://img.shields.io/badge/Platform-TikTok%20Live-fe2c55?style=for-the-badge&logo=tiktok&logoColor=white)
![Engine](https://img.shields.io/badge/Engine-Unity%20%2F%20WebGL-black?style=for-the-badge&logo=unity&logoColor=white)
![Node.js](https://img.shields.io/badge/Bridge-Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)

**Ứng dụng livestream tương tác thời gian thực 3D trên nền tảng TikTok Live.**  
Biến các tương tác từ người xem (Bình luận, Thả tim, Tặng quà/Coin, Follow, Share) thành các hành động dâng hương, lễ Phật, cúng dường hoa sen sống động trong không gian chánh điện trang nghiêm.

</div>

---

## 📌 Giới thiệu Tổng quan (Overview)

**TikTok Live Interactive Game - Chùa Online** là một hệ thống phát sóng tương tác tự động được thiết kế riêng cho các buổi livestream trên TikTok. Dựa trên luồng sự kiện thời gian thực từ phòng live (WebSocket Webcast Protocol), ứng dụng tự động phân tích và phản hồi trực tiếp các hành động của người xem vào không gian 3D:

- **1 Coin (Hoa hồng / Rose):** Nhân vật phật tử tiến lên bàn thờ, thắp nhang vào bát hương đồng, khói trầm bốc nghi ngút và cột sáng nối dài lên tượng Phật.
- **5 Coins:** Kích hoạt nhân vật tiến vào bồ đoàn quỳ lạy trang nghiêm (Lễ Phật).
- **10+ Coins:** Kích hoạt hiệu ứng đài sen nở rộ, hào quang chói lọi và tiếng chuông ngân vang.
- **Bình luận ("Mô phật", "Nam mô...", lời cầu an):** Hiển thị bong bóng thoại và ghi danh người xem vào hai hàng thẻ phật tử trong đạo tràng.
- **Bảng vinh danh "TẤM LÒNG THÀNH":** Tự động thống kê và xếp hạng top người cúng dường/donate theo thời gian thực.
- **Tụng kinh & Gõ mõ tự động:** Hệ thống phụ đề kinh Phật chạy liên tục kết hợp âm thanh gõ mõ và nhạc thiền thanh tịnh.

---

## 🌟 Tính năng Cốt lõi (Key Features)

### 1. Không gian Chánh điện 3D Tôn nghiêm
- Tượng Phật dát vàng uy nghiêm, hào quang chuyển động mượt mà.
- Bàn thờ trang nghiêm với lư hương đồng, hoa sen, mâm quả, nến đỏ lung linh.
- Hệ thống chiếu sáng thời gian thực kết hợp hiệu ứng hậu kỳ (Bloom, Volumetric Light, Fog).

### 2. Cơ chế Quà tặng Thời gian thực (Gift-to-Action)
- Bắt trọn vẹn các sự kiện Gift từ TikTok Live mà không bị trễ (Low latency).
- Hỗ trợ xử lý Combo Gift (x2, x5, x10...) với hiệu ứng dồn dập, tăng dần cấp độ.
- Hệ thống hàng đợi (Queue Manager) đảm bảo các lượt dâng hương và lễ Phật của từng người dùng được diễn ra tuần tự, không bị đè hành động.

### 3. Tương tác Cộng đồng & Tấm Lòng Thành (Social & Gamification)
- **Bảng xếp hạng Tấm Lòng Thành:** Cập nhật liên tục Top 1, Top 2, Top 3 kèm số coin đã cúng dường.
- **Tường danh sách Phật tử:** Mỗi người xem để lại bình luận hoặc tương tác sẽ có một thẻ huy hiệu (Badge) mang tên và avatar xuất hiện trên lối đi hai bên chánh điện.
- **Dải băng cảm ơn:** Chạy thông báo vinh danh người vừa tặng quà hoặc theo dõi kênh theo thời gian thực.

### 4. Hệ thống Âm thanh & Niệm Phật (Audio & Chants Engine)
- Nhạc nền thiền tịnh và giọng tụng kinh A Di Đà êm dịu, du dương.
- Tiếng mõ gõ nhịp đều đặn tạo cảm giác tĩnh tâm.
- Tiếng chuông gia trì ngân vang mỗi khi có phật tử dâng hương hoặc lạy Phật.

---

## 🏗 Kiến trúc Hệ thống (System Architecture)

```text
               TIKTOK LIVE STREAM
                        │
                        │ (WebSocket Protobuf: Gifts, Chats, Likes, Follows)
                        ▼
      ┌────────────────────────────────────┐
      │     TIKTOK LIVE CONNECTOR          │
      │     (Node.js / Python Service)     │
      │  - Event Filter & Rate Limiter     │
      │  - User & Coin Aggregator          │
      └─────────────────┬──────────────────┘
                        │
                        │ (Local IPC / WebSocket: ws://localhost:8080)
                        ▼
      ┌────────────────────────────────────┐
      │       3D RENDERER & LOGIC          │
      │    (Unity Engine / Three.js)       │
      │  - 3D Character & Altar Scene      │
      │  - Action Queue & Animation State  │
      │  - Leaderboard & Subtitle HUD      │
      └─────────────────┬──────────────────┘
                        │
                        │ (Capture 1080x1920 - 9:16 @ 60 FPS)
                        ▼
      ┌────────────────────────────────────┐
      │     OBS / TIKTOK LIVE STUDIO       │
      └─────────────────┬──────────────────┘
                        │
                        │ (RTMP Streaming)
                        ▼
            TIKTOK LIVE BROADCAST FEED
```

---

## 📁 Cấu trúc Thư mục Dự kiến (Project Structure)

```text
TikTok-Live-Interactive-Game/
├── README.md                      # Tài liệu tổng quan dự án
├── connector/                     # Dịch vụ trung gian kết nối TikTok Live
│   ├── package.json
│   ├── src/
│   │   ├── index.js               # Điểm khởi chạy kết nối WebSocket
│   │   ├── tiktokService.js       # Bắt sự kiện TikTok (Gift, Chat, Like)
│   │   ├── queueManager.js        # Điều phối hàng đợi quà tặng
│   │   └── config.js              # Cấu hình tài khoản & cổng kết nối
│   └── .env.example
├── client-3d/                     # Mã nguồn ứng dụng 3D (Unity / Web 3D)
│   ├── Assets/
│   │   ├── Models/                # Tượng Phật, Chánh điện, Bồ đoàn, Avatar
│   │   ├── Animations/            # Dâng hương, Lễ Phật, Chắp tay niệm Phật
│   │   ├── Materials & Shaders/   # Hào quang dát vàng, khói hương
│   │   ├── Sounds/                # Tiếng chuông, tiếng mõ, kinh tụng
│   │   └── Scripts/               # C# logic xử lý tương tác thời gian thực
│   └── ProjectSettings/
└── docs/                          # Hướng dẫn setup OBS, phím tắt & vận hành
    ├── SETUP_GUIDE.md
    └── OBS_STREAM_CONFIG.md
```

---

## 🚀 Kế hoạch Triển khai (Roadmap)

- [x] **Phân tích yêu cầu & Thiết kế kiến trúc hệ thống.**
- [x] **Khởi tạo kho lưu trữ GitHub và tài liệu kỹ thuật README.md.**
- [ ] **Giai đoạn 1:** Xây dựng module kết nối TikTok Live (`connector/`) bắt sự kiện quà tặng, bình luận, like theo thời gian thực.
- [ ] **Giai đoạn 2:** Dựng cảnh Chánh điện 3D, gắn xương (Rigging) và Animation cho nhân vật áo lam (Dâng hương, Lễ Phật, Dâng hoa sen).
- [ ] **Giai đoạn 3:** Hoàn thiện giao diện HUD: Bảng xếp hạng Tấm Lòng Thành, bong bóng chat, danh sách thẻ tên phật tử và chữ chạy kinh Phật.
- [ ] **Giai đoạn 4:** Kết nối hoàn chỉnh giữa Connector và Client 3D qua WebSocket, xử lý hàng đợi và chống spam.
- [ ] **Giai đoạn 5:** Tối ưu hóa hiệu năng GPU/CPU và hướng dẫn kết nối OBS Studio / TikTok Live Studio để phát sóng 24/7.

---

## 🛠 Yêu cầu Môi trường (Prerequisites)

- **Hệ điều hành:** Windows 10/11 hoặc macOS
- **Node.js:** v18.0.0 trở lên
- **Game Engine:** Unity 2022.3 LTS (hoặc WebGL / Three.js)
- **Phần mềm phát sóng:** OBS Studio hoặc TikTok Live Studio
- **Yêu cầu kênh TikTok:** Kênh đã được cấp quyền phát Live Studio hoặc có RTMP Stream Key

---

## 📄 Bản quyền & Tuyên bố Miễn trừ (Disclaimer & License)

- Dự án phục vụ mục đích học tập, nghiên cứu công nghệ tương tác trực tiếp trên livestream và tạo không gian tu tập, thư giãn tâm linh trang nghiêm, tích cực.
- Phân phối theo giấy phép [MIT License](LICENSE).
