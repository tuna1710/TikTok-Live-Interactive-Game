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
| **9** | 📦 **Hệ Thống Gói Câu Hỏi Theo Từng Ngày** *(Question Packs Day 1, 2, 3...)* | Streamer mỗi ngày live chọn 1 gói riêng biệt 300 câu, chống trùng lặp | **P1** | 🔄 Đang triển khai |
| **-** | ❌ ~~Chế độ Chia Phe Đối Kháng (Team Red vs Team Blue)~~ | *(Đã hủy theo yêu cầu của người dùng)* | -- | 🚫 Đã hủy |

---

## 🚀 KẾ HOẠCH TRIỂN KHAI CHI TIẾT TỪNG MỤC

---

### 📌 MỤC 1: TẶNG QUÀ MỞ CHỮ CÁI GỢI Ý (INTERACTIVE GIFT HINT)
> **Trạng thái:**  *Đã hoàn thiện*
- Khán giả gửi quà tặng: 1 xu = 1 chữ cái gợi ý (Hoa Hồng 1 xu mở 1 chữ, Nước Hoa 10 xu mở 10 chữ, combo N xu mở N chữ) trong ô đáp án kèm hiệu ứng thẻ vàng óng ánh và TTS cảm ơn trang trọng (vẫn giữ chữ cái cuối bí mật theo cấu hình).

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

### 📌 MỤC 6 (YÊU CẦU MỚI 3): ĐIỀU CHỈNH MỐC ĐIỂM KẾT THÚC GAME VỀ 2.000 ĐIỂM (TARGET SCORE 2000)
> **Mục tiêu:** Điều chỉnh giới hạn điểm chạm đích về 2.000 điểm (thay vì 3.000 điểm) để nhịp độ game vừa vặn, kết thúc trận đấu đúng lúc và tăng tính cạnh tranh.

#### 6.1. Chi tiết điều chỉnh (Workflow)
1. **Phía Server (`server.js` & `server-youtube.js`):**
   - Cập nhật biến cấu hình:
     ```javascript
     const MILESTONE_SCORE = Number(process.env.MILESTONE_SCORE) || 2000;
     ```
2. **Phía Client (`public/index.html` & `public/admin.html`):**
   - Cập nhật giao diện modal Siêu Vinh Danh theo mốc 2.000đ.
   - Cập nhật script kiểm thử tự động `run_game_test.js` để test mốc vinh danh 2.000 điểm.

---

### 📌 MỤC 7: CÂU ĐỐ TRÙM & GIỜ VÀNG (BOSS ROUND / RUSH HOUR x2) - [ĐÃ HOÀN THIỆN]
> **Mục tiêu:** Xuất hiện sau mỗi chu kỳ định kỳ (mặc định mỗi 5 vòng, hoặc do Streamer kích hoạt thủ công từ Admin). Câu đố thành ngữ/tục ngữ/từ khóa dài $\ge 4$ từ hoặc $\ge 10$ ký tự, thời gian đếm ngược 90s, nhân đôi điểm số chiến thắng cơ bản (100đ -> 200đ) kết hợp hiệu ứng giao diện rực lửa, nhạc chuông cảnh báo chiến đấu và banner vinh danh hạ gục trùm.

#### 7.1. Cơ chế kỹ thuật (Đã triển khai):
1. **Phía Server (`server.js` & `server-youtube.js`):**
   - Hằng số `BOSS_ROUND_INTERVAL = 5`, `BOSS_ROUND_TIME = 90`.
   - Hàm `pickBossWord()` lọc các câu đố dài $\ge 4$ từ hoặc thuộc danh mục Ca Dao, Tục Ngữ, Thành Ngữ, Văn Học $\ge 10$ ký tự.
   - Khi vào vòng trùm: đặt `gameState.isBossRound = true`, `gameState.roundTimeTotal = 90`, `gameState.timeLeft = 90`.
   - Chấm điểm: `basePoints = gameState.isBossRound ? 200 : 100`. Nếu có thêm Buff quà tặng x2, tổng điểm lên tới 400đ!
   - Thêm 2 API Admin: `startBossRoundNow` (kích hoạt ngay lập tức) và `triggerBossRound` (vòng kế tiếp sẽ là Trùm).
