# -*- coding: utf-8 -*-
"""
Chùa Linh Ứng Online — Google Colab Runner (Full 8K Visuals + Cloudflare Tunnel)
"""
import os
import sys
import time
import subprocess
import urllib.request
import re

print("="*70)
print("🪷 KHỞI ĐỘNG HỆ THỐNG CHÙA ONLINE TIKTOK LIVE 8K TRÊN GOOGLE COLAB")
print("="*70)

# 1. Cài đặt Cloudflare Tunnel nếu chưa có
cloudflared_bin = "/usr/local/bin/cloudflared"
if not os.path.exists(cloudflared_bin):
    print("📥 Đang tải Cloudflare Tunnel...")
    url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"
    urllib.request.urlretrieve(url, "/tmp/cloudflared")
    os.chmod("/tmp/cloudflared", 0o755)
    subprocess.run(["mv", "/tmp/cloudflared", cloudflared_bin])

# 2. Cài đặt dependencies cho Node.js server
print("📦 Đang kiểm tra thư viện Node.js...")
subprocess.run(["npm", "install", "--silent"], check=True)

# 3. Dọn dẹp tiến trình cũ
subprocess.run(["pkill", "-9", "-f", "node server.js"], stderr=subprocess.DEVNULL)
subprocess.run(["pkill", "-9", "-f", "cloudflared"], stderr=subprocess.DEVNULL)
time.sleep(1)

# 4. Khởi chạy Server Node.js
print("🚀 Đang khởi chạy Server Chùa Linh Ứng (Node.js)...")
server_log = open("/tmp/server.log", "w")
server_proc = subprocess.Popen(["node", "server.js"], stdout=server_log, stderr=subprocess.STDOUT)
time.sleep(3)

# 5. Khởi chạy Cloudflare Tunnel
print("🌐 Đang tạo đường dẫn HTTPS công khai...")
cf_log = open("/tmp/cloudflared.log", "w")
tunnel_proc = subprocess.Popen([cloudflared_bin, "tunnel", "--url", "http://localhost:3000"], stdout=cf_log, stderr=subprocess.STDOUT)

public_url = None
for _ in range(15):
    time.sleep(1)
    if os.path.exists("/tmp/cloudflared.log"):
        with open("/tmp/cloudflared.log", "r") as f:
            content = f.read()
            match = re.search(r'https://[a-zA-Z0-9-]+\.trycloudflare\.com', content)
            if match:
                public_url = match.group(0)
                break

print("\n" + "="*70)
if public_url:
    print("🎉 HỆ THỐNG ĐÃ KHỞI CHẠY THÀNH CÔNG VỚI ĐỒ HỌA 8K ĐẦY ĐỦ!")
    print("="*70)
    print(f"\n👉 [1] Link Trang Quản Trị & Thử Nghiệm (Mở trên trình duyệt):")
    print(f"       {public_url}")
    print(f"\n👉 [2] Link Màn Hình 9:16 Sạch Dán Vào TikTok LIVE Studio / OBS:")
    print(f"       {public_url}/?obs=1")
    print("="*70)
    print("💡 Mẹo: Link trên là link công khai 100%, không bị hỏi đăng nhập GitHub,")
    print("        hình ảnh Đức Phật A Di Đà dát vàng và chánh điện 8K sẽ hiển thị sắc nét!\n")
else:
    print("⚠️ Không lấy được link Cloudflare. Kiểm tra log tại /tmp/cloudflared.log")
    print("Server cục bộ đang chạy tại: http://localhost:3000")

# Giữ tiến trình sống
try:
    server_proc.wait()
except KeyboardInterrupt:
    server_proc.kill()
    tunnel_proc.kill()
