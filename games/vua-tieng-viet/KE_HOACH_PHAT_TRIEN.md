# 📋 KẾ HOẠCH PHÁT TRIỂN & LỘ TRÌNH TÍNH NĂNG GAME VUA TIẾNG VIỆT
*(TikTok Live Interactive Game)*

Tài liệu này lưu trữ danh sách các tính năng nâng cấp tương tác phòng live, phân tích kiến trúc kỹ thuật và kế hoạch thực hiện từng bước từ dễ đến nâng cao.

---

## 🎯 DANH SÁCH CÁC TÍNH NĂNG NÂNG CẤP

| STT | Tên tính năng | Mục tiêu tương tác | Độ ưu tiên | Trạng thái |
| :---: | :--- | :--- | :---: | :---: |
| **1** | 🎁 **Tặng quà mở chữ cái gợi ý** *(Interactive Gift Hint)* | Tăng doanh thu donate / xu từ quà tặng nhỏ (hoa hồng, tim...) | **P1** |  Đã xong |
| **2** | 🔥 **Chuỗi thắng liên tiếp** *(Combo Win Streak & Flame)* | Giữ chân người xem ở lại livestream qua nhiều vòng liên tục | **P1** |  Đã xong |
| **3** | 🎡 **Rương Kho Báu / Mốc Tim Thả Like** *(Like Milestone Chest)* | Thúc đẩy khán giả tích cực chạm màn hình thả tim (Likes) | **P1** |  Đã xong |
| **4** | 🎁⚡ **Tặng quà trả lời đúng nhân đôi điểm** *(Donor Double Points Buff)* | Tạo động lực cực lớn cho người chơi tặng quà để bứt phá BXH | **P1 (Mới)** |  Đã xong |
| **5** | 👑💎 **Kết thúc game vinh danh cả người tặng quà** *(Top Donors Hall of Fame)* | Tri ân nhà tài trợ/phú hộ phòng live bên cạnh quán quân | **P1 (Mới)** |  Đã xong |
| **6** | 🏁 **Nâng mốc điểm kết thúc game lên 3.000 điểm** *(Target Score 3000)* | Tăng độ kịch tính, kéo dài trận đấu vừa vặn với một phiên live | **P1 (Mới)** |  Đã xong |
| **7** | 🎯 **Câu Đố Trùm & Giờ Vàng** *(Boss Round / Rush Hour x2)* | Tạo cao trào, giải tỏa nhịp độ đều đều sau mỗi 5 - 10 vòng | **P2** | ⏳ Chờ làm |
| **8** | 📚 **Quản lý ngân hàng câu đố từ Admin** *(Question CMS)* | Tiện lợi cho Streamer cập nhật câu đố trend không cần sửa code | **P2** | ⏳ Chờ làm |
| **9** | ⚔️ **Chế độ Chia Phe Đối Kháng** *(Team Red vs Team Blue)* | Tạo hiệu ứng đám đông, rủ bạn bè comment theo phe | **P3** | ⏳ Chờ làm |

---

## 🚀 KẾ HOẠCH TRIỂN KHAI CHI TIẾT TỪNG MỤC

---

### 📌 MỤC 1: TẶNG QUÀ MỞ CHỮ CÁI GỢI Ý (INTERACTIVE GIFT HINT)
> **Trạng thái:**  *Đã hoàn thiện*
- Khán giả gửi quà tặng nhỏ (Hoa Hồng, Bánh Quy,...) tự động mở ngẫu nhiên 1 chữ cái trong ô đáp án kèm hiệu ứng xoay thẻ vàng óng ánh và TTS cảm ơn.

---

### 📌 MỤC 2: CHUỖI THẮNG LIÊN TIẾP (COMBO WIN STREAK)
> **Trạng thái:**  *Đã hoàn thiện*
- Duy trì streak thắng liên tiếp: 2 câu (+20% điểm, Lửa nhỏ), 3-4 câu (+50% điểm, Bốc cháy), từ 5 câu trở lên (+100% điểm, Thần tốc bất bại).
- Giao diện rực lửa kèm còi hiệu ứng và giọng đọc xướng tên người giữ chuỗi.

