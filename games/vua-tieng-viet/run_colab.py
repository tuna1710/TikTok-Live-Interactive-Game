# -*- coding: utf-8 -*-
"""
Vua Tiếng Việt (Word Scramble) — Google Colab Runner (9:16 Interactive Game + Cloudflare Tunnel)
"""
import os
import sys
import time
import subprocess
import urllib.request
import re

print("="*70)
print("👑 KHỞI ĐỘNG GAME VUA TIẾNG VIỆT - ĐẢO CHỮ ĐOÁN TỪ (TIKTOK LIVE 9:16)")
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
print("📦 Đang kiểm tra thư viện Node.js và Python cho Game Vua Tiếng Việt...")
subprocess.run(["npm", "install", "--silent"], cwd=GAME_DIR, check=True)
subprocess.run([sys.executable, "-m", "pip", "install", "--quiet", "TikTokLive", "httpx"], check=False)

# 3. Dọn dẹp tiến trình cũ
subprocess.run(["pkill", "-9", "-f", "games/vua-tieng-viet/server.js"], stderr=subprocess.DEVNULL)
subprocess.run(["pkill", "-9", "-f", "games/vua-tieng-viet/tiktok_relay.py"], stderr=subprocess.DEVNULL)
subprocess.run(["pkill", "-9", "-f", "cloudflared.*3002"], stderr=subprocess.DEVNULL)
time.sleep(1)

# 4. Khởi chạy Server Game Vua Tiếng Việt (Port 3002)
print("🚀 Đang khởi chạy Server Game Vua Tiếng Việt...")
env = os.environ.copy()
env["PORT"] = "3002"
env["TIKTOK_USERNAME"] = os.environ.get("TIKTOK_USERNAME", "@2166541467")

server_log = open("/tmp/vuatiengviet_server.log", "w")
server_proc = subprocess.Popen(["node", "server.js"], cwd=GAME_DIR, env=env, stdout=server_log, stderr=subprocess.STDOUT)
time.sleep(3)

# 5. Khởi chạy Cloudflare Tunnel cho cổng 3002
print("🌐 Đang tạo đường dẫn HTTPS công khai...")
cf_log = open("/tmp/vuatiengviet_cloudflared.log", "w")
tunnel_proc = subprocess.Popen([cloudflared_bin, "tunnel", "--url", "http://localhost:3002"], stdout=cf_log, stderr=subprocess.STDOUT)

public_url = None
for _ in range(15):
    time.sleep(1)
    if os.path.exists("/tmp/vuatiengviet_cloudflared.log"):
        with open("/tmp/vuatiengviet_cloudflared.log", "r") as f:
            content = f.read()
            match = re.search(r'https://[a-zA-Z0-9-]+\.trycloudflare\.com', content)
            if match:
                public_url = match.group(0)
                break

print("\n" + "="*70)
if public_url:
    print("🎉 GAME VUA TIẾNG VIỆT ĐÃ SẴN SÀNG TRÊN TIKTOK LIVE!")
    print("="*70)
    print(f"\n👉 [1] Link Màn Hình Game 9:16 Dán Vào TikTok LIVE Studio:")
    print(f"       {public_url}")
    print(f"\n👉 [2] Link Bảng Điều Khiển Streamer:")
    print(f"       {public_url}/admin.html")
    print("="*70)
    print("💡 Mẹo: Dán link [1] vào mục 'Liên kết' trong TikTok LIVE Studio.")
    print("        Khán giả gõ đáp án vào bình luận để ghi điểm, tặng Hoa Hồng để mở gợi ý!\n")
else:
    print("⚠️ Không lấy được link Cloudflare. Kiểm tra log tại /tmp/vuatiengviet_cloudflared.log")
    print("Server cục bộ đang chạy tại: http://localhost:3002")

# Giữ tiến trình sống
try:
    server_proc.wait()
except KeyboardInterrupt:
    server_proc.kill()
    tunnel_proc.kill()
