"""CAS/backup/static-only v2 rollout for Pet failure notices."""
import hashlib,json,shlex,time
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect,run
ROOT=Path(__file__).resolve().parents[2];GAME=ROOT/'linhhoasu/webgame/game';B=GAME/'js/main.min_drop100.js';I=GAME/'index.html'
RB='/linhhoasu/webgame/game/js/main.min_drop100.js';RI='/linhhoasu/webgame/game/index.html';BACK='/linhhoasu/_ai_workbench/backups/pet_client_result_guard_20260924_v2';ST='/linhhoasu/_ai_workbench/temp/pet_client_result_guard_20260924_v2';KEY='20260924_pet_result_guard_v2';OLD_B='e16e7570257586a53bea2a26cc144723b5b0b00deef6977957c7e85cb0112106';OLD_I='b3ab93aede26c185f47b443b2a46f6f2cf0c0f5c511a6fc222b2265619dad0ab'
sha=lambda x:hashlib.sha256(x).hexdigest()
def rd(s,p):
 with s.open(p,'rb') as f:return f.read()
def wr(s,p,d,a):
 with s.open(p,'wb') as f:f.write(d)
 s.chmod(p,a.st_mode&0o777)
 try:s.chown(p,a.st_uid,a.st_gid)
 except OSError:pass
def main():
 cand={RB:B.read_bytes(),RI:I.read_bytes()}
 if sha(cand[RB])==OLD_B or KEY.encode() not in cand[RI]:raise RuntimeError('CANDIDATE_NOT_V2')
 s=connect();stage=None
 try:
  with s.open_sftp() as f:
   old={RB:rd(f,RB),RI:rd(f,RI)};attrs={p:f.stat(p) for p in old}
   if sha(old[RB])!=OLD_B or sha(old[RI])!=OLD_I:raise RuntimeError('REMOTE_CAS_DRIFT')
   try:f.stat(BACK);exists=True
   except FileNotFoundError:exists=False
   if not exists:run(s,'install -d -m 700 '+shlex.quote(BACK))
   for p,d in old.items():
    bp=BACK+'/'+Path(p).name+'.before'
    try:prior=rd(f,bp)
    except FileNotFoundError:
     if exists:raise RuntimeError('BACKUP_MISSING:'+bp)
     wr(f,bp,d,attrs[p]);f.chmod(bp,0o600)
    else:
     if prior!=d:raise RuntimeError('BACKUP_DRIFT:'+bp)
   stage=ST+'_'+str(int(time.time()));run(s,'install -d -m 700 '+shlex.quote(stage));sb=stage+'/main.min_drop100.js';si=stage+'/index.html';wr(f,sb,cand[RB],attrs[RB]);wr(f,si,cand[RI],attrs[RI]);run(s,'node --check '+shlex.quote(sb));f.posix_rename(sb,RB);f.posix_rename(si,RI)
  served=run(s,"curl -fsS 'http://127.0.0.1:81/js/main.min_drop100.js?v="+KEY+"'");idx=run(s,'curl -fsS http://127.0.0.1:81/index.html')
  if sha(served.encode())!=sha(cand[RB]) or KEY not in idx:raise RuntimeError('SERVED_VERIFY_FAILED')
  out={'result':'DEPLOYED_STATIC_ONLY','productionWrites':0,'pm2Restart':False,'before':{'bundle':OLD_B,'index':OLD_I},'after':{'bundle':sha(cand[RB]),'served':sha(served.encode()),'index':sha(cand[RI]),'cacheKey':KEY},'backup':BACK}
  (ROOT/'_ai_workbench/temp/pet_client_error_notice_20260924_release.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps(out,ensure_ascii=False,indent=2))
 finally:
  if stage:
   try:run(s,'rm -f -- '+shlex.quote(stage+'/main.min_drop100.js')+' '+shlex.quote(stage+'/index.html'));run(s,'rmdir -- '+shlex.quote(stage))
   except Exception:pass
  s.close()
if __name__=='__main__':main()
