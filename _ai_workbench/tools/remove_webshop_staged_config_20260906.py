"""Remove exact sensitive config copies accidentally staged during QA."""
from pathlib import Path
import paramiko

WB=Path(__file__).resolve().parents[1]
c=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines()
targets=['/linhhoasu/_ai_workbench/temp/webshop_upgrade_20260905_170333/gm/config.php','/linhhoasu/_ai_workbench/temp/webshop_upgrade_20260905_171016/gm/config.php','/linhhoasu/_ai_workbench/temp/webshop_upgrade_20260905_171112/gm/config.php']
s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
removed=[]
try:
 f=s.open_sftp()
 for target in targets:
  if not target.startswith('/linhhoasu/_ai_workbench/temp/webshop_upgrade_20260905_') or not target.endswith('/gm/config.php'):raise RuntimeError('target guard')
  try:f.remove(target);removed.append(target)
  except FileNotFoundError:pass
 for target in targets:
  try:f.stat(target);raise RuntimeError('sensitive staged config remains')
  except FileNotFoundError:pass
 f.close();print({'removed':removed,'remaining':0})
finally:s.close()
