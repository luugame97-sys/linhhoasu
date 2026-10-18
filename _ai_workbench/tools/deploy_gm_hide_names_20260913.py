import hashlib,json,shlex
from datetime import datetime,timezone
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect,run
R='/linhhoasu';P=R+'/webgame/gm/assets/item/gmitem.txt';B=R+'/_ai_workbench/backups/gem_gm_names_20260913_pre';E='add724f76640e2d25ff29786b889f11d6a8be271713552f1aedd695ad1a52b40';names={23:'sinh mệnh tấn công',24:'sinh mệnh thủ',25:'sinh mệnh tốc độ',26:'tấn công thủ',27:'tốc độ tấn công',28:'thủ tốc độ'}
def main():
 s=connect();
 try:
  with s.open_sftp() as f:d=f.open(P,'rb').read()
  if hashlib.sha256(d).hexdigest()!=E:raise RuntimeError('CAS_MISMATCH')
  lines=d.decode('utf-8').splitlines();out=[];changed=0;hidden=0
  for line in lines:
   raw=line.split(';',1)[0].strip()
   try:i=int(raw)
   except:out.append(line);continue
   if 25000<i<26000 and 11<=((i-25000)//10+1)<=100 and 23<=((i-25000)%10+22)<=28:
    level=(i-25000)//10+1;typ=(i-25000)%10+22
    if level>=30:hidden+=1;continue
    line=f'{i};Hồn ngọc {names[typ]} cấp {level}';changed+=1
   out.append(line)
  b=('\r\n'.join(out)+'\r\n').encode('utf-8');assert changed==114 and hidden==426
  run(s,'mkdir -p '+shlex.quote(B)+' && cp -p '+shlex.quote(P)+' '+shlex.quote(B+'/gmitem.txt'))
  with s.open_sftp() as f:
   tmp=P+'.gemname_tmp_20260913';Path('_ai_workbench/temp/gem_level100_20260913/gmitem.next').write_bytes(b);f.put('_ai_workbench/temp/gem_level100_20260913/gmitem.next',tmp);f.posix_rename(tmp,P) if hasattr(f,'posix_rename') else f.rename(tmp,P)
  with s.open_sftp() as f:after=f.open(P,'rb').read()
  ev={'startedAt':datetime.now(timezone.utc).isoformat(),'result':'PASS','renamed':changed,'hidden':hidden,'beforeHash':E,'afterHash':hashlib.sha256(after).hexdigest(),'samples':run(s,"for id in 25101 25105 25106 25291 25301;do grep -m1 \"^$id;\" "+P+" || true;done").encode('unicode_escape').decode()}
 finally:s.close()
 (Path('_ai_workbench/temp/gem_level100_20260913/gm-names-deploy.json')).write_text(json.dumps(ev,ensure_ascii=False,indent=2)+'\n');print(json.dumps(ev,ensure_ascii=False))
if __name__=='__main__':main()