2. **Phía Client (`public/index.html`):**
   - Theme rực lửa `.game-container.boss-mode` với hiệu ứng viền lửa đỏ neon `bossPulseGlow`.
   - Banner `🔥 CÂU ĐỐ TRÙM - GIỜ VÀNG x2 ĐIỂM (90s) 🔥` phía trên thanh thông tin.
   - Đồng hồ đếm ngược 90s viền đỏ lửa chuyển động nhịp thở.
   - Âm thanh cảnh báo `soundBossWarning()` (siren & kèn hiệu báo động).
   - Banner chiến thắng: Huy hiệu `⚔️ HẠ GỤC CÂU ĐỐ TRÙM (GIỜ VÀNG x2)` với điểm số +200đ đến +400đ.
3. **Phía Admin Panel (`public/admin.html`):**
   - Bổ sung 2 nút điều khiển nhanh: `🔥 Kích Hoạt Trùm Ngay (90s)` và `⏳ Vòng Kế Tiếp Là Trùm`.

---

### 📌 MỤC 8: QUẢN LÝ NGÂN HÀNG CÂU ĐỐ TỪ ADMIN (QUESTION CMS)
> **Mục tiêu:** Streamer có thể thêm, sửa, xóa, tìm kiếm câu đố trực tiếp trên giao diện Admin Panel mà không cần sửa file JSON code.

---

### 📌 MỤC 9: HỆ THỐNG GÓI CÂU HỎI THEO TỪNG NGÀY (QUESTION PACKS DAY 1, 2, 3...)
> **Mục tiêu:** Streamer mỗi ngày live chọn một gói câu hỏi riêng biệt (~300 câu/gói). Khán giả trung thành theo dõi nhiều buổi livestream liên tiếp sẽ luôn được trải nghiệm câu đố mới, tránh lặp lại câu hỏi cũ.

### 📌 ~~MỤC CŨ: CHẾ ĐỘ CHIA PHE ĐỐI KHÁNG (TEAM RED VS TEAM BLUE)~~
> *(Đã hủy bỏ theo yêu cầu của người dùng, tập trung trải nghiệm giải đố Vua Tiếng Việt truyền thống & tương tác quà tặng)*

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

### 📌 MỤC 11: BỘ CÂU HỎI 50 CÂU TỪ LÓNG GEN Z & MẠNG XÃ HỘI 2024 - 2026 (QUESTION PACK 50)
> **Trạng thái:**  *Đã hoàn thiện (ID 1531 - 1580)*
> **Mục tiêu:** Tăng độ hấp dẫn, tạo tiếng cười và kích thích bình luận tương tác cực mạnh từ tệp khán giả trẻ trên TikTok Live với các thuật ngữ viral như *Đỉnh Nóc Kịch Trần, Bay Phấp Phới, Xịt Keo Cứng Ngắc, Mắc Cỡ Quá Hai Ơi, Cột Sống Bất Ổn, Hết Cứu, Trầm Kẽm, Hướng Nội Part Time, Cảm Lạnh, Đúng Nhận Sai Cãi, Anh Trai Say Hi, v.v.*

### 📌 MỤC 12: BỘ CÂU HỎI 50 CÂU TỪ LÁY, TỤC NGỮ, ẨM THỰC & DANH THẮNG MỞ RỘNG (QUESTION PACK 50 - PHẦN 2)
> **Trạng thái:**  *Đã hoàn thiện (ID 1581 - 1630)*
> **Mục tiêu:** Gia tăng chiều sâu ngôn ngữ và tính hóc búa cho game với các từ láy tạo hình, câu đố tục ngữ dân gian, món ngon đặc sản 3 miền và danh thắng non nước hùng vĩ.

### 📌 MỤC 13: BỘ CÂU HỎI 30 CÂU HOT TREND, MEME & ĐỜI SỐNG MẠNG XÃ HỘI (QUESTION PACK 30 - PHẦN 3)
> **Trạng thái:**  *Đã hoàn thiện (ID 1631 - 1660)*
> **Mục tiêu:** Cập nhật các trào lưu và meme đình đám của mạng xã hội như *Công Viên Lãm Làng, Ăn Nói Xà Lơ, Chiến Thần Bán Hàng, Tin Chuẩn Chưa Anh, Gian Gian Líu Líu Mập Mờ, Chủ Tịch Giả Nghèo, Cà Thẻ Không Cần Nhìn Giá, Trà Sữa Đất Nung, Chê Nha, Bật Đèn Xanh, v.v.*

