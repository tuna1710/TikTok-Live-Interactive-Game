# -*- coding: utf-8 -*-
"""
Trà Đá Vỉa Hè Hà Nội — Google Colab / VPS Runner (9:16 Interactive Game + Cloudflare Tunnel)
"""
import os
import sys
import time
import subprocess
import urllib.request
import re

print("="*70)
print("🍵 KHỞI ĐỘNG GAME TRÀ ĐÁ VỈA HÈ HÀ NỘI (TIKTOK LIVE 9:16)")
print("="*70)

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
print("📦 Đang kiểm tra thư viện Node.js cho Game Trà Đá Vỉa Hè...")
subprocess.run(["npm", "install", "--silent"], cwd=GAME_DIR, check=True)

# 3. Dọn dẹp tiến trình cũ
subprocess.run(["pkill", "-9", "-f", "games/tra-da-via-he/server.js"], stderr=subprocess.DEVNULL)
subprocess.run(["pkill", "-9", "-f", "cloudflared.*3005"], stderr=subprocess.DEVNULL)
time.sleep(1)

# 4. Khởi chạy Server Game Trà Đá Vỉa Hè (Port 3005)
print("🚀 Đang khởi chạy Server Game Trà Đá Vỉa Hè Hà Nội...")
env = os.environ.copy()
env["PORT"] = "3005"
env["TIKTOK_USERNAME"] = os.environ.get("TIKTOK_USERNAME", "@vuatiengviet171095")

server_log = open("/tmp/trada_server.log", "w")
server_proc = subprocess.Popen(["node", "server.js"], cwd=GAME_DIR, env=env, stdout=server_log, stderr=subprocess.STDOUT)
time.sleep(3)

# 5. Khởi chạy Cloudflare Tunnel cho cổng 3005
print("🌐 Đang tạo đường dẫn HTTPS công khai...")
cf_log = open("/tmp/trada_cloudflared.log", "w")
tunnel_proc = subprocess.Popen([cloudflared_bin, "tunnel", "--url", "http://localhost:3005"], stdout=cf_log, stderr=subprocess.STDOUT)

public_url = None
for _ in range(15):
    time.sleep(1)
    if os.path.exists("/tmp/trada_cloudflared.log"):
        with open("/tmp/trada_cloudflared.log", "r") as f:
            content = f.read()
            match = re.search(r'https://[a-zA-Z0-9-]+\.trycloudflare\.com', content)
            if match:
                public_url = match.group(0)
                break

print("\n" + "="*70)
if public_url:
    print("🎉 GAME TRÀ ĐÁ VỈA HÈ HÀ NỘI ĐÃ SẴN SÀNG TRÊN TIKTOK LIVE!")
    print("="*70)
    print(f"\n👉 [1] Link Màn Hình Game 9:16 Dán Vào TikTok LIVE Studio / OBS:")
    print(f"       {public_url}")
    print(f"\n👉 [2] Link Bảng Điều Khiển Streamer / Test Giả Lập:")
    print(f"       {public_url}/admin.html")
    print("="*70)
    print("💡 Mẹo: Dán link [1] vào mục 'Browser Source' (Nguồn trình duyệt) trong OBS hoặc TikTok Live Studio.")
    print("        Quy định: Thả 100 tim vào ghế VIP 1 (3 ghế), Follow vào ghế VIP 2 (4 ghế). Người sau đẩy người trước!")
    print("        Lệnh: bocdau, chomxe, laixe, goicongan, chomcoho, quayxom, choichai, ngoi, chaotoidi...\n")
else:
    print("⚠️ Không lấy được link Cloudflare. Kiểm tra log tại /tmp/trada_cloudflared.log")
    print("Server cục bộ đang chạy tại: http://localhost:3005")

# Giữ tiến trình sống
try:
    server_proc.wait()
except KeyboardInterrupt:
    server_proc.kill()
    tunnel_proc.kill()
