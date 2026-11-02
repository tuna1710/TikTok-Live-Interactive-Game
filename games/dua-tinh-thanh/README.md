# 🏇 Game Đua Tỉnh Thành (Horse & Province Race) - TikTok Live Interactive Game

Một tựa game tương tác livestream thời gian thực dành cho **TikTok Live**, kết hợp giữa thể thức **Đua Thú / Đua Ngựa kịch tính** và **Niềm tự hào quê hương (5 Đại diện Tỉnh Thành Việt Nam)**.

Game được thiết kế đặc biệt nhằm **kích thích người xem nạp Xu gửi quà tặng (Gifts) và bão bình luận (Comments)** để đưa đội nhà bứt phá về đích!

---

## 🌟 Tính Năng Nổi Bật

1. **5 Làn Đua Đại Diện 5 Miền & Tỉnh Thành:**
   - 🇻🇳 **Hà Nội (Thủ Đô Ngàn Năm):** Màu Đỏ Hoàng Gia (`#EF4444`) - Linh vật: Rồng Vàng 🐉
   - 🏙️ **TP. Hồ Chí Minh (Sài Gòn Hoa Lệ):** Màu Cam Lửa (`#F97316`) - Linh vật: Cọp Lửa 🐯
   - 🌊 **Đà Nẵng (Thành Phố Đáng Sống):** Màu Xanh Đại Dương (`#00B4D8`) - Linh vật: Cá Heo 🐬
   - ⚓ **Hải Phòng (Thành Phố Hoa Phượng Đỏ):** Màu Đỏ Phượng (`#EC4899`) - Linh vật: Đại Bàng 🦅
   - 🌾 **Cần Thơ (Thủ Phủ Miền Tây):** Màu Xanh Miền Tây (`#10B981`) - Linh vật: Cá Sấu 🐊

2. **Cơ Chế Quà Tặng Nạp Xu (Gift Nitro Boost):**
   - **Hạng 1 Xu (Phổ thông - kích thích bão quà):**
     - 🌹 **Hoa Hồng:** Tăng tốc cho Hà Nội (+18m)
     - 🍦 **Cây Kem:** Tăng tốc cho Sài Gòn (+18m)
     - 🫰 **Bắn Tim:** Tăng tốc cho Đà Nẵng (+18m)
     - 🍩 **Bánh Rán:** Tăng tốc cho Hải Phòng (+18m)
     - 🎵 **TikTok:** Tăng tốc cho Cần Thơ (+18m)
   - **Hạng 5–10 Xu (Nitro tăng tốc mạnh):**
     - 👑 Vương Miện, 💖 Thả Tim, 🦋 Bướm Xinh, 🧢 Mũ Lưỡi Trai, 🕶️ Kính Râm (+70m).
   - **Hạng 99+ Xu (Siêu cấp bứt phá):**
     - 🎆 Pháo hoa, 🚀 Tên lửa, 🦁 Sư tử, 🏵️ Vòng hoa (+350m kèm hiệu ứng sấm sét nổ pháo hoa).

3. **Tương Tác Miễn Phí Đẩy View (Comment & Like):**
   - **Bình luận:** Gõ `1`, `2`, `3`, `4`, `5` hoặc viết tắt `hn`, `sg`, `dn`, `hp`, `ct` để đẩy nhẹ chiến mã thêm 3m $\rightarrow$ Kích hoạt thuật toán TikTok Live nhận diện "Bão comment".
   - **Thả tim:** Mỗi 80 tim được tích luỹ sẽ kích hoạt mini buff tiếp sức ngẫu nhiên.

4. **Đồ Họa & Âm Thanh Tích Hợp Sẵn:**
   - Hoạt ảnh ngựa phi, tia lửa Nitro phụt sau đuôi bằng Canvas 2D 60 FPS.
   - Âm thanh đếm ngược, tiếng vó ngựa, tiếng Nitro và kèn chiến thắng bằng Web Audio API (không cần tải MP3 bên ngoài).
   - Màn chúc mừng vô địch vinh danh **Top 3 Nhà tài trợ** cùng hiệu ứng pháo hoa `canvas-confetti`.

5. **Trang Quản Trị Streamer (`/admin.html`):**
   - Đổi kênh TikTok Live đích theo thời gian thực.
   - Bắt đầu, tạm dừng, reset vòng đua.
   - Bảng test giả lập sự kiện (Tặng quà, thả tim, comment) để test offline trước khi live.

---

## 🚀 Cài Đặt & Khởi Chạy

### Cách 1: Chạy trực tiếp trên máy / VPS
```bash
cd games/dua-tinh-thanh
npm install
npm start
```
* Màn hình livestream: `http://localhost:3003`
* Bảng điều khiển admin: `http://localhost:3003/admin.html`

### Cách 2: Chạy trên Google Colab
```bash
cd games/dua-tinh-thanh
python3 run_colab.py
```
Script sẽ tự động khởi động Server và tạo link HTTPS qua Cloudflare Tunnel để dán trực tiếp vào OBS hoặc TikTok Live Studio.

---

## 📺 Cấu Hình OBS / TikTok Live Studio

1. Trong OBS hoặc TikTok Live Studio, thêm nguồn: **Browser (Trình duyệt)**.
2. Dán đường link màn hình game (`http://localhost:3003` hoặc link Cloudflare).
3. Cài đặt kích thước:
   - **Rộng (Width):** `480`
   - **Cao (Height):** `854` (Tỉ lệ chuẩn 9:16 dọc của TikTok).
4. Tích chọn **"Control audio via OBS" (Điều khiển âm thanh qua OBS)** nếu muốn truyền âm thanh tiếng vó ngựa/chiến thắng lên luồng live.
