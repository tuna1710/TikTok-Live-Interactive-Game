# -*- coding: utf-8 -*-
"""
Bạn Có Thông Minh Hơn Học Sinh Lớp 5? — Google Colab Runner (TikTok Live 9:16 + Cloudflare Tunnel)
"""
import os
import sys
import time
import subprocess
import urllib.request
import re

print("="*75)
print("🎓 KHỞI ĐỘNG GAME: BẠN CÓ THÔNG MINH HƠN HỌC SINH LỚP 5? (TIKTOK LIVE 9:16)")
print("="*75)

GAME_DIR = os.path.dirname(os.path.abspath(__file__))

# 1. Cài đặt Cloudflare Tunnel nếu chưa có
cloudflared_bin = "/usr/local/bin/cloudflared"
if not os.path.exists(cloudflared_bin):
    print("📥 Đang tải Cloudflare Tunnel...")
    url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"
    urllib.request.urlretrieve(url, "/tmp/cloudflared")
    os.chmod("/tmp/cloudflared", 0o755)
    subprocess.run(["mv", "/tmp/cloudflared", cloudflared_bin])

# 2. Cài đặt dependencies cho game
print("📦 Đang kiểm tra thư viện Node.js cho Game Lớp Học...")
subprocess.run(["npm", "install", "--silent"], cwd=GAME_DIR, check=True)

# 3. Dọn dẹp tiến trình cũ
subprocess.run(["pkill", "-9", "-f", "games/lop-hoc-thong-minh/server.js"], stderr=subprocess.DEVNULL)
subprocess.run(["pkill", "-9", "-f", "cloudflared"], stderr=subprocess.DEVNULL)
time.sleep(1)

# 4. Khởi chạy Server Game Lớp Học (Port 3006)
print("🚀 Đang khởi chạy Server Game Lớp Học...")
env = os.environ.copy()
env["PORT"] = "3006"
env["TIKTOK_USERNAME"] = os.environ.get("TIKTOK_USERNAME", "")

server_log = open("/tmp/lophoc_server.log", "w")
server_proc = subprocess.Popen(["node", "server.js"], cwd=GAME_DIR, env=env, stdout=server_log, stderr=subprocess.STDOUT)
time.sleep(3)

# 5. Khởi chạy Cloudflare Tunnel cho cổng 3006
print("🌐 Đang tạo đường dẫn HTTPS công khai...")
cf_log = open("/tmp/lophoc_cloudflared.log", "w")
tunnel_proc = subprocess.Popen([cloudflared_bin, "tunnel", "--url", "http://localhost:3006"], stdout=cf_log, stderr=subprocess.STDOUT)

public_url = None
for _ in range(15):
    time.sleep(1)
    if os.path.exists("/tmp/lophoc_cloudflared.log"):
        with open("/tmp/lophoc_cloudflared.log", "r") as f:
            content = f.read()
            match = re.search(r'https://[a-zA-Z0-9-]+\.trycloudflare\.com', content)
            if match:
                public_url = match.group(0)
                break

print("\n" + "="*75)
if public_url:
    print("🎉 GAME LỚP HỌC THÔNG MINH ĐÃ SẴN SÀNG TRÊN TIKTOK LIVE!")
    print("="*75)
    print(f"\n👉 [1] Link Màn Hình Game 9:16 Dán Vào TikTok LIVE Studio:")
    print(f"       {public_url}")
    print(f"\n👉 [2] Link Bảng Điều Khiển & Test Giả Lập:")
    print(f"       {public_url}/admin.html")
    print("="*75)
    print("💡 Hướng dẫn:")
    print("   - Dán link [1] vào mục 'Liên kết' trong TikTok LIVE Studio.")
    print("   - Độ phân giải: 1080 x 1920 (dọc 9:16).")
    print("   - Khán giả comment A/B/C/D để chọn đáp án, tặng quà để lên làm Lớp Trưởng!\n")
else:
    print("⚠️ Không lấy được link Cloudflare. Kiểm tra log tại /tmp/lophoc_cloudflared.log")
    print("Server cục bộ đang chạy tại: http://localhost:3006")

# Giữ tiến trình sống
try:
    server_proc.wait()
except KeyboardInterrupt:
    server_proc.kill()
    tunnel_proc.kill()