---

### 📌 MỤC 3: RƯƠNG KHO BÁU & MỐC TIM THẢ LIKE (LIKE MILESTONE CHEST)
> **Trạng thái:**  *Đã hoàn thiện*
- Đếm số lượng like/tim khán giả thả trên màn hình. Mỗi mốc đạt được (500 tim, 1.000 tim...) sẽ mở bung rương kho báu trao phần thưởng phòng live (mở chữ cái, cộng thời gian, tặng điểm may mắn).

---

### 📌 MỤC 4 (YÊU CẦU MỚI 1): TẶNG QUÀ TRẢ LỜI ĐÚNG ĐƯỢC NHÂN ĐÔI ĐIỂM (DONOR DOUBLE POINTS BUFF)
> **Mục tiêu:** Khuyến khích người xem tặng quà để nhận bùa lợi "Nhân Đôi Điểm" (Buff x2), giúp câu đoán đúng kế tiếp nhận được số điểm gấp đôi (ví dụ: 100 điểm -> 200 điểm).

#### 4.1. Cơ chế kỹ thuật (Workflow)
1. **Lưu trữ trạng thái Buff:**
   - Trong `server.js`, duy trì danh sách hoặc `Map`:
     `donorScoreBuffs = new Map();` // `key: uniqueId -> { active: true, multiplier: 2, giftName: 'Hoa Hồng', expiresAt: timestamp }`
2. **Kích hoạt Buff khi nhận quà:**
   - Khi có sự kiện quà tặng từ TikTok (`tiktokConn.on('gift')`) hoặc qua Admin test panel:
   - Ghi nhận người tặng nhận được Buff x2 điểm cho lần trả lời đúng kế tiếp.
   - Phát sự kiện Socket `donorBuffActivated`:
     ```json
     {
       "uniqueId": "user123",
       "nickname": "Nguyễn Văn A",
       "multiplier": 2,
       "message": "Đã kích hoạt bùa lợi x2 điểm cho câu đoán đúng tiếp theo!"
     }
     ```
3. **Áp dụng điểm số khi trả lời đúng:**
   - Trong hàm kiểm tra đáp án:
     - Tính điểm gốc: `basePoints = 100`.
     - Nếu người chơi có `donorScoreBuffs.has(user.uniqueId)`:
       - Áp dụng hệ số `giftMultiplier = 2` (Ví dụ: `totalPoints = basePoints * 2 = 200đ`).
       - Nếu người chơi có thêm chuỗi Combo Streak, tính toán nhân dồn ưu đãi để điểm thưởng càng cao.
       - Xóa hoặc tiêu hao 1 lượt Buff của người chơi.
4. **Hiệu ứng giao diện (Client `index.html`):**
   - **Lúc nhận Buff:** Hiển thị huy hiệu `BUFF x2 ⚡` cạnh tên/avatar khán giả trên màn hình.
   - **Lúc trả lời đúng:** Banner chúc mừng hiển thị dòng chữ vàng kim rực rỡ:
     *"🌟 BUFF QUÀ TẶNG: [Tên] được NHÂN ĐÔI ĐIỂM (+200 điểm)!"*
   - Âm thanh: Tiếng Power-Up x2 thần thánh bùng nổ.
   - Giọng đọc TTS: *"Tuyệt đỉnh! Nhờ có bùa lợi quà tặng, [Tên] đã nhân đôi số điểm nhận được lên 200 điểm!"*.

---

### 📌 MỤC 5 (YÊU CẦU MỚI 2): KẾT THÚC GAME VINH DANH CẢ NGƯỜI TẶNG QUÀ (TOP DONORS HALL OF FAME)
> **Mục tiêu:** Màn hình kết thúc trận (khi có người chạm mốc chiến thắng 3.000 điểm) không chỉ vinh danh quán quân và Top 5 điểm số, mà còn vinh danh trang trọng danh sách **Top Nhà Hảo Tâm / Phú Hộ Tặng Quà** đã ủng hộ livestream suốt trận đấu.

#### 5.1. Cơ chế kỹ thuật (Workflow)
1. **Dữ liệu vinh danh:**
   - Dữ liệu `donorLeaderboard` đã có sẵn trong `server.js` (hàm `getDonorLeaderboardList()`).
   - Khi kích hoạt hàm `triggerMilestoneCelebration()`:
     - Truyền thêm danh sách `topDonors = getDonorLeaderboardList().slice(0, 5)` vào object `activeMilestone`:
       ```javascript
       activeMilestone = {
         user: winnerData,
         top5: top5Players,
         topDonors: top5Donors, // Danh sách Top 5 nhà tài trợ quà
         milestone: 3000,
         duration: 60
       };
       ```
2. **Giao diện màn hình Vinh Danh (`public/index.html`):**
   - Thiết kế bố cục màn hình kết thúc 2 cột song song (Split Screen Hall of Fame):
     - **Cột Trái 🏆:** *BẢNG VÀNG TOP 5 CAO THỦ ĐIỂM SỐ* (Điểm số, số câu thắng, chuỗi streak).
     - **Cột Phải 💎:** *BẢNG VÀNG TOP PHÚ HỘ / NHÀ HẢO TÂM* (Số kim cương donate, số phần quà, danh hiệu "Đại Phú Hộ", "Mạnh Thường Quân").
   - Hiệu ứng ánh sáng hào quang kim cương, vương miện lấp lánh cho Top 1 Donor.
3. **Giọng đọc AI (TTS):**
   - TTS đọc lời chúc mừng quán quân, sau đó đọc tri ân:
     *"Đặc biệt cảm ơn các nhà hảo tâm hàng đầu đã ủng hộ phòng live: Quán quân phú hộ [Tên Top 1 Donor] cùng [Tên Top 2], [Tên Top 3]!"*.

---

### 📌 MỤC 6 (YÊU CẦU MỚI 3): TĂNG MỐC ĐIỂM KẾT THÚC GAME LÊN 3.000 ĐIỂM (TARGET SCORE 3000)
> **Mục tiêu:** Tăng giới hạn điểm chạm đích từ 2.000 lên 3.000 điểm để thời lượng trận đấu kéo dài tầm 25 - 35 câu hỏi, tạo cơ hội cho nhiều người chơi cạnh tranh và rượt đuổi tỷ số gay cấn hơn.

#### 6.1. Chi tiết điều chỉnh (Workflow)
1. **Phía Server (`server.js` & `server-youtube.js`):**
   - Cập nhật biến cấu hình:
     ```javascript
     const MILESTONE_SCORE = Number(process.env.MILESTONE_SCORE) || 3000;
     ```
2. **Phía Client (`public/index.html` & `public/admin.html`):**
   - Cập nhật giao diện thanh tiến độ (Progress Bar) theo mốc tối đa 3.000đ.
   - Cập nhật banner, text mô tả: *"ĐUA TOP 3.000 ĐIỂM"*, *"Chạm mốc 3.000 điểm để thành Đại Kiện Tướng"*.
   - Cập nhật script kiểm thử tự động `run_game_test.js` để test mốc vinh danh 3.000 điểm.

---

### 📌 MỤC 7: CÂU ĐỐ TRÙM & GIỜ VÀNG (BOSS ROUND / RUSH HOUR)
> **Mục tiêu:** Xuất hiện sau mỗi chu kỳ định kỳ (câu 5, 10, 15... hoặc Streamer kích hoạt). Câu đố thành ngữ/tục ngữ dài 4-8 từ, đếm ngược 90s, nhân đôi/ba điểm thưởng kèm theme giao diện rực lửa.

---

### 📌 MỤC 8: QUẢN LÝ NGÂN HÀNG CÂU ĐỐ TỪ ADMIN (QUESTION CMS)
> **Mục tiêu:** Streamer có thể thêm, sửa, xóa, tìm kiếm câu đố trực tiếp trên giao diện Admin Panel mà không cần sửa file JSON code.

---

### 📌 MỤC 9: CHẾ ĐỘ CHIA PHE ĐỐI KHÁNG (TEAM RED VS TEAM BLUE)
> **Mục tiêu:** Người xem bình luận `#do` hoặc `#xanh` để gia nhập phe và kéo co điểm số thời gian thực (Tug of War).

