import sys
sys.path.insert(0, str(__import__('pathlib').Path(__file__).resolve().parent))
from snapshot_web_multiserver_20260906 import connect, run

s = connect()
try:
    out = run(s, "pm2 logs lhs-real-bots-s6 --lines 160 --nostream 2>&1 | tail -n 180")
    sys.stdout.buffer.write(out.encode("utf-8", "replace"))
finally:
    s.close()
