import hashlib,json,shlex
from datetime import datetime,timezone
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect,run
R='/linhhoasu';P=R+'/webgame/gm/assets/item/gmitem.txt';B=R+'/_ai_workbench/backups/gem_gm_unhide_20260913_pre';E='af2ec6bda345402f984146c9cc2b6b0eaa6cb22aaccede881e85c005b4655db9';N={23:'sinh mệnh tấn công',24:'sinh mệnh thủ',25:'sinh mệnh tốc độ',26:'tấn công thủ',27:'tốc độ tấn công',28:'thủ tốc độ'}
def main():
 s=connect();
 try:
  with s.open_sftp() as f:d=f.open(P,'rb').read()
  if hashlib.sha256(d).hexdigest()!=E:raise RuntimeError('CAS_MISMATCH')
  lines=d.decode('utf-8').splitlines();existing={int(x.split(';',1)[0]) for x in lines if x.split(';',1)[0].isdigit()};add=[]
  for typ,name in N.items():
   for level in range(30,101):
    i=25000+(level-1)*10+(typ-22)
    if i not in existing:add.append(f'{i};Hồn ngọc {name} cấp {level}')
  if len(add)!=426:raise RuntimeError('EXPECTED_426_MISSING:'+str(len(add)))
  b=('\r\n'.join(lines+add)+'\r\n').encode('utf-8');run(s,'mkdir -p '+shlex.quote(B)+' && cp -p '+shlex.quote(P)+' '+shlex.quote(B+'/gmitem.txt'))
  Path('_ai_workbench/temp/gem_level100_20260913/gmitem.unhide.next').write_bytes(b)
  with s.open_sftp() as f:
   tmp=P+'.unhide_tmp_20260913';f.put('_ai_workbench/temp/gem_level100_20260913/gmitem.unhide.next',tmp);f.posix_rename(tmp,P) if hasattr(f,'posix_rename') else f.rename(tmp,P)
  ev={'startedAt':datetime.now(timezone.utc).isoformat(),'result':'PASS','added':len(add),'beforeHash':E,'afterHash':hashlib.sha256(b).hexdigest(),'samples':run(s,"for id in 25291 25301 25996;do grep -m1 \"^$id;\" "+P+" || true;done").encode('unicode_escape').decode()}
 finally:s.close()
 Path('_ai_workbench/temp/gem_level100_20260913/gm-unhide-deploy.json').write_text(json.dumps(ev,ensure_ascii=False,indent=2)+'\n');print(json.dumps(ev,ensure_ascii=False))
if __name__=='__main__':main()
