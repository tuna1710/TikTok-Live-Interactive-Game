# -*- coding: utf-8 -*-
"""
=============================================================================
  CHÙA LINH ỨNG ONLINE - GOOGLE COLAB & TIKTOK LIVE EDITION
=============================================================================
Chạy trọn gói trong 1 Cell duy nhất trên Google Colab:
- Python FastAPI + WebSockets
- Tự động kích hoạt TikTok Live Connector (thả tim, bình luận, tặng quà)
- Giao diện 9:16 Canvas & SVG sắc nét tuyệt đối (Không lo lỗi mất ảnh/màn hình đen)
- Tích hợp bộ tổng hợp âm thanh Web Audio (tiếng chuông chùa, gõ mõ không cần tải mp3)
- Tự động tạo đường truyền Cloudflare Tunnel Public (Không cần đăng nhập, dán thẳng vào TikTok LIVE Studio)
=============================================================================
"""

import os
import sys
import json
import time
import asyncio
import subprocess
import urllib.request
from typing import Dict, Any, List

# Cài đặt tự động các thư viện cần thiết nếu chưa có
REQUIRED_PKGS = ["fastapi", "uvicorn", "websockets", "TikTokLive", "requests"]
missing = []
for pkg in REQUIRED_PKGS:
    try:
        __import__(pkg)
    except ImportError:
        missing.append(pkg)

