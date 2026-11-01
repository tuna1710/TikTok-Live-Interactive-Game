# 🪷 TikTok Live Interactive Game — Chùa Online (Chánh Điện 9:16)

<div align="center">

[![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/tuna1710/TikTok-Live-Interactive-Game/blob/main/Chua_Online_TikTok_Live.ipynb)
![Platform](https://img.shields.io/badge/Platform-TikTok%20Live-fe2c55?style=for-the-badge&logo=tiktok&logoColor=white)
![Node.js](https://img.shields.io/badge/Runtime-Node.js%20%7C%20Bun-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Python](https://img.shields.io/badge/AI%20Voice-ZeroTTS%20%7C%20Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)

**Hệ thống phát trực tiếp tương tác Chùa Online chuẩn khung dọc 9:16 (`1080×1920`) dành cho TikTok LIVE Studio & OBS Studio.**  
Tự động chuyển hóa các tương tác thật từ phòng Live (Thả tim, Bình luận, Tặng quà/Xu, Follow, Share) thành các nghi thức dâng hương, lạy tam bái, gõ mõ tích công đức và vinh danh lên bảng vàng.

</div>

---

## 🌟 Điểm Nổi Bật & Tính Năng Tương Tác

- 🔥 **Thắp hương & Đảnh lễ Tam Bái**: Khán giả comment `thắp hương`, `cầu an`, `nam mô`, nhân vật áo lam sẽ bước lên thảm đỏ dâng nhang vào lư hương đồng và thực hiện 3 lạy trước Đức Phật A Di Đà.
- 🪵 **Gõ Mõ & Tích Lũy Công Đức**: Mỗi lượt khán giả thả tim, hệ thống tự động gõ mõ tích điểm công đức và kích hoạt làn sóng vái lạy.
- 🔔 **Thỉnh Đại Hồng Chung**: Chia sẻ / Follow hoặc tặng quà sẽ thỉnh chuông đồng ngân vang 3 hồi với hiệu ứng sóng âm lan tỏa.
- 🎋 **Xin Xăm / Gieo Quẻ Đồng Bộ**: Người xem bình luận `xin xăm` sẽ tự động lắc ống xăm và mở tờ giải quẻ (Thượng Thượng Cát, Đại Cát...).
- 🪷 **Tặng Quà & Hoa Sen Vàng Nở**: Khán giả tặng quà xu sẽ kích hoạt mưa cánh sen hồng rơi khắp chùa, đài sen vàng phát sáng rực rỡ và giọng đọc AI xướng tên cảm ơn.
- 📜 **Bảng Vàng Công Đức (`TẤM LÒNG THÀNH`)**: Tự động xếp hạng top người cúng dường nhiều nhất theo thời gian thực và bố trí 6 đệm quỳ VIP trước bàn thờ.
- ⚡ **Siêu nhẹ GPU / CPU**: Đã tối ưu hóa sprite 2.5D và canvas particles ở 30 FPS, không gây lag giật hay sụt khung hình (drop frame) khi phát live.

---

## 🚀 Hướng Dẫn Khởi Chạy

### Cách 1: Chạy Trực Tiếp Trên Google Colab (Tiện lợi nhất)
Bạn có thể chạy toàn bộ hệ thống trên Google Colab mà không cần cài đặt gì vào máy tính cá nhân:
1. Nhấp vào huy hiệu **[Open in Colab](https://colab.research.google.com/github/tuna1710/TikTok-Live-Interactive-Game/blob/main/Chua_Online_TikTok_Live.ipynb)** ở trên.
2. Chạy **Bước 1** để tải mã nguồn và khởi động hệ thống.
3. Colab sẽ tự động tạo đường link công khai dạng `https://xxxx.trycloudflare.com`.
   * **Link kiểm tra & điều khiển:** `https://xxxx.trycloudflare.com`
   * **Link màn hình Live sạch cho OBS:** `https://xxxx.trycloudflare.com/?obs=1`
4. Dán link sạch vào **TikTok LIVE Studio** mà không bị hỏi đăng nhập hay lỗi màn hình đen!

---

### Cách 2: Chạy Trên Máy Tính Cá Nhân (Local PC) hoặc GitHub Codespaces

#### 1. Yêu cầu hệ thống
- **Node.js** (`>= 18`) hoặc **Bun.js** (`>= 1.1`)
- **Python 3.10+** (nếu muốn dùng giọng đọc AI ZeroTTS)

#### 2. Cài đặt và khởi động
```bash
# 1. Cài đặt các gói phụ thuộc Web
npm install
# (hoặc: bun install)

# 2. Cài đặt thư viện AI đọc tiếng Việt (tùy chọn)
pip install zerotts pillow

# 3. Khởi chạy Server
node server.js
# (hoặc: bun start)
```

Server sẽ chạy tại cổng `3000`:
- **Giao diện Chánh Điện + Bảng Điều Khiển Nhanh:** `http://localhost:3000`
- **Màn hình OBS Browser Source Sạch 9:16:** `http://localhost:3000/?obs=1`
- **Bảng Điều Khiển Quản Trị JSON-RPC:** `http://localhost:3000/admin`

---

## 📺 Cài Đặt Vào TikTok LIVE Studio & OBS Studio

1. Trong **TikTok LIVE Studio**, bấm **Thêm nguồn** $\rightarrow$ chọn **"Liên kết"** (biểu tượng quả cầu 🌐).
2. Cấu hình nguồn liên kết:
   * **URL:** `http://localhost:3000/?obs=1` *(hoặc link `https://xxxx.trycloudflare.com/?obs=1` nếu chạy từ Colab)*.
   * **Độ phân giải:** `1080 x 1920` (chuẩn khung dọc 9:16).
   * **Âm thanh:** Tích chọn bật âm thanh để truyền tiếng chuông mõ lên live.
3. Mở trang quản trị `http://localhost:3000` (hoặc `/admin`), nhập `@username_tiktok` của bạn và bấm **Kết Nối** khi đang phát sóng.

---

## 🎮 Bảng Quy Tắc Tương Tác

| Sự kiện TikTok Live | Điều kiện / Từ khóa | Nghi thức trên Chánh Điện | Điểm Công Đức |
| :--- | :--- | :--- | :---: |
| **Thả tim (Like)** | Mỗi đợt thả tim | Gõ mõ tụng kinh + Phật tử vái lạy | `+1` / tim |
| **Bình luận Thắp hương** | `thắp hương`, `dâng hương`, `lạy phật`, `bái phật` | Phật tử áo lam bước lên thảm đỏ, lạy tam bái trước Tam Bảo | `+15` |
| **Bình luận Cầu an** | `cầu ...`, `nam mô`, `a di đà phật`, `bình an` | Thả đèn hoa đăng bay lên trời mang theo lời khấn | `+10` |
| **Bình luận Xin xăm** | `xin xăm`, `gieo quẻ`, `rút quẻ` | Lắc ống xăm và mở tờ giải quẻ cát tường | `+10` |
| **Follow / Share** | Người xem follow hoặc chia sẻ | Thỉnh Đại Hồng Chung ngân vang + Sóng âm vàng | `+10` |
| **Tặng quà nhỏ (1–4 xu)** | Hoa hồng, Heart Me... | Dâng Đài Sen Vàng + Thắp hương | `+20` / xu |
| **Tặng quà lớn (≥ 100 xu)** | Quà tặng VIP | **Đại Lễ Kim Long Chầu Phật**: Mưa hoa sen, Chuông ngân, Vinh danh Top 1 | `+50` / xu |

---

## ⚖️ Tuyên Bố Miễn Trừ Trách Nhiệm (Disclaimer)
Ứng dụng được thiết kế nhằm mục đích **giải trí, chiêm bái tâm linh trực tuyến và nuôi dưỡng thiện tâm**. Quà tặng trên livestream là tương tác trò chơi ảo trên nền tảng TikTok, không phải tiền cúng dường tôn giáo ngoài đời thật. Vui lòng giữ không gian phòng Live trang nghiêm, thanh tịnh.

---
**Giấy phép:** MIT License. Tác giả: [@tuna1710](https://github.com/tuna1710).
