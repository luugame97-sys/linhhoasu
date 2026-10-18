from pathlib import Path
import sys,json
import paramiko
from recheck_items_readonly_20260905 import execute
WB=Path(__file__).resolve().parents[1];c=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
try:
 out=execute(s,(WB/'tools/qa_native_s2_switch.js').read_text(encoding='utf-8'));(WB/'temp/cross_server_login_20260905/native_before.log').write_text(out,encoding='utf-8');print(out)
finally:s.close()
