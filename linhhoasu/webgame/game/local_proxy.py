# -*- coding: utf-8 -*-
"""灵画师本地代理: 静态本地 + HTTP/WS 转发远程后端
   127.0.0.1:18080 -> 静态镜像 + 转发 http://192.168.200.130:18080
   127.0.0.1:9200  -> 转发 ws://192.168.200.130:9200
"""
import asyncio, os, sys, logging
from aiohttp import web, ClientSession, WSMsgType

ROOT = os.path.dirname(os.path.abspath(__file__))
REMOTE_HTTP = "http://192.168.200.130:18080"
REMOTE_WS = "ws://192.168.200.130:9200"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger("proxy")

DROP_REQ_HEADERS = {"host", "content-length", "connection", "accept-encoding", "transfer-encoding"}
DROP_RESP_HEADERS = {"content-encoding", "content-length", "transfer-encoding", "connection", "keep-alive"}

async def proxy_http(request):
    path = request.rel_url.path
    if path == "/":
        path = "/index.html"
    local = os.path.realpath(os.path.join(ROOT, path.lstrip("/")))
    if os.path.isfile(local) and local.startswith(os.path.realpath(ROOT)):
        log.info("LOCAL  %s %s", request.method, path)
        return web.FileResponse(local)
    url = REMOTE_HTTP + path
    if request.rel_url.query_string:
        url += "?" + request.rel_url.query_string
    headers = {k: v for k, v in request.headers.items() if k.lower() not in DROP_REQ_HEADERS}
    body = await request.read()
    log.info("FWD->  %s %s", request.method, path)
    try:
        async with ClientSession() as sess:
            async with sess.request(request.method, url, headers=headers, data=body, timeout=30) as resp:
                data = await resp.read()
                out = {k: v for k, v in resp.headers.items() if k.lower() not in DROP_RESP_HEADERS}
                return web.Response(status=resp.status, body=data, headers=out)
    except Exception as e:
        log.error("FWD FAIL %s: %s", path, e)
        return web.Response(status=502, text=str(e))

async def proxy_ws(request):
    ws = web.WebSocketResponse(heartbeat=30)
    await ws.prepare(request)
    log.info("WS CONN %s", request.rel_url)
    try:
        async with ClientSession() as sess:
            async with sess.ws_connect(REMOTE_WS + str(request.rel_url), heartbeat=30) as rws:
                async def to_client():
                    async for msg in rws:
                        if msg.type == WSMsgType.TEXT:
                            await ws.send_str(msg.data)
                        elif msg.type == WSMsgType.BINARY:
                            await ws.send_bytes(msg.data)
                        elif msg.type in (WSMsgType.CLOSE, WSMsgType.CLOSED, WSMsgType.ERROR):
                            break
                async def to_server():
                    async for msg in ws:
                        if msg.type == WSMsgType.TEXT:
                            await rws.send_str(msg.data)
                        elif msg.type == WSMsgType.BINARY:
                            await rws.send_bytes(msg.data)
                        elif msg.type == WSMsgType.CLOSE:
                            await rws.close()
                            break
                await asyncio.gather(to_client(), to_server())
    except Exception as e:
        log.error("WS ERR %s", e)
    return ws

async def main():
    app_http = web.Application()
    app_http.router.add_route("*", "/{tail:.*}", proxy_http)
    app_ws = web.Application()
    app_ws.router.add_route("*", "/{tail:.*}", proxy_ws)
    r1 = web.AppRunner(app_http)
    await r1.setup()
    await web.TCPSite(r1, "127.0.0.1", 18080).start()
    r2 = web.AppRunner(app_ws)
    await r2.setup()
    await web.TCPSite(r2, "127.0.0.1", 9200).start()
    log.info("本地代理已启动: http://127.0.0.1:18080  ws://127.0.0.1:9200")
    await asyncio.Future()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
