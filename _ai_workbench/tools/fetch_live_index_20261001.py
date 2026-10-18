from pathlib import Path
from rollback_role_lian_manifest_20260930 import ssh_config
import paramiko

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench/temp/system231_index_live_20261001.html'
args, kwargs = ssh_config()
assert args[0] == '103.116.104.165'
c = paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy()); c.connect(*args, **kwargs)
try:
    with c.open_sftp().open('/linhhoasu/webgame/game/index.html', 'rb') as f:
        OUT.write_bytes(f.read())
finally:
    c.close()
print(OUT)
