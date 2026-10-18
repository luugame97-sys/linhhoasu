import subprocess
import json

tests = [
    ("Apex HTTPS Root Game", "https://linhhoasu.lol/"),
    ("Main JS bundle", "https://linhhoasu.lol/js/main.min_drop100.js"),
    ("WebGM Login HTTPS", "https://linhhoasu.lol/web-panel/"),
    ("WebGM Login CSS", "https://linhhoasu.lol/web-panel/assets/css/login.css"),
    ("Direct IP:81 Game", "http://103.116.104.165:81/"),
    ("Direct IP:81 WebGM", "http://103.116.104.165:81/web-panel/"),
]

print("=== Running HTTP / HTTPS Verification ===")
for name, url in tests:
    cmd = ["curl.exe", "-s", "-I", "-L", "--max-time", "5", url]
    res = subprocess.run(cmd, capture_output=True, text=True)
    first_line = [l for l in res.stdout.splitlines() if l.startswith("HTTP/")][-1:]
    status = first_line[0] if first_line else "NO_RESPONSE"
    print(f"[{'PASS' if '200' in status or '302' in status else 'FAIL'}] {name}: {status} ({url})")

print("\n=== Running WebSocket WSS Verification ===")
for sid, path in [("S1001", "/ws"), ("S1002", "/ws-s2"), ("S1003", "/ws-s3"), ("S1004", "/ws-s4"), ("S1005", "/ws-s5"), ("S1006", "/ws-s6")]:
    url = f"https://linhhoasu.lol{path}"
    cmd = ["curl.exe", "-i", "--max-time", "3", "-H", "Connection: Upgrade", "-H", "Upgrade: websocket", "-H", "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==", "-H", "Sec-WebSocket-Version: 13", url]
    res = subprocess.run(cmd, capture_output=True, text=True)
    passed = "101" in res.stdout or "Switching Protocols" in res.stdout
    print(f"[{'PASS' if passed else 'FAIL'}] WebSocket {sid} ({path}): {'101 Switching Protocols' if passed else 'FAILED'}")
