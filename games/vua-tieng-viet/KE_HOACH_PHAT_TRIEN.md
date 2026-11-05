# 📋 KẾ HOẠCH PHÁT TRIỂN & LỘ TRÌNH TÍNH NĂNG GAME VUA TIẾNG VIỆT
*(TikTok Live Interactive Game)*

Tài liệu này lưu trữ danh sách 6 tính năng nâng cấp tương tác phòng live, phân tích kiến trúc kỹ thuật và kế hoạch thực hiện từng bước từ dễ đến nâng cao.

---

## 🎯 DANH SÁCH 6 TÍNH NĂNG NÂNG CẤP

| STT | Tên tính năng | Mục tiêu tương tác | Độ ưu tiên | Độ khó |
| :---: | :--- | :--- | :---: | :---: |
| **1** | 🎁 **Tặng quà mở chữ cái gợi ý** *(Interactive Gift Hint)* | Tăng doanh thu donate / xu từ quà tặng nhỏ (hoa hồng, tim...) | **P1 (Cao nhất)** | Vừa |
| **2** | 🔥 **Chuỗi thắng liên tiếp** *(Combo Win Streak & Flame)* | Giữ chân người xem ở lại livestream qua nhiều vòng liên tục | **P1 (Cao nhất)** | Dễ - Vừa |
| **3** | 🎯 **Câu Đố Trùm & Giờ Vàng** *(Boss Round / Rush Hour x2)* | Tạo cao trào, giải tỏa nhịp độ đều đều sau mỗi 5 - 10 vòng | **P2 (Cao)** | Vừa |
| **4** | 📚 **Quản lý ngân hàng câu đố từ Admin** *(Question CMS)* | Tiện lợi cho Streamer cập nhật câu đố trend không cần sửa code | **P2 (Cao)** | Vừa |
| **5** | ⚔️ **Chế độ Chia Phe Đối Kháng** *(Team Red vs Team Blue)* | Tạo hiệu ứng đám đông, rủ bạn bè comment theo phe | **P3 (Mở rộng)** | Nâng cao |
| **6** | 🎡 **Rương Kho Báu / Mốc Tim Thả Like** *(Like Milestone Chest)* | Thúc đẩy khán giả tích cực chạm màn hình thả tim (Likes) | **P3 (Mở rộng)** | Vừa |

---

## 🚀 KẾ HOẠCH TRIỂN KHAI TỪNG MỤC

### 📌 MỤC 1: TẶNG QUÀ MỞ CHỮ CÁI GỢI Ý (INTERACTIVE GIFT HINT)
> **Mục tiêu:** Khi khán giả gặp từ khóa khó, họ có thể tặng quà nhỏ (ví dụ từ 1 xu trở lên như Hoa Hồng 🌹) để tự động lật mở 1 chữ cái trong đáp án.

#### 1.1. Luồng xử lý kỹ thuật (Workflow)
1. **Lắng nghe sự kiện quà:**
   - Trong `server.js`, bắt sự kiện `gift` từ TikTok Live (`tiktokConn.on(WebcastEvent.GIFT)` hoặc API giả lập `/admin/api`).
   - Kiểm tra điều kiện: Vòng chơi đang diễn ra (`gameState.status === 'playing'`), từ khóa còn ít nhất 1 chữ cái chưa được mở.
2. **Logic mở ký tự:**
   - Danh sách ký tự của từ gốc: loại bỏ dấu cách.
   - Chọn ngẫu nhiên một vị trí chưa mở trong mảng `revealedPositions`.
   - Giới hạn: Không mở hết 100% từ (giữ lại ít nhất 1-2 chữ cái cuối cùng để khán giả đoán).
3. **Phát tín hiệu Realtime (`socket.io`):**
   - Emit event `letterRevealedByGift`:
     ```json
     {
       "revealedIndex": 3,
       "char": "N",
       "donor": { "nickname": "Nguyễn Văn A", "avatar": "...", "giftName": "Hoa Hồng" },
       "remainingHidden": 2
     }
     ```
4. **Hiệu ứng giao diện (Client `index.html`):**
   - Ô chữ tương ứng trên màn hình xoay 360 độ (flip animation), chuyển màu vàng kim óng ánh.
   - Âm thanh: Tiếng "ting ting" mở khóa kỳ diệu.
   - Banner nhỏ trượt từ góc: *"🌹 [Tên khán giả] vừa tặng [Quà] - Mở chữ: [Chữ cái]!"*.
   - TTS đọc: *"Cảm ơn [Tên] đã mở giúp chữ [Chữ cái]!"*.
5. **Công cụ quản trị (Admin):**
   - Thêm nút test *"Thử tặng quà mở 1 chữ cái"* và công tắc bật/tắt tính năng trong `admin.html`.

