import sys
sys.path.insert(0, r'i:/Linhhoasu/server/server/_ai_workbench/tools')
from snapshot_web_multiserver_20260906 import connect, run

ssh = connect()
out = run(ssh, "sed -n '480,515p' /linhhoasu/webgame/game/index.html")
print(out)
ssh.close()
