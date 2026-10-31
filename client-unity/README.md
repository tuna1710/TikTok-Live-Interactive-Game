# Unity 3D Client - Chùa Online

Thư mục này chứa mã nguồn C# để import và chạy ứng dụng trong **Unity 2022.3 LTS (hoặc mới hơn)**.

---

## 🛠 Hướng dẫn Cài đặt trên Unity

1. Tạo một dự án Unity 3D mới (Khuyến nghị template **Universal Render Pipeline - URP**).
2. Chuyển tỉ lệ hiển thị của Game View sang dọc **9:16 (1080 x 1920)**.
3. Import các file script vào thư mục `Assets/Scripts/`:
   - `TikTokBridgeReceiver.cs`
   - `TempleGameManager.cs`
4. Cài đặt các Package:
   - **TextMeshPro** (Window -> TextMeshPro -> Import TMP Essential Resources).
5. Gắn script:
   - Tạo một GameObject rỗng tên `GameManager` và gắn script `TempleGameManager` và `TikTokBridgeReceiver`.
   - Kéo các Transform, Animator của nhân vật áo lam, hiệu ứng Particle khói trầm/hoa sen và các AudioSource chuông/mõ vào Inspector.
6. Chạy ứng dụng:
   - Đảm bảo module `connector` đang chạy (`npm start` hoặc `npm run mock`).
   - Nhấn **Play** trong Unity Editor. Hệ thống sẽ tự động kết nối tới `ws://localhost:8080`.