---

### 📌 MỤC 2: CHUỖI THẮNG LIÊN TIẾP (COMBO WIN STREAK)
> **Mục tiêu:** Kích thích sự cạnh tranh giữa các cao thủ đoán từ bằng cách vinh danh chuỗi đoán đúng liên tiếp.

#### 2.1. Luồng xử lý kỹ thuật (Workflow)
1. **Lưu trữ trạng thái Streak:**
   - Trong `server.js`, duy trì biến:
     - `currentStreakWinner`: `{ uniqueId, nickname, count }`.
   - Khi hết vòng và có người thắng:
     - Nếu `winner.uniqueId === currentStreakWinner.uniqueId` -> `count++`.
     - Nếu là người khác thắng -> reset streak của người cũ, gán người mới với `count = 1`.
2. **Hệ số thưởng điểm:**
   - Chuỗi 2 câu: x1.2 điểm (+ huy hiệu 🔥 Lửa nhỏ).
   - Chuỗi 3-4 câu: x1.5 điểm (+ huy hiệu 🔥🔥 Bốc cháy).
   - Chuỗi từ 5 câu trở lên: x2.0 điểm (+ huy hiệu ⚡ Bất Bại).
3. **Hiệu ứng giao diện (Client):**
   - Hiển thị huy hiệu `COMBO x3 🔥` cạnh avatar và tên người chơi trong khung chúc mừng chiến thắng và trên bảng xếp hạng.
   - Tạo hiệu ứng hạt lửa rực cháy quanh thẻ người chơi.
   - Âm thanh: Tiếng combo dồn dập (power-up chime).
   - Giọng đọc TTS: *"Thần tốc! [Tên] đã đạt chuỗi 3 câu bất bại liên tiếp!"*.

---

### 📌 MỤC 3: CÂU ĐỐ TRÙM & GIỜ VÀNG (BOSS ROUND / RUSH HOUR)
> **Mục tiêu:** Tạo điểm nhấn kịch tính định kỳ, giúp buổi livestream không bị đều đều và giữ tỷ lệ giữ chân (retention) cao.

#### 3.1. Luồng xử lý kỹ thuật (Workflow)
1. **Cơ chế kích hoạt:**
   - Tự động sau mỗi chu kỳ cố định (ví dụ: mỗi câu số 5, 10, 15... hoặc sau 15 phút).
   - Streamer có nút chủ động *"Kích hoạt Câu Đố Trùm ngay"* trên Admin panel.
2. **Đặc điểm Câu Đố Trùm:**
   - Độ khó: Câu đố dài từ 4 đến 8 từ (thành ngữ, tục ngữ Việt Nam).
   - Thời gian đếm ngược: 90 giây (thay vì 60s thông thường).
   - Điểm thưởng: x2 hoặc x3 điểm xếp hạng.
3. **Hiệu ứng giao diện (Client):**
   - Toàn bộ giao diện chuyển sang theme rực lửa (Đỏ - Vàng phong cách Boss Fight).
   - Nhạc nền / hiệu ứng còi cảnh báo: *"CẢNH BÁO: CÂU ĐỐ TRÙM XUẤT HIỆN!"*.
   - Pháo hoa và hiệu ứng rung chấn màn hình khi có người hạ gục câu đố trùm.

---

### 📌 MỤC 4: QUẢN LÝ NGÂN HÀNG CÂU ĐỐ TỪ ADMIN (QUESTION CMS)
> **Mục tiêu:** Streamer hoặc quản trị viên có thể thêm, sửa, xóa, tìm kiếm câu đố ngay trên giao diện web mà không cần thao tác vào file JSON hoặc server.

#### 4.1. Luồng xử lý kỹ thuật (Workflow)
1. **RESTful API phía Server (`server.js`):**
   - `GET /admin/api/words`: Lấy danh sách câu đố (hỗ trợ phân trang, tìm kiếm, lọc theo chủ đề).
   - `POST /admin/api/words`: Thêm câu đố mới (tự động chuẩn hóa chữ in hoa, kiểm tra trùng lặp).
   - `PUT /admin/api/words/:id`: Chỉnh sửa câu đố, gợi ý, danh mục.
   - `DELETE /admin/api/words/:id`: Xóa câu đố khỏi kho dữ liệu.
   - Tự động ghi đồng bộ vào `data/words.json`.
2. **Giao diện trang Quản trị (`admin.html`):**
   - Tab mới: **Quản Lý Câu Đố**.
   - Form nhập liệu nhanh: *Từ khóa* + *Chủ đề (Dropdown: Ẩm thực, Địa danh, Ca dao, Thành ngữ...)* + *Gợi ý*.
   - Bảng hiển thị có thanh tìm kiếm theo từ khóa.

---

### 📌 MỤC 5: CHẾ ĐỘ CHIA PHE ĐỐI KHÁNG (TEAM RED VS TEAM BLUE)
> **Mục tiêu:** Biến trò chơi đơn lẻ thành trận chiến đồng đội giữa 2 bên phòng live, kích thích khán giả rủ nhau vào comment trợ lực cho phe mình.

#### 5.1. Luồng xử lý kỹ thuật (Workflow)
1. **Cơ chế gia nhập phe:**
   - Khán giả comment `#do` (hoặc emoji 🔴) để vào Phe Đỏ.
   - Khán giả comment `#xanh` (hoặc emoji 🔵) để vào Phe Xanh.
   - Lưu trữ `userTeams`: `Map(uniqueId -> 'red' | 'blue')`.
2. **Tính điểm phe:**
   - Khi người chơi phe nào đoán đúng, toàn bộ phe đó được cộng 100 điểm.
   - Thêm cơ chế phụ: Mỗi bình luận cổ vũ của phe được cộng 1 điểm lực.
3. **Giao diện màn hình chính (`index.html`):**
   - Thanh kéo co (Tug-of-War Bar) chia đôi màn hình: Phe Đỏ (Trái) vs Phe Xanh (Phải).
   - Hiển thị tỷ lệ phần trăm thắng thế thời gian thực.
   - Tổng kết hiệp đấu sau mỗi 10 vòng để trao cúp cho phe chiến thắng.

---

### 📌 MỤC 6: RƯƠNG KHO BÁU & MỐC TIM THẢ LIKE (LIKE MILESTONE CHEST)
> **Mục tiêu:** Tận dụng thuật toán TikTok (livestream nhiều tym được đề xuất For You) để kêu gọi người xem nhấn màn hình thả tim liên tục.

#### 6.1. Luồng xử lý kỹ thuật (Workflow)
1. **Cơ chế đếm tym tích lũy:**
   - Đếm biến `sessionLikes` từ TikTok Event `like`.
   - Thiết lập thanh tiến trình mục tiêu: Ví dụ `0 / 500 Tim` -> `500 / 1.000 Tim`.
2. **Kích hoạt Rương Kho Báu khi đầy thanh:**
   - Khi đủ mốc (vd: đạt mỗi 500 tim), rương vàng rung rinh và mở tung ra quà tặng ngẫu nhiên cho phòng live:
     - *Phần thưởng 1:* Tự động mở 2 chữ cái ngẫu nhiên cho câu hiện tại.
     - *Phần thưởng 2:* Cộng thêm 30 giây thời gian suy nghĩ.
     - *Phần thưởng 3:* Tặng 100 điểm may mắn ngẫu nhiên cho 1 khán giả đang bình luận nhiều nhất.
3. **Hiệu ứng giao diện (Client):**
   - Thanh tiến trình Tym ở cạnh dưới hoặc trên màn hình.
   - Rương báu 3D/2D hoạt hình nổ tung pháo hoa và tiền vàng rơi ngập màn hình.

---

## 📅 LỘ TRÌNH THỰC HIỆN ĐỀ XUẤT (ROADMAP)

```text
GIAI ĐOẠN 1 (Tăng Tương Tác Cốt Lõi & Doanh Thu Quà):
  ├── [x] Hoàn thiện tính năng Quà Tặng & Follower Thank You
  ├── [x] Bước 1: Mục 1 - Tặng quà mở chữ cái gợi ý (Interactive Gift Hint) - ĐÃ HOÀN THÀNH
  └── [ ] Bước 2: Mục 2 - Chuỗi thắng liên tiếp (Combo Win Streak & Flame)

GIAI ĐOẠN 2 (Tạo Cao Trào & Quản Trị Nội Dung):
  ├── [ ] Bước 3: Mục 3 - Câu Đố Trùm & Giờ Vàng (Boss Round x2)
  └── [ ] Bước 4: Mục 4 - Quản lý ngân hàng câu đố từ Admin (Question CMS)

GIAI ĐOẠN 3 (Cơ Chế Đám Đông & Giữ Chân Tối Đa):
  ├── [ ] Bước 5: Mục 6 - Rương Kho Báu & Mốc Tim Thả Like (Like Chest)
  └── [ ] Bước 6: Mục 5 - Chế độ Chia Phe Đối Kháng (Team Red vs Team Blue)
```

---
*Kế hoạch này đã được lưu vào hệ thống (`KE_HOACH_PHAT_TRIEN.md`) để có thể triển khai từng bước theo yêu cầu.*
