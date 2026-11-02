# 🏮 Game Thả Đèn Hoa Đăng Cầu Nguyện (Floating Wish Lanterns) - TikTok Live

Một tựa game tương tác livestream thời gian thực dành cho **TikTok Live**, mang phong cách văn hóa lễ hội thả đèn hoa đăng cổ truyền trên dòng sông ánh trăng lung linh (phong cách Hội An đêm rằm).

Game được thiết kế nhằm **thay thế hoàn hảo cho các chủ đề tâm linh chùa chiền dễ bị đánh gậy**, loại bỏ 100% rủi ro bản quyền âm thanh và tuân thủ tuyệt đối chính sách cộng đồng của TikTok.

---

## 🌟 Tính Năng Nổi Bật

1. **Dòng Sông Ánh Trăng 9:16 Huyền Ảo:**
   * Bầu trời đêm tĩnh lặng với **Trăng Rằm dát vàng** tỏa quầng sáng, 70 vì sao lấp lánh và dãy núi xa mờ sương.
   * Dòng sông lung linh với gợn sóng nhấp nhô phản chiếu ánh trăng, đom đóm bay lượn trên mặt nước.

2. **Cơ Chế Thả Đèn Hoa Đăng Tương Tác:**
   * **Bình luận:** Mọi bình luận của khán giả (ví dụ: *"Cầu gia đình bình an"*, *"Chúc mọi sự may mắn"*,...) sẽ tự động hóa thành một đóa hoa sen đèn nến lung linh mang **Tên + Avatar + Lời ước** của người đó trôi êm đềm trên sông.
   * **Quà tặng 1–9 xu (Hoa hồng, Kem,...):** Thắp sáng **Đèn Hoa Sen Vàng Hoàng Kim** kích thước lớn với hào quang sáng chói.
   * **Quà tặng 10–89 xu (Vương miện,...):** Thắp sáng **Đèn Hoa Sen Thất Bảo Cung Đình** đa tầng lộng lẫy.
   * **Quà tặng 99+ xu (Pháo hoa, Tên lửa, Sư tử,...):** Thả **Đèn Lồng Khổng Minh Thần Tài** rực rỡ từ từ bay bổng lên bầu trời đầy sao.
   * **Thả tim (Like):** Mỗi 40 tim tích luỹ sẽ tạo hiệu ứng gợn sóng lấp lánh và đom đóm tung bay rực rỡ trên mặt nước.

3. **Âm Thanh Thuần Khiết 100% Không Bản Quyền:**
   * Tiếng suối róc rách đêm trăng và tiếng chuông gió phong thủy ngân vang được tổng hợp hoàn toàn bằng **Web Audio API**.
   * Không sử dụng file MP3/M4A bên ngoài $\rightarrow$ Vĩnh viễn không lo bị TikTok Content ID tắt tiếng hay đánh gậy.

4. **Trang Quản Trị Streamer (`/admin.html`):**
   * Đổi kênh TikTok Live đích theo thời gian thực.
   * Bảng test giả lập: Thả đèn bình luận, test tặng Đèn Sen Vàng, Đèn Khổng Minh, thả tim.
   * Nút dọn dẹp làm sạch lòng sông.

---

## 🚀 Cài Đặt & Khởi Chạy

### Cách 1: Chạy trực tiếp (Local / VPS)
```bash
cd games/tha-den-hoa-dang
npm install
npm start
```
* **Màn hình Stream:** `http://localhost:3004`
* **Bảng điều khiển Admin:** `http://localhost:3004/admin.html`

### Cách 2: Chạy trên Google Colab
```bash
cd games/tha-den-hoa-dang
python3 run_colab.py
```
Script sẽ tự động khởi động Server và tạo link HTTPS qua Cloudflare Tunnel để dán trực tiếp vào OBS hoặc TikTok Live Studio.

---

## 📺 Cấu Hình OBS / TikTok Live Studio

1. Trong OBS hoặc TikTok Live Studio, thêm nguồn: **Browser (Trình duyệt / Liên kết)**.
2. Dán đường link màn hình game (`http://localhost:3004` hoặc link Cloudflare).
3. Đặt kích thước:
   - **Rộng (Width):** `480`
   - **Cao (Height):** `854` (Tỉ lệ chuẩn 9:16 dọc của TikTok).
4. Tích chọn **"Control audio via OBS" (Điều khiển âm thanh qua OBS)** để luồng stream phát tiếng suối chảy và tiếng chuông gió phong thủy êm dịu.
