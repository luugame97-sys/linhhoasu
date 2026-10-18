"""Scoped SSO release preparation. Credentials are read in memory, never printed."""
import ast, hashlib, json, sys
from pathlib import Path
import paramiko
ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / '_ai_workbench/temp/sso_release_20260930'
PATHS = [
 '/linhhoasu/lhs/newServer/src/net/HTTPServer.js',
 '/linhhoasu/lhs/newServer/src/services/AuthSessionService.js',
 '/linhhoasu/lhs/newServer/src/services/AccountService.js',
 '/linhhoasu/webgame/game/index.html',
 '/linhhoasu/webgame/game/register.html',
 '/linhhoasu/webgame/game/js/main.min_drop100.js',
 '/linhhoasu/webgame/gm/web_context.php',
 '/linhhoasu/webgame/gm/api/user_api.php',
 '/linhhoasu/webgame/gm/assets/js/index.js',
]
def connect():
 tree=ast.parse((ROOT/'_ai_workbench/tools/run_vps_cmd.py').read_text(encoding='utf-8-sig'))
 call=next(n for n in ast.walk(tree) if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr=='connect')
 host=ast.literal_eval(call.args[0]); kw={k.arg:ast.literal_eval(k.value) for k in call.keywords}
 assert host=='103.116.104.165'
 s=paramiko.SSHClient(); s.load_system_host_keys(); s.set_missing_host_key_policy(paramiko.AutoAddPolicy()); s.connect(host,timeout=15,**kw)
 return s
def run(s,cmd):
 _,o,e=s.exec_command(cmd,timeout=90); out=o.read().decode(); err=e.read().decode(); code=o.channel.recv_exit_status()
 if code: raise RuntimeError('Remote command failed: '+err[:400])
 return out
def sha(b): return hashlib.sha256(b).hexdigest()
if __name__=='__main__':
 s=connect()
 try:
  with s.open_sftp() as f:
   manifest={}
   for p in PATHS:
    b=f.open(p,'rb').read(); rel=p.removeprefix('/linhhoasu/')
    for section in ['before','candidate']:
     dest=WORK/section/rel; dest.parent.mkdir(parents=True,exist_ok=True)
     if dest.exists(): raise RuntimeError('Do not overwrite existing snapshot')
     dest.write_bytes(b)
    manifest[p]=sha(b)
   (WORK/'manifest.json').write_text(json.dumps(manifest,indent=2))
  print(json.dumps({'snapshot_files':len(manifest),'host':'103.116.104.165'}))
 finally:s.close()
