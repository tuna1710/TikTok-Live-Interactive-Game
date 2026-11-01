# -*- coding: utf-8 -*-
"""
TikTok Live Relay Worker (Python) for "Vua Tiếng Việt"
Uses TikTokLive Python v7.x to stream events (chat, gifts, likes) to Node.js server.
Bypasses dead Node signature servers and supports instant auto-reconnect.
"""

import sys
import os
import asyncio
import json
import logging
import threading
import http.server
from typing import Optional
import httpx

from TikTokLive import TikTokLiveClient
from TikTokLive.events import (
    ConnectEvent,
    CommentEvent,
    GiftEvent,
    LikeEvent,
    LiveEndEvent,
    DisconnectEvent
)
from TikTokLive.client.errors import (
    UserOfflineError,
    UserNotFoundError,
    InitialCursorMissingError
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("TikTokRelay")

TARGET_PORT = int(os.environ.get("PORT") or os.environ.get("TARGET_PORT") or "3002")
CONTROL_PORT = int(os.environ.get("CONTROL_PORT") or "3003")
INITIAL_CHANNEL = (os.environ.get("TIKTOK_USERNAME") or "@2166541467").strip()


class TikTokRelay:
    def __init__(self, target_port: int, control_port: int, initial_channel: str):
        self.target_url = f"http://127.0.0.1:{target_port}/api/tiktok-event"
        self.control_port = control_port
        self.channel = initial_channel.replace("@", "").strip()
        self.target_channel = self.channel
        self.client: Optional[TikTokLiveClient] = None
        self.stop_event: Optional[asyncio.Event] = None
        self.loop: Optional[asyncio.AbstractEventLoop] = None
        self.http_client = httpx.AsyncClient(timeout=4.0)

    async def post_event(self, payload: dict):
        """Sends an event payload to Node.js server via HTTP POST."""
        try:
            await self.http_client.post(self.target_url, json=payload)
        except Exception as e:
            logger.debug(f"Failed to post event to {self.target_url}: {e}")

    def request_channel_switch(self, new_channel: str):
        """Called from HTTP control server when streamer changes channel."""
        clean = new_channel.replace("@", "").strip()
        if not clean:
            return
        logger.info(f"Yêu cầu đổi kênh TikTok sang: @{clean}")
        self.target_channel = clean
        if self.loop and self.stop_event:
            self.loop.call_soon_threadsafe(self.stop_event.set)

    def start_control_server(self):
        """Runs a tiny local HTTP server on CONTROL_PORT to handle /switch_channel."""
        relay_self = self

        class ControlHandler(http.server.BaseHTTPRequestHandler):
            def do_POST(self):
                if self.path == "/switch_channel":
                    try:
                        content_len = int(self.headers.get("Content-Length", 0))
                        body_bytes = self.rfile.read(content_len)
                        body = json.loads(body_bytes.decode("utf-8"))
                        channel = body.get("channel", "")
                        if channel:
                            relay_self.request_channel_switch(channel)
                            self.send_response(200)
                            self.send_header("Content-Type", "application/json")
                            self.end_headers()
                            self.wfile.write(json.dumps({"ok": True, "channel": relay_self.target_channel}).encode("utf-8"))
                            return
                    except Exception as err:
                        logger.error(f"Error handling switch_channel: {err}")
                self.send_response(400)
                self.end_headers()

            def do_GET(self):
                if self.path == "/health":
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.end_headers()
                    is_conn = bool(relay_self.client and relay_self.client.connected)
                    self.wfile.write(json.dumps({
                        "ok": True,
                        "channel": f"@{relay_self.channel}",
                        "connected": is_conn
                    }).encode("utf-8"))
                    return
                self.send_response(404)
                self.end_headers()

            def log_message(self, format, *args):
                pass  # suppress HTTP access logs to keep terminal tidy

        try:
            server = http.server.ThreadingHTTPServer(("127.0.0.1", self.control_port), ControlHandler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            logger.info(f"🛰️ TikTok Relay Control Server đang lắng nghe tại 127.0.0.1:{self.control_port}")
        except Exception as e:
            logger.warn(f"Không thể mở cổng Control Server {self.control_port}: {e}")

    async def run(self):
        self.loop = asyncio.get_running_loop()
        self.stop_event = asyncio.Event()
        self.start_control_server()

        logger.info(f"👑 TikTok Live Relay khởi động. Kênh ban đầu: @{self.channel}")

        while True:
            self.channel = self.target_channel
            self.stop_event.clear()

            if not self.channel:
                await asyncio.sleep(2)
                continue

            logger.info(f"🔄 Đang kết nối tới TikTok Live: @{self.channel}...")
            await self.post_event({
                "type": "status",
                "connecting": True,
                "connected": False,
                "channel": f"@{self.channel}",
                "msg": f"Đang kết nối tới Live @{self.channel}..."
            })

            client = TikTokLiveClient(unique_id=self.channel)
            self.client = client

            @client.on(ConnectEvent)
            async def on_connect(event: ConnectEvent):
                room_id = str(client.room_id or "")
                logger.info(f"✅ ĐÃ KẾT NỐI Live @{self.channel} (Room ID: {room_id})! Đang nhận bình luận...")
                await self.post_event({
                    "type": "status",
                    "connecting": False,
                    "connected": True,
                    "channel": f"@{self.channel}",
                    "roomId": room_id,
                    "msg": f"Đã kết nối Live @{self.channel} (Phòng: {room_id})"
                })

            @client.on(CommentEvent)
            async def on_comment(event: CommentEvent):
                avatar_url = ""
                try:
                    if event.user and event.user.avatar_thumb and event.user.avatar_thumb.url_list:
                        avatar_url = event.user.avatar_thumb.url_list[0]
                except Exception:
                    pass

                uid = (event.user.unique_id if event.user else None) or (event.user.display_id if event.user else None) or "anon"
                nick = (event.user.nickname if event.user else None) or uid
                comment = event.comment or event.content or ""

                logger.info(f"💬 [Bình luận] {nick} (@{uid}): {comment}")
                await self.post_event({
                    "type": "chat",
                    "user": {
                        "uniqueId": uid,
                        "nickname": nick,
                        "avatar": avatar_url
                    },
                    "comment": comment
                })

            @client.on(GiftEvent)
            async def on_gift(event: GiftEvent):
                avatar_url = ""
                try:
                    if event.user and event.user.avatar_thumb and event.user.avatar_thumb.url_list:
                        avatar_url = event.user.avatar_thumb.url_list[0]
                except Exception:
                    pass

                uid = (event.user.unique_id if event.user else None) or (event.user.display_id if event.user else None) or "fan"
                nick = (event.user.nickname if event.user else None) or uid
                gift_name = event.gift.name if event.gift else "Quà"
                repeat = getattr(event, "repeat_count", 1) or 1
                diamond = getattr(event.gift, "diamond_count", 1) if event.gift else 1
                total_diamonds = diamond * repeat

                logger.info(f"🎁 [Quà tặng] {nick} gửi {gift_name} x{repeat} ({total_diamonds} xu)")
                await self.post_event({
                    "type": "gift",
                    "user": {
                        "uniqueId": uid,
                        "nickname": nick,
                        "avatar": avatar_url
                    },
                    "giftName": gift_name,
                    "diamondCount": total_diamonds,
                    "repeatCount": repeat
                })

            @client.on(LikeEvent)
            async def on_like(event: LikeEvent):
                count = getattr(event, "count", 1) or 1
                total = getattr(event, "total", 0) or 0
                await self.post_event({
                    "type": "like",
                    "count": count,
                    "totalLikes": total
                })

            @client.on(LiveEndEvent)
            async def on_live_end(event: LiveEndEvent):
                logger.info(f"⏹️ Phòng Live @{self.channel} đã kết thúc.")
                await self.post_event({
                    "type": "status",
                    "connecting": False,
                    "connected": False,
                    "channel": f"@{self.channel}",
                    "msg": f"Phòng Live @{self.channel} đã kết thúc. Đang chờ phiên phát tiếp theo..."
                })

            try:
                start_task = asyncio.create_task(client.start())
                stop_task = asyncio.create_task(self.stop_event.wait())

                done, pending = await asyncio.wait(
                    [start_task, stop_task],
                    return_when=asyncio.FIRST_COMPLETED
                )

                for p in pending:
                    p.cancel()

                if self.stop_event.is_set():
                    logger.info(f"Streamer chuyển kênh sang: @{self.target_channel}")
                    try:
                        await client.disconnect()
                    except Exception:
                        pass
                    continue

                if start_task in done:
                    exc = start_task.exception()
                    if exc:
                        raise exc

            except UserOfflineError:
                logger.info(f"⚠️ Kênh @{self.channel} hiện chưa lên sóng Live. Tự động kiểm tra lại sau 5s...")
                await self.post_event({
                    "type": "status",
                    "connecting": False,
                    "connected": False,
                    "channel": f"@{self.channel}",
                    "msg": f"Kênh @{self.channel} chưa lên sóng Live. Đang tự động dò tìm lại..."
                })
                try:
                    await asyncio.wait_for(self.stop_event.wait(), timeout=5.0)
                except asyncio.TimeoutError:
                    pass

            except UserNotFoundError:
                logger.warning(f"❌ Không tìm thấy kênh @{self.channel} trên TikTok. Hãy kiểm tra tên kênh!")
                await self.post_event({
                    "type": "status",
                    "connecting": False,
                    "connected": False,
                    "channel": f"@{self.channel}",
                    "msg": f"Không tìm thấy kênh @{self.channel}. Kiểm tra lại tên kênh trong Admin!"
                })
                try:
                    await asyncio.wait_for(self.stop_event.wait(), timeout=8.0)
                except asyncio.TimeoutError:
                    pass

            except Exception as e:
                err_msg = str(e) or type(e).__name__
                logger.warning(f"⚠️ Lỗi kết nối TikTok @{self.channel}: {err_msg}. Tự động thử lại sau 5s...")
                await self.post_event({
                    "type": "status",
                    "connecting": False,
                    "connected": False,
                    "channel": f"@{self.channel}",
                    "msg": f"Đang kết nối lại @{self.channel} ({err_msg})..."
                })
                try:
                    await asyncio.wait_for(self.stop_event.wait(), timeout=5.0)
                except asyncio.TimeoutError:
                    pass


if __name__ == "__main__":
    relay = TikTokRelay(TARGET_PORT, CONTROL_PORT, INITIAL_CHANNEL)
    try:
        asyncio.run(relay.run())
    except KeyboardInterrupt:
        logger.info("TikTok Relay đã dừng theo lệnh của người dùng.")
