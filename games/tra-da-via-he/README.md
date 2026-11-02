# 🍵 Trà Đá Vỉa Hè Hà Nội — TikTok LIVE Interactive Game 9:16

Game tương tác TikTok LIVE phong cách đường phố vỉa hè Hà Nội độc đáo, tối ưu tỷ lệ chuẩn dọc 9:16 (1080x1920) cho OBS, TikTok LIVE Studio và chạy 24/7 trực tiếp trên Google Colab (hỗ trợ tăng tốc GPU T4).

---

## 🌟 Tính Năng Nổi Bật

1. **Quy Định Ghế Ngồi Độc Đáo (Cơ chế đẩy người):**
   * 👑 **Thả 100 tim:** Được vào **HÀNG GHẾ VIP 1 (3 ghế)**.
   * 🌟 **Bấm Follow:** Được vào **HÀNG GHẾ VIP 2 (4 ghế)**.
   * 🪑 **Bình luận bất kỳ:** Được vào **HÀNG GHẾ THƯỜNG (ghế nhựa đỏ vỉa hè)**.
   * ⚡ **Cơ chế:** Khi hàng ghế VIP đã đủ người, **người mới sẽ tự động đẩy người cũ xuống ghế thường**!

2. **Hệ Thống Lệnh Bình Luận Đường Phố Vui Nhộn:**
   * `bocdau`: Bốc đầu xe máy khét lẹt vỉa hè (hiệu ứng rung lắc, chữ **BỐC ĐẦU!!!** khổng lồ và tiếng nổ pô).
   * `chomxe`: Bẻ khóa dắt trộm xe máy của quán.
   * `goicongan`: Chú công an phường hú còi rượt đuổi và bắt đối tượng trộm xe/quậy xóm.
   * `chomcoho`: Chôm cờ hó chạy ngang quán.
   * `batcoc`: Bắt cóc người khác.
   * `quayxom`: Quậy tưng bừng khu phố vỉa hè.
   * `choichai` / `nem1`: Ném vỏ chai nhựa sang bàn đối diện.
   * `ngoi` / `dungday` / `nhay`: Ngồi uống trà đá, đứng dậy, nhảy múa.
   * `chaotoidi`: Chủ quán nước chào tên người chơi bằng giọng nói AI (TTS).

3. **Âm Thanh & Giọng Nói AI (TTS Tiếng Việt):**
   * Đọc lời chào, thông báo người thăng hạng ghế VIP 1 & 2, người bốc đầu xe, người bị công an tóm.
   * Cảm ơn đại gia **Khách Sộp** khi gửi quà tặng TikTok.
   * Hiệu ứng âm thanh chân thực: tiếng nổ máy bốc đầu, còi xe, còi công an hú "í o", tiếng leng keng cốc trà đá.

4. **Minigame Đoán Chữ Vỉa Hè:**
   * Đồng hồ đếm ngược đoán từ vựng đường phố Hà Nội (Trà đá, Kẹo lạc, Nước mía, Bánh mì...). Người xem gõ đúng được cộng điểm và xướng tên.

---

## 🚀 Hướng Dẫn Sử Dụng

### 1. Chạy trên máy cục bộ (Local)
```bash
cd games/tra-da-via-he
npm install
npm start
```
* Màn hình Game 9:16: `http://localhost:3005`
* Bảng Test Giả Lập / Streamer Dashboard: `http://localhost:3005/admin.html`

### 2. Chạy trên Google Colab
Mở file `Chua_Online_TikTok_Live.ipynb` và chạy ô **BƯỚC 1F: Game Trà Đá Vỉa Hè Hà Nội 9:16**.
Hệ thống sẽ tự động tạo đường link HTTPS công khai để dán thẳng vào OBS / TikTok LIVE Studio.