---

## 📅 LỘ TRÌNH THỰC HIỆN TỪNG BƯỚC (ROADMAP)

```text
GIAI ĐOẠN 1: BỘ CÂU HỎI MỚI (LÀM TỪNG DANH MỤC):
  ├── [x] Bước 1: Danh mục 1 - Giới Trẻ & Hot Trend (8 câu: ID 1501-1508)
  ├── [x] Bước 2: Danh mục 2 - Thành Ngữ & Tục Ngữ Mới (8 câu: ID 1509-1516)
  ├── [x] Bước 3: Danh mục 3 - Ẩm Thực & Đặc Sản 3 Miền (7 câu: ID 1517-1523)
  ├── [x] Bước 4: Danh mục 4 - Danh Lam Thắng Cảnh & Địa Danh (7 câu: ID 1524-1530)
  ├── [x] Bổ sung 1: Gói 50 câu Từ Lóng Gen Z & Hot Trend Viral 2024-2026 (ID 1531-1580) - XONG
  ├── [x] Bổ sung 2: Gói 50 câu Từ Láy, Tục Ngữ, Ẩm Thực & Danh Thắng (ID 1581-1630) - XONG
  └── [x] Bổ sung 3: Gói 30 câu Hot Trend, Meme & Đời Sống Mạng Xã Hội (ID 1631-1660) - XONG

GIAI ĐOẠN 2: TỐI ƯU HÓA DONATE & VINH DANH TRẬN ĐẤU:
  ├── [x] Bước 5: Mục 6 - Nâng mốc điểm kết thúc game lên 3.000 điểm (Milestone 3000) - XONG
  ├── [x] Bước 6: Mục 4 - Tặng quà trả lời đúng được nhân đôi điểm (Donor Buff x2 Points) - XONG
  └── [x] Bước 7: Mục 5 - Kết thúc game vinh danh cả người tặng quà (Top Donors Hall of Fame) - XONG

GIAI ĐOẠN 3: TẠO CAO TRÀO & HỆ THỐNG GÓI CÂU HỎI THEO NGÀY:
  ├── [x] Bỏ Câu Đố Trùm (Boss Round) - Theo ý kiến người dùng
  ├── [x] Bước 9: Mục 8 - Chọn câu hỏi & Quản trị câu đố từ Admin (Streamer Word Picker & CMS) - XONG
  ├── [x] Hủy bỏ Chế độ Chia Phe Đối Kháng (Team Red vs Team Blue) theo yêu cầu
  └── [x] Bước 10: Vòng Bình Chọn Chủ Đề 12s & Câu Hỏi Đặc Biệt 500đ - XONG
  └── [🔄] Bước 11: Hệ Thống Gói Câu Hỏi Theo Từng Ngày (Gói Ngày 1, Ngày 2, Ngày 3, Ngày 4, Ngày 5...) - ĐANG LÀM

GIAI ĐOẠN 4: CẢI TIẾN TRẢI NGHIỆM LIVESTREAM THEO YÊU CẦU:
  ├── [x] 1. Bỏ Câu Đố Trùm (không còn ngắt quãng nhịp chơi)
  ├── [x] 2. Tặng quà cộng thẳng điểm (1 xu = 500đ, n xu = 500*n), bỏ Buff x2
  ├── [x] 3. Rương tim đầy không hiện popup bảng che màn hình, chỉ mở chữ cái gợi ý
  ├── [x] 4. Giới hạn quà cộng tối đa 1.900đ, bắt buộc đoán đúng 1 câu mới cán mốc 2.000đ để thắng
  ├── [x] 5. Giảm thời gian vinh danh xuống 20 giây (thay vì 60 giây)
  ├── [x] 6. TTS vinh danh: cảm ơn mọi người đã tham gia và báo khán giả chờ đợi giây lát để sang màn tiếp theo
  └── [x] 7. MC Chống Khoảng Lặng (Anti-Dead Air): Tự động nhắc câu hỏi hoặc đọc 30 câu khuấy động khi im lặng 10s
```

---
*Kế hoạch này đã được cập nhật và lưu trữ vào `KE_HOACH_PHAT_TRIEN.md`.*

