# -*- coding: utf-8 -*-
"""
Script Live Ngầm Tự Động Game Vua Tiếng Việt Lên YouTube (Không Cần OBS)
Hoạt động trên Google Colab hoặc VPS Linux Ubuntu/Debian.
"""
import os
import sys
import time
import subprocess
import urllib.request
import re
import argparse
import signal

def parse_args():
    parser = argparse.ArgumentParser(description="Live ngầm YouTube Game Vua Tiếng Việt")
    parser.add_argument("--stream-key", type=str, default=os.environ.get("YOUTUBE_STREAM_KEY", ""), help="Khóa luồng YouTube (Stream Key)")
    parser.add_argument("--live-id", type=str, default=os.environ.get("YOUTUBE_LIVE_ID", "TuH8JlNLlxI"), help="YouTube Live ID (mặc định: TuH8JlNLlxI)")
    parser.add_argument("--width", type=int, default=1080, help="Độ rộng màn hình (mặc định: 1080)")
    parser.add_argument("--height", type=int, default=1920, help="Chiều cao màn hình (mặc định: 1920)")
    return parser.parse_args()

def find_chrome():
    for cmd in ["google-chrome", "google-chrome-stable", "chromium-browser", "chromium", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium-browser", "/usr/bin/chromium"]:
        if subprocess.call(["which", cmd], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) == 0:
            return cmd
    return None

def check_and_install_dependencies():
    print("📦 [1/6] Kiểm tra môi trường hệ thống...")
    need_apt = []
    if subprocess.call(["which", "Xvfb"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) != 0:
        need_apt.append("xvfb")
    if subprocess.call(["which", "ffmpeg"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) != 0:
        need_apt.append("ffmpeg")
    if subprocess.call(["which", "pulseaudio"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) != 0:
        need_apt.append("pulseaudio")

    if need_apt:
        print(f"📥 Đang cài đặt gói bổ sung: {', '.join(need_apt)}...")
        try:
            subprocess.run(["apt-get", "update", "-qq"], check=True)
            subprocess.run(["apt-get", "install", "-y", "-qq"] + need_apt, check=True)
        except Exception as e:
            print(f"⚠️ Cảnh báo apt-get: {e}")

    # Kiểm tra và tự động cài đặt Google Chrome
    if not find_chrome():
        print("📥 Đang tải và cài đặt Google Chrome...")
        try:
            chrome_deb = "/tmp/google-chrome-stable_current_amd64.deb"
            urllib.request.urlretrieve("https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb", chrome_deb)
            subprocess.run(["apt-get", "update", "-qq"], check=False)
            subprocess.run(["apt-get", "install", "-y", "-qq", chrome_deb], check=True)
            if os.path.exists(chrome_deb):
                os.remove(chrome_deb)
        except Exception as e:
            print(f"⚠️ Cài đặt Chrome deb lỗi ({e}), thử cài chromium-browser...")
            subprocess.run(["apt-get", "install", "-y", "-qq", "chromium-browser"], check=False)

    # Cloudflared
    cf_bin = "/usr/local/bin/cloudflared"
    if not os.path.exists(cf_bin):
        print("📥 Đang tải Cloudflare Tunnel...")
        try:
            url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"
            urllib.request.urlretrieve(url, "/tmp/cloudflared")
            os.chmod("/tmp/cloudflared", 0o755)
            subprocess.run(["mv", "/tmp/cloudflared", cf_bin])
        except Exception as e:
            print(f"⚠️ Không tải được cloudflared: {e}")

def main():
    args = parse_args()

    print("=" * 70)
    print("👑 TỰ ĐỘNG PHÁT LIVE NGẦM YOUTUBE: GAME VUA TIẾNG VIỆT (KHÔNG CẦN OBS)")
    print("=" * 70)

    stream_key = args.stream_key.strip()
    if not stream_key:
        print("\n❌ LỖI: Bạn chưa cung cấp Stream Key (Khóa luồng YouTube)!")
        print("👉 Cách lấy: Vào trang YouTube Studio -> Tạo Live -> Sao chép 'Khóa sự kiện trực tiếp'.")
        print("👉 Cách chạy:")
        print("   python3 live_ngam_youtube.py --stream-key YOUR_KEY_HERE --live-id TuH8JlNLlxI\n")
        sys.exit(1)

    live_id = args.live_id.strip()
    w, h = args.width, args.height
    game_dir = os.path.dirname(os.path.abspath(__file__))

    check_and_install_dependencies()

    # Dọn dẹp tiến trình cũ
    print("🧹 [2/6] Dọn dẹp tiến trình cũ...")
    subprocess.run(["pkill", "-9", "-f", "Xvfb :99"], stderr=subprocess.DEVNULL)
    subprocess.run(["pkill", "-9", "-f", "server-youtube.js"], stderr=subprocess.DEVNULL)
    subprocess.run(["pkill", "-9", "-f", "chrome.*3002"], stderr=subprocess.DEVNULL)
    subprocess.run(["pkill", "-9", "-f", "ffmpeg.*rtmp"], stderr=subprocess.DEVNULL)
    subprocess.run(["pkill", "-9", "-f", "cloudflared.*3002"], stderr=subprocess.DEVNULL)
    time.sleep(1)

    # Cài npm nếu cần
    print("📦 [3/6] Kiểm tra thư viện Node.js...")
    subprocess.run(["npm", "install", "--silent"], cwd=game_dir, check=True)

    # 1. Khởi tạo màn hình ảo Xvfb :99
    print(f"🖥️ [4/6] Khởi tạo màn hình ảo {w}x{h} (Display :99)...")
    xvfb_proc = subprocess.Popen(
        ["Xvfb", ":99", "-screen", "0", f"{w}x{h}x24", "-ac"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    time.sleep(2)

    # Thiết lập âm thanh PulseAudio (nếu có)
    has_pulse = False
    try:
        subprocess.run(["pulseaudio", "--start", "--exit-idle-time=-1"], stderr=subprocess.DEVNULL)
        subprocess.run(["pactl", "load-module", "module-null-sink", "sink_name=virtual_sink"], stderr=subprocess.DEVNULL)
        subprocess.run(["pactl", "set-default-sink", "virtual_sink"], stderr=subprocess.DEVNULL)
        has_pulse = True
    except Exception:
        has_pulse = False

    # 2. Khởi chạy Server Game Node.js
    print(f"🚀 [5/6] Khởi chạy Server Game kết nối YouTube Live ID: {live_id}...")
    server_env = os.environ.copy()
    server_env["PORT"] = "3002"
    server_env["YOUTUBE_LIVE_ID"] = live_id

    server_log = open("/tmp/yt_server.log", "w")
    server_proc = subprocess.Popen(
        ["node", "server-youtube.js"],
        cwd=game_dir,
        env=server_env,
        stdout=server_log,
        stderr=subprocess.STDOUT
    )
    time.sleep(3)

    # 3. Tạo Cloudflare Tunnel để truy cập Admin từ điện thoại/máy tính
    print("🌐 Mở đường truyền quản trị MC Cloudflare Tunnel...")
    cf_log = open("/tmp/yt_cf.log", "w")
    tunnel_proc = subprocess.Popen(
        ["cloudflared", "tunnel", "--url", "http://localhost:3002"],
        stdout=cf_log,
        stderr=subprocess.STDOUT
    )

    public_url = None
    for _ in range(15):
        time.sleep(1)
        if os.path.exists("/tmp/yt_cf.log"):
            with open("/tmp/yt_cf.log", "r") as f:
                content = f.read()
                match = re.search(r'https://[a-zA-Z0-9-]+\.trycloudflare\.com', content)
                if match:
                    public_url = match.group(0)
                    break

    # 4. Mở Google Chrome/Chromium toàn màn hình trên Display :99
    chrome_bin = find_chrome()
    if not chrome_bin:
        print("❌ LỖI: Không tìm thấy Google Chrome hoặc Chromium trên hệ thống!")
        sys.exit(1)

    print(f"🌐 Mở giao diện game bằng {chrome_bin} trên màn hình ảo...")
    chrome_env = os.environ.copy()
    chrome_env["DISPLAY"] = ":99"
    chrome_cmd = [
        chrome_bin,
        "--no-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        f"--window-size={w},{h}",
        "--window-position=0,0",
        "--kiosk",
        "--autoplay-policy=no-user-gesture-required",
        "http://localhost:3002"
    ]
    chrome_proc = subprocess.Popen(chrome_cmd, env=chrome_env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(4)

    # 5. Khởi chạy FFmpeg đẩy luồng RTMP lên YouTube
    rtmp_url = f"rtmp://a.rtmp.youtube.com/live2/{stream_key}"
    print(f"📡 [6/6] Khởi động FFmpeg truyền luồng RTMP lên YouTube...")

    ffmpeg_cmd = [
        "ffmpeg",
        "-loglevel", "warning",
        "-f", "x11grab",
        "-video_size", f"{w}x{h}",
        "-draw_mouse", "0",
        "-i", ":99.0",
    ]

    if has_pulse:
        ffmpeg_cmd += ["-f", "pulse", "-i", "virtual_sink.monitor"]
    else:
        ffmpeg_cmd += ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100"]

    ffmpeg_cmd += [
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-tune", "zerolatency",
        "-b:v", "3000k",
        "-maxrate", "3500k",
        "-bufsize", "6000k",
        "-pix_fmt", "yuv420p",
        "-g", "60",
        "-c:a", "aac",
        "-b:a", "128k",
        "-ar", "44100",
        "-f", "flv",
        rtmp_url
    ]

    ffmpeg_log = open("/tmp/yt_ffmpeg.log", "w")
    ffmpeg_proc = subprocess.Popen(ffmpeg_cmd, stdout=ffmpeg_log, stderr=subprocess.STDOUT)

    print("\n" + "=" * 70)
    print("🎉 GAME ĐANG PHÁT TRỰC TIẾP LÊN YOUTUBE THÀNH CÔNG!")
    print("=" * 70)
    if public_url:
        print(f"👉 Link Bảng Điều Khiển MC (Mở trên điện thoại/máy tính):")
        print(f"   {public_url}/admin.html")
    else:
        print("👉 Link Bảng Điều Khiển MC: http://localhost:3002/admin.html")
    print(f"👉 Đang kết nối bình luận từ Live ID: {live_id}")
    print("=" * 70)
    print("Nhấn Ctrl + C để dừng phát sóng.\n")

    def signal_handler(sig, frame):
        print("\n🛑 Đang dừng buổi phát trực tiếp...")
        try: ffmpeg_proc.terminate()
        except: pass
        try: chrome_proc.terminate()
        except: pass
        try: server_proc.terminate()
        except: pass
        try: tunnel_proc.terminate()
        except: pass
        try: xvfb_proc.terminate()
        except: pass
        sys.exit(0)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    try:
        ffmpeg_proc.wait()
    except KeyboardInterrupt:
        signal_handler(None, None)

if __name__ == "__main__":
    main()