if missing:
    print(f"📦 Đang cài đặt thư viện bổ trợ: {', '.join(missing)}...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "--quiet"] + missing)

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
import uvicorn

app = FastAPI(title="Chùa Online Live Stream")

# State lưu trữ phiên làm việc
state = {
    "live_user": "@chua_linh_ung",
    "connected": False,
    "total_merit": 1080,
    "total_incense": 36,
    "wooden_fish_count": 128,
    "leaderboard": [
        {"name": "Quỳnh_Finn", "merit": 14950},
        {"name": "Minh Tâm", "merit": 2860},
        {"name": "Diệu Hạnh", "merit": 1420},
        {"name": "Tuệ Lâm", "merit": 850},
        {"name": "Thiện Duyên", "merit": 520}
    ]
}

clients: List[WebSocket] = []

async def broadcast(event_type: str, data: Dict[str, Any]):
    msg = json.dumps({"type": event_type, "data": data})
    for ws in list(clients):
        try:
            await ws.send_text(msg)
        except Exception:
            if ws in clients:
                clients.remove(ws)

def add_merit(name: str, points: int):
    for item in state["leaderboard"]:
        if item["name"].lower() == name.lower():
            item["merit"] += points
            state["leaderboard"].sort(key=lambda x: x["merit"], reverse=True)
            return
    state["leaderboard"].append({"name": name, "merit": points})
    state["leaderboard"].sort(key=lambda x: x["merit"], reverse=True)
    state["leaderboard"] = state["leaderboard"][:6]

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    clients.append(websocket)
    await websocket.send_text(json.dumps({"type": "init", "data": state}))
    try:
        while True:
            text = await websocket.receive_text()
            data = json.loads(text)
            action = data.get("action")
            user = data.get("user", "Thí Chủ")
            wish = data.get("wish", "Cầu gia đạo bình an, phúc lộc thọ khang ninh")

            if action == "incense":
                state["total_incense"] += 1
                state["total_merit"] += 15
                add_merit(user, 15)
                await broadcast("incense", {"user": user, "wish": wish, "state": state})

            elif action == "wooden_fish":
                state["wooden_fish_count"] += 1
                state["total_merit"] += 1
                await broadcast("wooden_fish", {"user": user, "state": state})

            elif action == "bell":
                state["total_merit"] += 10
                await broadcast("bell", {"user": user, "state": state})

            elif action == "gift":
                gift_name = data.get("gift_name", "Hoa Sen Vàng")
                coins = int(data.get("coins", 10))
                earned = coins * 10
                state["total_merit"] += earned
                add_merit(user, earned)
                await broadcast("gift", {"user": user, "gift": gift_name, "coins": coins, "state": state})

            elif action == "connect_tiktok":
                target = data.get("username", "").strip()
                if target:
                    state["live_user"] = target
                    asyncio.create_task(run_tiktok(target))

    except WebSocketDisconnect:
        if websocket in clients:
            clients.remove(websocket)

async def run_tiktok(username: str):
    clean = username.replace("@", "").strip()
    try:
        from TikTokLive import TikTokLiveClient
        from TikTokLive.events import ConnectEvent, CommentEvent, LikeEvent, GiftEvent
        client = TikTokLiveClient(unique_id=f"@{clean}")

        @client.on(ConnectEvent)
        async def on_connect(event: ConnectEvent):
            state["connected"] = True
            await broadcast("system", {"msg": f"Đã kết nối TikTok Live: @{clean}", "state": state})

        @client.on(LikeEvent)
        async def on_like(event: LikeEvent):
            state["wooden_fish_count"] += 1
            state["total_merit"] += 1
            await broadcast("wooden_fish", {"user": event.user.nickname, "state": state})

        @client.on(CommentEvent)
        async def on_cmt(event: CommentEvent):
            cmt = event.comment.lower()
            name = event.user.nickname or "Thí Chủ"
            if any(k in cmt for k in ["hương", "nhang", "lạy", "bái", "nam mô", "a di đà", "cầu", "bình an"]):
                state["total_incense"] += 1
                state["total_merit"] += 15
                add_merit(name, 15)
                await broadcast("incense", {"user": name, "wish": event.comment, "state": state})

        @client.on(GiftEvent)
        async def on_gift(event: GiftEvent):
            if event.gift.streakable and not event.gift.streaking:
                return
            coins = event.gift.diamond_count or 1
            name = event.user.nickname or "Thí Chủ"
            earned = coins * 10
            state["total_merit"] += earned
            add_merit(name, earned)
            await broadcast("gift", {"user": name, "gift": event.gift.name, "coins": coins, "state": state})

        await client.start()
    except Exception as e:
        state["connected"] = False
        await broadcast("system", {"msg": f"Lỗi TikTok: {e}", "state": state})

INDEX_HTML = """<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Chùa Linh Ứng Online — TikTok Live</title>
  <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;600;700;800&family=Noto+Serif:wght@700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0d0202;
      color: #fffaf0;
      font-family: 'Be Vietnam Pro', sans-serif;
      overflow: hidden;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
    }
    body.obs-mode {
      background: transparent;
    }
    .app-container {
      display: flex;
      gap: 20px;
      height: 98vh;
      align-items: center;
    }
    body.obs-mode .app-container {
      gap: 0;
      height: 100vh;
    }
    body.obs-mode .control-panel {
      display: none !important;
    }
    /* Khung 9:16 Chuẩn Livestream */
    .stage-wrapper {
      position: relative;
      height: 98vh;
      aspect-ratio: 9 / 16;
      border-radius: 18px;
      overflow: hidden;
      border: 2px solid #e5a93c;
      box-shadow: 0 0 35px rgba(229, 169, 60, 0.35);
      background: radial-gradient(circle at 50% 25%, #420d08 0%, #170302 70%, #080101 100%);
    }
    body.obs-mode .stage-wrapper {
      height: 100vh;
      border-radius: 0;
      border: none;
      box-shadow: none;
    }
    .stage-canvas {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      z-index: 2;
      pointer-events: none;
    }
    /* Đức Phật SVG Sắc Nét */
    .buddha-svg-wrap {
      position: absolute;
      top: 3%;
      left: 50%;
      transform: translateX(-50%);
      width: 68%;
      height: 48%;
      z-index: 1;
      display: flex;
      justify-content: center;
      align-items: center;
    }
    .halo-wheel {
      position: absolute;
      width: 320px;
      height: 320px;
      border-radius: 50%;
      background: repeating-conic-gradient(from 0deg, rgba(255, 230, 140, 0.45) 0deg 8deg, rgba(255, 175, 40, 0.05) 8deg 18deg);
      animation: spinHalo 45s linear infinite;
      z-index: 0;
      opacity: 0.85;
    }
    @keyframes spinHalo {
      100% { transform: rotate(360deg); }
    }
    .buddha-svg {
      position: relative;
      z-index: 1;
      width: 100%;
      height: 100%;
      filter: drop-shadow(0 0 25px rgba(255, 215, 0, 0.7));
    }
    /* Thanh trạng thái đỉnh */
    .top-bar {
      position: absolute;
      top: 14px;
      left: 14px;
      right: 14px;
      z-index: 10;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .pill {
      background: rgba(18, 4, 3, 0.88);
      border: 1px solid #e5a93c;
      padding: 6px 14px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 7px;
    }
    .live-dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: #ff334b;
    }
    .live-dot.connected {
      background: #25d366;
      box-shadow: 0 0 8px #25d366;
    }
    /* Bàn Thờ & Lư Hương */
    .altar-table {
      position: absolute;
      bottom: 180px;
      left: 50%;
      transform: translateX(-50%);
      width: 82%;
      height: 95px;
      background: linear-gradient(180deg, #7a1c12 0%, #3f0b07 100%);
      border-top: 3px solid #ffcc66;
      border-radius: 8px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.8);
      z-index: 4;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .incense-burner {
      position: absolute;
      top: -26px;
      width: 75px;
      height: 38px;
      background: radial-gradient(circle at 50% 30%, #ffd700 0%, #b8860b 80%);
      border-radius: 0 0 35px 35px;
      box-shadow: 0 4px 15px rgba(255, 215, 0, 0.6);
      display: flex;
      justify-content: center;
    }
    .sticks {
      position: absolute;
      bottom: 22px;
      display: flex;
      gap: 5px;
    }
    .stick {
      width: 3px;
      height: 52px;
      background: #c2410c;
      border-radius: 2px;
      position: relative;
    }
    .stick::after {
      content: '';
      position: absolute;
      top: -3px;
      left: -1px;
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: #ff4500;
      box-shadow: 0 0 8px #ff4500;
    }
    /* Nút tương tác trên bàn thờ */
    .hotspots {
      position: absolute;
      top: 24px;
      display: flex;
      gap: 12px;
    }
    .hot-btn {
      background: rgba(26, 6, 4, 0.9);
      border: 1px solid #ffd700;
      color: #ffd700;
      border-radius: 20px;
      padding: 4px 10px;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
    }
    /* Khách Lễ Quỳ Dâng Hương */
    .worshipper-layer {
      position: absolute;
      bottom: 240px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 5;
      display: flex;
      flex-direction: column;
      align-items: center;
      transition: all 0.5s ease;
      opacity: 0;
      pointer-events: none;
    }
    .worshipper-layer.active {
      opacity: 1;
    }
    .bubble {
      background: rgba(20, 5, 4, 0.92);
      border: 1.5px solid #ffd700;
      color: #ffe8a3;
      padding: 6px 14px;
      border-radius: 14px;
      font-size: 13px;
      margin-bottom: 6px;
      max-width: 280px;
      text-align: center;
      animation: floatMsg 2s ease-in-out infinite alternate;
    }
    @keyframes floatMsg {
      from { transform: translateY(0); }
      to { transform: translateY(-4px); }
    }
    .devotee-avatar {
      font-size: 55px;
      filter: drop-shadow(0 4px 10px rgba(0,0,0,0.8));
    }
    /* Bảng Vàng & Đáy HUD */
    .bottom-hud {
      position: absolute;
      bottom: 12px;
      left: 12px;
      right: 12px;
      height: 155px;
      display: flex;
      gap: 10px;
      z-index: 10;
    }
    .hud-box {
      background: rgba(20, 5, 4, 0.94);
      border: 1px solid rgba(229, 169, 60, 0.65);
      border-radius: 12px;
      padding: 10px;
      flex: 1;
    }
    .hud-box.leaderboard {
      flex: 0.9;
    }
    .box-title {
      color: #ffd700;
      font-size: 11.5px;
      font-weight: 800;
      letter-spacing: 0.8px;
      margin-bottom: 6px;
      text-align: center;
    }
    .lb-row {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      padding: 2.5px 0;
      border-bottom: 1px dashed rgba(255, 215, 0, 0.15);
    }
    .lb-row strong { color: #ffd700; }
    /* Đèn Hoa Đăng bay lên */
    .lantern {
      position: absolute;
      bottom: 220px;
      background: rgba(140, 24, 18, 0.94);
      border: 1.5px solid #ffd700;
      border-radius: 12px;
      padding: 8px 12px;
      color: #fff;
      font-size: 12px;
      animation: floatUp 8s linear forwards;
      z-index: 8;
      pointer-events: none;
    }
    @keyframes floatUp {
      0% { transform: translateY(0) scale(0.9); opacity: 0; }
      10% { opacity: 1; }
      90% { opacity: 0.9; }
      100% { transform: translateY(-700px) scale(0.7); opacity: 0; }
    }
    /* Bảng Điều Khiển Bên Phải */
    .control-panel {
      width: 360px;
      height: 98vh;
      background: #180504;
      border: 1px solid #e5a93c;
      border-radius: 16px;
      padding: 18px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      overflow-y: auto;
    }
    .c-title {
      font-size: 17px;
      font-weight: 800;
      color: #ffd700;
      border-bottom: 1px solid rgba(229, 169, 60, 0.3);
      padding-bottom: 6px;
    }
    .c-input {
      width: 100%;
      background: #0d0202;
      border: 1px solid #e5a93c;
      color: #fff;
      padding: 9px 12px;
      border-radius: 8px;
      font-size: 13.5px;
    }
    .btn {
      background: linear-gradient(180deg, #c48312 0%, #7a4e04 100%);
      color: #fff;
      border: 1px solid #ffe8a3;
      padding: 10px 14px;
      border-radius: 8px;
      font-weight: 700;
      cursor: pointer;
      font-size: 13.5px;
      transition: all 0.2s;
    }
    .btn:hover {
      filter: brightness(1.2);
    }
    .btn.primary {
      background: linear-gradient(180deg, #b91c1c 0%, #7f1d1d 100%);
    }
    .grid-btns {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .log-feed {
      flex: 1;
      background: #0d0202;
      border: 1px solid rgba(229, 169, 60, 0.25);
      border-radius: 8px;
      padding: 10px;
      font-size: 12px;
      overflow-y: auto;
      max-height: 220px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .log-item {
      padding: 4px 8px;
      border-left: 2px solid #ffd700;
      background: rgba(255,255,255,0.03);
    }
  </style>
</head>
<body>
  <div class="app-container">
    <!-- Khung Live Chánh Điện 9:16 -->
    <div class="stage-wrapper" id="stage">
      <canvas class="stage-canvas" id="canvas"></canvas>

      <!-- Thanh trạng thái đỉnh -->
      <div class="top-bar">
        <div class="pill">
          <div class="live-dot" id="liveDot"></div>
          <span id="liveUserText">CHÙA LINH ỨNG ONLINE</span>
        </div>
        <div class="pill">
          🔥 <strong id="statIncense">36</strong> • ✨ <strong id="statMerit">1,080</strong> CĐ
        </div>
      </div>

      <!-- Tượng Phật & Hào Quang SVG (Không bao giờ lỗi ảnh) -->
      <div class="buddha-svg-wrap">
        <div class="halo-wheel"></div>
        <svg class="buddha-svg" viewBox="0 0 240 280">
          <defs>
            <radialGradient id="goldShine" cx="50%" cy="40%" r="60%">
              <stop offset="0%" stop-color="#fff4b8" />
              <stop offset="50%" stop-color="#f59e0b" />
              <stop offset="100%" stop-color="#b45309" />
            </radialGradient>
            <linearGradient id="robeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#f59e0b" />
              <stop offset="100%" stop-color="#991b1b" />
            </linearGradient>
          </defs>
          <!-- Đài Sen -->
          <g fill="#f59e0b" stroke="#78350f" stroke-width="2">
            <path d="M 60 240 Q 120 270 180 240 Q 160 220 120 225 Q 80 220 60 240 Z" />
            <path d="M 40 245 Q 120 285 200 245 Q 170 230 120 235 Q 70 230 40 245 Z" fill="#d97706" />
          </g>
          <!-- Thân & Cà Sa -->
          <path d="M 65 230 Q 80 140 120 135 Q 160 140 175 230 Z" fill="url(#robeGrad)" />
          <!-- Cổ & Khuôn Mặt Từ Bi -->
          <circle cx="120" cy="100" r="34" fill="url(#goldShine)" />
          <path d="M 120 62 Q 134 50 120 45 Q 106 50 120 62 Z" fill="#b45309" />
          <!-- Tóc Búi Nhục Kế -->
          <ellipse cx="120" cy="68" rx="28" ry="12" fill="#78350f" />
          <!-- Đôi Mắt Khép Hờ Thiền Định -->
          <path d="M 106 100 Q 112 103 117 100" stroke="#78350f" stroke-width="2" fill="none" stroke-linecap="round" />
          <path d="M 123 100 Q 128 103 134 100" stroke="#78350f" stroke-width="2" fill="none" stroke-linecap="round" />
          <!-- Nụ Cười An Lạc -->
          <path d="M 115 116 Q 120 120 125 116" stroke="#991b1b" stroke-width="2" fill="none" stroke-linecap="round" />
          <!-- Bạch Hào Giữa Trán -->
          <circle cx="120" cy="90" r="3" fill="#ffffff" />
          <!-- Bàn Tay Kết Ấn Thiền Định -->
          <ellipse cx="120" cy="200" rx="20" ry="10" fill="url(#goldShine)" />
        </svg>
      </div>

      <!-- Bàn Thờ & Lư Hương -->
      <div class="altar-table">
        <div class="incense-burner">
          <div class="sticks">
            <div class="stick"></div>
            <div class="stick" style="height: 58px;"></div>
            <div class="stick"></div>
          </div>
        </div>
        <div class="hotspots">
          <button class="hot-btn" onclick="triggerWoodenFish()">🪵 Gõ Mõ</button>
          <button class="hot-btn" onclick="triggerBell()">🔔 Thỉnh Chuông</button>
          <button class="hot-btn" onclick="triggerIncense()">🔥 Dâng Hương</button>
        </div>
      </div>

      <!-- Khách Quỳ Lễ & Lời Cầu Nguyện -->
      <div class="worshipper-layer" id="worshipper">
        <div class="bubble" id="worshipperWish">“Cầu gia đình bình an, vạn sự cát tường”</div>
        <div class="devotee-avatar">🙏</div>
        <div class="pill" style="font-size: 11px; padding: 3px 10px;" id="worshipperName">Minh Tâm</div>
      </div>

      <!-- Vùng Đèn Hoa Đăng -->
      <div id="lanternsArea"></div>

      <!-- Đáy HUD & Bảng Vàng Công Đức -->
      <div class="bottom-hud">
        <div class="hud-box">
          <div class="box-title">HƯỚNG DẪN TƯƠNG TÁC</div>
          <div style="font-size: 11px; line-height: 1.6; color: #ffe8a3;">
            • <strong>Thả tim:</strong> Gõ mõ tích công đức<br>
            • <strong>Bình luận:</strong> Thắp hương & cầu an<br>
            • <strong>Tặng quà:</strong> Sen vàng nở & Vinh danh
          </div>
        </div>
        <div class="hud-box leaderboard">
          <div class="box-title">🏆 TẤM LÒNG THÀNH</div>
          <div id="lbList"></div>
        </div>
      </div>
    </div>

    <!-- Bảng Điều Khiển Live Nhanh (Ẩn khi gắn vào OBS) -->
    <div class="control-panel">
      <div class="c-title">📡 Kết Nối TikTok Live</div>
      <div style="display: flex; gap: 8px;">
        <input class="c-input" id="inUser" placeholder="Nhập @username TikTok..." value="@zenfacts_vn" />
        <button class="btn" onclick="connectTikTok()">Kết Nối</button>
      </div>

      <div class="c-title" style="margin-top: 10px;">🙏 Kích Hoạt Nghi Thức (Test)</div>
      <input class="c-input" id="inTestUser" placeholder="Tên thí chủ..." value="Quỳnh_Finn" />
      <input class="c-input" id="inTestWish" placeholder="Lời cầu khấn..." value="Cầu công việc thuận lợi, sức khỏe dồi dào" />
      <div class="grid-btns">
        <button class="btn" onclick="sendRpc('incense')">🔥 Thắp Hương</button>
        <button class="btn" onclick="sendRpc('wooden_fish')">🪵 Gõ Mõ (+1)</button>
        <button class="btn" onclick="sendRpc('bell')">🔔 Thỉnh Chuông</button>
        <button class="btn" onclick="sendRpc('gift')">🪷 Tặng Quà Sen</button>
      </div>

      <div class="c-title" style="margin-top: 10px;">📜 Nhật Ký Hoạt Động</div>
      <div class="log-feed" id="logFeed"></div>
    </div>
  </div>

  <script>
    // Kiểm tra chế độ OBS Mode
    if (new URLSearchParams(window.location.search).get('obs') === '1') {
      document.body.classList.add('obs-mode');
    }

    // Bộ Tổng Hợp Âm Thanh Web Audio (Không cần file mp3 ngoài)
    const AudioEngine = {
      ctx: null,
      init() {
        if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      },
      playWoodenFish() {
        this.init();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(480, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(120, this.ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.8, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.09);
      },
      playBell() {
        this.init();
        const freqs = [320, 480, 640];
        freqs.forEach(f => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(f, this.ctx.currentTime);
          gain.gain.setValueAtTime(0.35, this.ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 3.5);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start();
          osc.stop(this.ctx.currentTime + 3.6);
        });
      }
    };

    // Canvas Hạt Vàng & Cánh Hoa Sen Rơi
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    let W, H;
    function resize() {
      W = canvas.width = canvas.offsetWidth;
      H = canvas.height = canvas.offsetHeight;
    }
    window.addEventListener('resize', resize);
    resize();

    const particles = [];
    for (let i = 0; i < 40; i++) {
      particles.push({
        x: Math.random() * 400,
        y: Math.random() * 700,
        vx: Math.random() * 0.8 - 0.4,
        vy: 0.6 + Math.random() * 1.2,
        size: 2 + Math.random() * 4,
        type: Math.random() > 0.4 ? 'petal' : 'gold'
      });
    }

    function render() {
      ctx.clearRect(0, 0, W, H);
      particles.forEach(p => {
        p.y += p.vy;
        p.x += p.vx;
        if (p.y > H + 10) { p.y = -10; p.x = Math.random() * W; }
        if (p.type === 'petal') {
          ctx.fillStyle = 'rgba(255, 182, 193, 0.75)';
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, p.size * 1.5, p.size, Math.PI / 4, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = 'rgba(255, 215, 0, 0.8)';
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 0.6, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      requestAnimationFrame(render);
    }
    render();

    // WebSocket Kết Nối Với Python Backend
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/ws`);

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'init' || msg.data?.state) {
        updateUI(msg.data.state || msg.data);
      }
      if (msg.type === 'wooden_fish') {
        AudioEngine.playWoodenFish();
        addLog(`🪵 ${msg.data.user} gõ mõ (+1 CĐ)`);
      } else if (msg.type === 'bell') {
        AudioEngine.playBell();
        addLog(`🔔 ${msg.data.user} thỉnh Đại Hồng Chung`);
      } else if (msg.type === 'incense') {
        showWorshipper(msg.data.user, msg.data.wish);
        AudioEngine.playBell();
        addLog(`🔥 ${msg.data.user} thắp hương dâng Phật`);
      } else if (msg.type === 'gift') {
        spawnLantern(msg.data.user, `Dâng ${msg.data.gift} (+${msg.data.coins * 10} CĐ)`);
        AudioEngine.playBell();
        addLog(`🪷 ${msg.data.user} tặng ${msg.data.gift}`);
      } else if (msg.type === 'system') {
        addLog(`ℹ️ ${msg.data.msg}`);
      }
    };

    function updateUI(s) {
      if (!s) return;
      document.getElementById('statIncense').innerText = s.total_incense;
      document.getElementById('statMerit').innerText = s.total_merit.toLocaleString('vi-VN');
      const dot = document.getElementById('liveDot');
      if (s.connected) {
        dot.classList.add('connected');
        document.getElementById('liveUserText').innerText = `LIVE @${s.live_user.replace('@','')}`;
      }
      const lb = document.getElementById('lbList');
      if (s.leaderboard) {
        lb.innerHTML = s.leaderboard.slice(0, 5).map((u, i) => `
          <div class="lb-row">
            <span>${i + 1}. ${u.name}</span>
            <strong>+${u.merit}</strong>
          </div>
        `).join('');
      }
    }

    function showWorshipper(name, wish) {
      const w = document.getElementById('worshipper');
      document.getElementById('worshipperName').innerText = name;
      document.getElementById('worshipperWish').innerText = `“${wish}”`;
      w.classList.add('active');
      setTimeout(() => w.classList.remove('active'), 5500);
    }

    function spawnLantern(user, text) {
      const el = document.createElement('div');
      el.className = 'lantern';
      el.style.left = (15 + Math.random() * 60) + '%';
      el.innerHTML = `🏮 <strong>${user}</strong><br>${text}`;
      document.getElementById('lanternsArea').appendChild(el);
      setTimeout(() => el.remove(), 8000);
    }

    function addLog(text) {
      const feed = document.getElementById('logFeed');
      if (!feed) return;
      const d = document.createElement('div');
      d.className = 'log-item';
      d.innerText = text;
      feed.prepend(d);
    }

    function sendRpc(action) {
      AudioEngine.init();
      const user = document.getElementById('inTestUser').value;
      const wish = document.getElementById('inTestWish').value;
      ws.send(JSON.stringify({ action, user, wish, coins: 10, gift_name: 'Hoa Sen Vàng' }));
    }

    function triggerWoodenFish() { AudioEngine.init(); ws.send(JSON.stringify({ action: 'wooden_fish' })); }
    function triggerBell() { AudioEngine.init(); ws.send(JSON.stringify({ action: 'bell' })); }
    function triggerIncense() { AudioEngine.init(); ws.send(JSON.stringify({ action: 'incense', user: 'Thí Chủ', wish: 'Cầu quốc thái dân an' })); }

    function connectTikTok() {
      const username = document.getElementById('inUser').value;
      ws.send(JSON.stringify({ action: 'connect_tiktok', username }));
      addLog(`📡 Đang kết nối TikTok Live: ${username}...`);
    }

    // Kích hoạt Audio Context khi nhấp chuột lần đầu
    window.addEventListener('click', () => AudioEngine.init(), { once: true });
  </script>
</body>
</html>
"""

@app.get("/")
def get_index():
    return HTMLResponse(content=INDEX_HTML)

def run_server():
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="warning")

