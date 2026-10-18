import sys
from pathlib import Path
sys.path.insert(0, r'i:/Linhhoasu/server/server/_ai_workbench/tools')
from snapshot_web_multiserver_20260906 import connect, run

ssh = connect()
out = run(ssh, "find /linhhoasu/webgame -name '*config_e5ac72c2.bin*'")
print("Found config_e5ac72c2.bin in webgame:")
print(out)

out2 = run(ssh, "grep -rn 'config_e5ac72c2' /linhhoasu/webgame/game/ 2>/dev/null | head -n 10")
print("References to config_e5ac72c2 in webgame:")
print(out2)

# Check nginx config for game static files
out3 = run(ssh, "nginx -T 2>/dev/null | grep -E '(root|location|cache)' | head -n 30")
print("Nginx configuration:")
print(out3)

ssh.close()