### 📌 MỤC 10: BỘ CÂU HỎI MỚI 30 CÂU THEO 4 DANH MỤC (QUESTION PACK 30)
> **Mục tiêu:** Bổ sung ngân hàng câu hỏi mới lạ, hấp dẫn, không trùng lặp, chia theo 4 danh mục thịnh hành để tăng sự phong phú cho phòng live.

#### 10.1. Danh sách 4 danh mục câu hỏi (30 câu):
- **Danh mục 1: 🌟 Giới Trẻ & Hot Trend (8 câu: ID 1501 - 1508)**
  - *Chữa Lành, Bắt Trend, Gắn Thẻ, Sống Ảo, Thả Thính, Cực Phẩm, Quẩy Hết Mình, Tiểu Thuyết Ngôn Tình*.
- **Danh mục 2: 📜 Thành Ngữ & Tục Ngữ Mới (8 câu: ID 1509 - 1516)**
  - *Mưa Dầm Thấm Lâu, Đi Một Ngày Đàng, Đồng Cam Cộng Khổ, Một Nắng Hai Sương, Vụng Chèo Khéo Chống, Gạo Chợ Nước Sông, Dời Non Lấp Bể, Đường Dài Mới Biết Ngựa Hay*.
- **Danh mục 3: 🍲 Ẩm Thực & Đặc Sản 3 Miền (7 câu: ID 1517 - 1523)**
  - *Cơm Cháy Ninh Bình, Nước Mía Trân Châu, Bún Quậy Phú Quốc, Mì Quảng Tôm Thịt, Bánh Tráng Phơi Sương, Bò Tơ Củ Chi, Cá Bớp Kho Tộ*.
- **Danh mục 4: 🏞️ Danh Lam Thắng Cảnh & Địa Danh (7 câu: ID 1524 - 1530)**
  - *Hoàng Liên Sơn, Đảo Ngọc Phú Quốc, Cố Đô Hoa Lư, Mũi Né Phan Thiết, Cao Nguyên Mộc Châu, Đầm Thị Nại, Quần Đảo Côn Đảo*.

---

## 📅 LỘ TRÌNH THỰC HIỆN TỪNG BƯỚC (ROADMAP)

```text
GIAI ĐOẠN 1: BỘ CÂU HỎI MỚI (LÀM TỪNG DANH MỤC):
  ├── [x] Bước 1: Danh mục 1 - Giới Trẻ & Hot Trend (8 câu: ID 1501-1508)
  ├── [ ] Bước 2: Danh mục 2 - Thành Ngữ & Tục Ngữ Mới (8 câu: ID 1509-1516)
  ├── [ ] Bước 3: Danh mục 3 - Ẩm Thực & Đặc Sản 3 Miền (7 câu: ID 1517-1523)
  └── [ ] Bước 4: Danh mục 4 - Danh Lam Thắng Cảnh & Địa Danh (7 câu: ID 1524-1530)

GIAI ĐOẠN 2: TỐI ƯU HÓA DONATE & VINH DANH TRẬN ĐẤU:
  ├── [x] Bước 5: Mục 6 - Nâng mốc điểm kết thúc game lên 3.000 điểm (Milestone 3000) - XONG
  ├── [x] Bước 6: Mục 4 - Tặng quà trả lời đúng được nhân đôi điểm (Donor Buff x2 Points) - XONG
  └── [x] Bước 7: Mục 5 - Kết thúc game vinh danh cả người tặng quà (Top Donors Hall of Fame) - XONG

GIAI ĐOẠN 3: TẠO CAO TRÀO & TÍNH NĂNG MỞ RỘNG:
  ├── [ ] Bước 8: Mục 7 - Câu Đố Trùm & Giờ Vàng (Boss Round x2)
  ├── [ ] Bước 9: Mục 8 - Quản trị ngân hàng câu đố từ Admin (Question CMS)
  └── [ ] Bước 10: Mục 9 - Chế độ Chia Phe Đối Kháng (Team Red vs Team Blue)
```

---
*Kế hoạch này đã được cập nhật và lưu trữ vào `KE_HOACH_PHAT_TRIEN.md`.*