def start_cloudflare_tunnel():
    """Tải và khởi chạy Cloudflare Tunnel để tạo link Public 100% không cần login"""
    bin_path = "/tmp/cloudflared"
    if not os.path.exists(bin_path):
        print("📥 Đang tải Cloudflare Tunnel...")
        url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"
        urllib.request.urlretrieve(url, bin_path)
        os.chmod(bin_path, 0o755)

    print("🌐 Đang khởi tạo đường hầm Public...")
    log_file = open("/tmp/tunnel.log", "w")
    proc = subprocess.Popen([bin_path, "tunnel", "--url", "http://127.0.0.1:8000"], stdout=log_file, stderr=log_file)
    time.sleep(3)

    # Đọc link từ log
    public_url = None
    for _ in range(15):
        if os.path.exists("/tmp/tunnel.log"):
            with open("/tmp/tunnel.log") as f:
                content = f.read()
                for line in content.splitlines():
                    if "trycloudflare.com" in line:
                        for word in line.split():
                            if "trycloudflare.com" in word:
                                public_url = word.strip().rstrip("/")
                                break
        if public_url:
            break
        time.sleep(1)

    return public_url

if __name__ == "__main__":
    import threading
    t = threading.Thread(target=run_server, daemon=True)
    t.start()
    time.sleep(2)

    tunnel_url = start_cloudflare_tunnel()
    print("\n" + "="*70)
    print("🎉 CHÙA LINH ỨNG ONLINE ĐÃ KHỞI CHẠY THÀNH CÔNG TRÊN COLAB!")
    print("="*70)
    if tunnel_url:
        print(f"\n👉 [1] Link Điều Khiển & Xem Thử Trực Tiếp:")
        print(f"       {tunnel_url}")
        print(f"\n👉 [2] Link Dán Vào TikTok LIVE Studio / OBS (Khung 9:16 sạch):")
        print(f"       {tunnel_url}/?obs=1")
    else:
        print("Link cục bộ: http://127.0.0.1:8000")
    print("="*70 + "\n")

    # Giữ tiến trình sống
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass
