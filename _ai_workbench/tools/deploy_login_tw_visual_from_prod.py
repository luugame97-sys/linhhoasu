from __future__ import annotations
import getpass, hashlib, json, shlex
from datetime import datetime, timezone
from pathlib import Path
import paramiko

HOST='103.116.105.154'
ROOT=Path(__file__).resolve().parents[1]
CAND=ROOT/'temp/login_tw_visual_candidate_20260902'
FILES={
 'start.min_52ac8d58.js':(CAND/'start.min_52ac8d58.js','/linhhoasu/webgame/game/js/start.min_52ac8d58.js','e822365fca7b7380e60c0c80025d8efaeb798b19543067a609d0117a25ec9e24'),
 'main.min_a6195824.js':(CAND/'main.min_a6195824.js','/linhhoasu/webgame/game/js/main.min_a6195824.js','0a83139204f9635db61b166907355e0ecff971569693d0e1a7fe438591b0dfe1'),
 'index.html':(CAND/'index.html','/linhhoasu/webgame/game/index.html','f6e4751eb14385ccdc0d5f6e2e2b4a8b1fcd65b715a94b1ad751119c5ff7bc7b'),
}
def sha(p:Path)->str:
 h=hashlib.sha256();
 with p.open('rb') as f:
  for chunk in iter(lambda:f.read(1024*1024),b''): h.update(chunk)
 return h.hexdigest()
def run(ssh,cmd,timeout=180):
 _,o,e=ssh.exec_command(cmd,timeout=timeout); out=o.read().decode('utf-8','replace'); err=e.read().decode('utf-8','replace'); code=o.channel.recv_exit_status()
 if code: raise RuntimeError(err[-5000:] or out[-5000:] or f'exit={code}')
 return out
def main():
 local_hash={n:sha(v[0]) for n,v in FILES.items()}
 pw=getpass.getpass('Production password (not logged): ')
 ssh=paramiko.SSHClient(); ssh.load_system_host_keys(); ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy()); ssh.connect(HOST,username='root',password=pw,look_for_keys=False,allow_agent=False,timeout=20,banner_timeout=20,auth_timeout=20)
 stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S'); backup=f'/linhhoasu/_ai_workbench/backups/login_tw_visual_pre_{stamp}'; stage=f'/linhhoasu/_ai_workbench/temp/login_tw_visual_{stamp}'
 changed=[]
 try:
  for n,(_,remote,expected) in FILES.items():
   live=run(ssh,f'sha256sum -- {shlex.quote(remote)}').split()[0]
   if live!=expected: raise RuntimeError(f'hash precondition failed {n}: {live}')
  run(ssh,f'mkdir -p -- {shlex.quote(backup)} {shlex.quote(stage)}')
  for n,(_,remote,_) in FILES.items(): run(ssh,f'cp -a -- {shlex.quote(remote)} {shlex.quote(backup+"/"+n)}')
  sftp=ssh.open_sftp()
  try:
   for n,(local,_,_) in FILES.items(): sftp.put(str(local),f'{stage}/{n}')
  finally: sftp.close()
  run(ssh,f'node --check {shlex.quote(stage+"/start.min_52ac8d58.js")} && node --check {shlex.quote(stage+"/main.min_a6195824.js")} && test -s {shlex.quote(stage+"/index.html")}')
  for n,(_,remote,_) in FILES.items():
   staged=run(ssh,f'sha256sum -- {shlex.quote(stage+"/"+n)}').split()[0]
   if staged!=local_hash[n]: raise RuntimeError(f'stage hash mismatch {n}: {staged}')
  # Compare-and-swap immediately before writes.
  for n,(_,remote,expected) in FILES.items():
   live=run(ssh,f'sha256sum -- {shlex.quote(remote)}').split()[0]
   if live!=expected: raise RuntimeError(f'live drift before swap {n}: {live}')
   run(ssh,f'install -o root -g root -m 0644 -- {shlex.quote(stage+"/"+n)} {shlex.quote(remote)}'); changed.append(n)
  verify=run(ssh,f"node - <<'NODE'\nconst fs=require('fs');const s=fs.readFileSync('/linhhoasu/webgame/game/js/start.min_52ac8d58.js','utf8');const m=fs.readFileSync('/linhhoasu/webgame/game/js/main.min_a6195824.js','utf8');const i=fs.readFileSync('/linhhoasu/webgame/game/index.html','utf8');const x={twMap:(s.match(/r=d\\.inChina\\?\\\"login_bg_tw\\\":\\\"login_bg\\\"/g)||[]).length,oldMap:(s.match(/r=d\\.inChina\\?\\\"login_bg\\\":\\\"login_bg_tw\\\"/g)||[]).length,showBg:(m.match(/AppInfo\\.inChina\\?\\(this\\.loadingBGImg/g)||[]).length,alwaysVisible:(m.match(/this\\.loadingBGImg\\.visible=!0/g)||[]).length,token:(i.match(/20260902_login_tw_visual_v1/g)||[]).length};console.log(JSON.stringify(x));if(x.twMap!==1||x.oldMap!==0||x.showBg!==0||x.alwaysVisible<1||x.token!==2)process.exit(2);\nNODE").strip()
  http=run(ssh,"printf 'index='; curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:81/; printf ' start='; curl -sS -o /dev/null -w '%{http_code}' 'http://127.0.0.1:81/js/start.min_52ac8d58.js?v=20260902_login_tw_visual_v1'; printf ' main='; curl -sS -o /dev/null -w '%{http_code}' 'http://127.0.0.1:81/js/main.min_a6195824.js?v=20260902_login_tw_visual_v1'; printf ' tw='; curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:81/update/resource/assets/game_start/login_bg_tw_8d2e3139.jpg; printf ' ready='; curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ready; echo").strip()
 except Exception:
  for n in reversed(changed):
   try: run(ssh,f'cp -a -- {shlex.quote(backup+"/"+n)} {shlex.quote(FILES[n][1])}')
   except Exception: pass
  raise
 finally: ssh.close()
 print(json.dumps({'result':'PASS','backup':backup,'hashes':local_hash,'contract':json.loads(verify),'http':http,'restart':[]},ensure_ascii=False,indent=2))
if __name__=='__main__': main()
