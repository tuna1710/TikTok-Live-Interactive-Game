# 🎓 Bạn Có Thông Minh Hơn Học Sinh Lớp 5? — TikTok LIVE Interactive

Trò chơi tương tác phòng học tiểu học chuẩn dọc 9:16 (`1080×1920`) dành cho TikTok LIVE Studio & OBS Studio.

---

## 🕹️ Cơ Chế Hoạt Động & Tương Tác

1. **Bảng Đen Lớp Học (Blackboard):**
   - Đưa ra các câu hỏi trắc nghiệm tiểu học (Toán, Tiếng Việt, Khoa học, Lịch sử, Đố mẹo thông minh).
   - Đếm ngược 20 giây cho mỗi câu.
   - Thống kê thời gian thực: *"Đã có X bạn trả lời"*.
   - Hết giờ: Tự động highlight đáp án đúng (glow xanh), hiển thị lời giải thích và tỷ lệ đúng/sai.

2. **Lớp Học 40 Bàn Ghế & Học Sinh:**
   - Mỗi người xem vào livestream comment hoặc tặng quà sẽ tự động nhận 1 bàn học.
   - Nhân vật học sinh đeo ba lô, quàng khăn đỏ, có bảng tên và avatar.
   - Khi comment `A`, `B`, `C`, `D`: Hiện bóng đáp án tương ứng trên đầu học sinh.
   - Khi công bố kết quả: Hiện dấu tick xanh `✓` nếu đúng hoặc `✗` đỏ nếu sai.
   - Comment tự do: Hiện bóng chat thoại trên đầu học sinh (*"Em chào cô ạ"*, *"Cô ơi đông quá"*...).

3. **Bục Lớp Trưởng Quyền Lực (Tính Năng Tăng Doanh Thu Quà Tặng):**
   - Khán giả gửi **Hoa Hồng (1 xu)** hoặc Quà bất kỳ sẽ được mời lên đứng bục danh dự **LỚP TRƯỞNG**.
   - Thời gian giữ chức:
     - 1 Hoa hồng = 20 giây (hoặc tích lũy thêm).
     - Quà $\ge 10$ xu = 60 giây.
     - Quà $\ge 50$ xu = 180 giây (3 phút).
   - Cô giáo tự động xướng tên: *"Cô mời bạn [Tên] lên làm lớp trưởng nhé! 🎉"* kèm pháo hoa confetti ngập phòng học.

4. **Giọng Nói Cô Giáo AI (TTS) — Hàng Đợi Ưu Tiên (Priority Queue):**
   - **Ưu tiên #1 (Cao nhất): Lên làm Lớp Trưởng** — Ngắt ngay câu thoại thông thường để xướng danh tân Lớp Trưởng (*"Cô mời bạn [Tên] lên làm lớp trưởng nhé! 🎉"*).
   - **Ưu tiên #2: Follow Kênh** — Cảm ơn khán giả vừa bấm Follow kênh (*"Cảm ơn bạn [Tên] đã follow kênh! Chào mừng em gia nhập lớp học nhé! 💖"*).
   - **Ưu tiên #3: Câu hỏi & Công bố kết quả** — Đọc câu hỏi mới, đếm ngược và tuyên dương khi hết giờ làm bài.

5. **Bảng Vàng Thi Đua & Logic Tính Điểm (Leaderboard & Scoring):**
   - **Bảng Vàng Thi Đua (Top 3 Học Sinh Giỏi):** Hiển thị trực tiếp trên bục giảng (🥇 Top 1, 🥈 Top 2, 🥉 Top 3 kèm điểm số).
   - **Thẻ tên bàn học kèm điểm:** Mỗi học sinh được hiển thị tên kèm điểm số (VD: `Minh Khôi • ★25đ`), kèm hiệu ứng số điểm `+10đ`, `+15đ` bay lên khi ghi điểm.
   - **Logic tính điểm học tập:**
     - **Thưởng nhanh tay nhất:** Học sinh đầu tiên chọn đúng đáp án được **+15 điểm**.
     - **Các bạn trả lời đúng tiếp theo:** Được **+10 điểm**.
     - **Chuỗi trả lời đúng liên tiếp (Streak Bonus):** Trả lời đúng từ 3 câu liên tiếp trở lên được thưởng thêm **+5 điểm**. Trả lời sai reset chuỗi combo.
     - **Thưởng Hoa Điểm 10 (Tặng Quà):** 1 Hoa hồng (1 xu) = **+10 điểm**; Quà lớn tặng **+10 điểm/xu** thi đua.
     - **Thưởng Nhập Học (Follow Kênh):** Bấm follow được tặng ngay **+10 điểm**.
   - **Lưu điểm bền vững:** Điểm số được lưu trữ liên tục theo tài khoản người xem, không bị mất ngay cả khi học sinh bị đẩy khỏi 40 bàn do lớp đông.

---

## 🚀 Khởi Chạy Game

### Chạy cục bộ trên máy tính:
```bash
cd games/lop-hoc-thong-minh
npm install
node server.js
```
- Màn hình game: `http://localhost:3006`
- Bảng điều khiển giả lập test: `http://localhost:3006/admin.html`

### Chạy trên Google Colab (1-Click kèm Cloudflare Tunnel):
Chạy lệnh trong Colab notebook:
```python
!python games/lop-hoc-thong-minh/run_colab.py
```
Hệ thống sẽ cấp link `https://xxxx.trycloudflare.com` công khai để bạn dán vào mục **"Liên kết"** của **TikTok LIVE Studio**.
