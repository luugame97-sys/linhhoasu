"""Add new gem IDs to GM catalog and raise gift amount cap only for 60/61."""
import hashlib,json,shlex
from datetime import datetime,timezone
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect,run

ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'_ai_workbench/temp/gem_level100_20260913';R='/linhhoasu';BACK=R+'/_ai_workbench/backups/gem_gm_catalog_20260913_pre'
FILES={'webgame/gm/config.php':OUT/'config.php.before','webgame/gm/assets/item/gmitem.txt':OUT/'gmitem.txt.before'}
EXPECTED={'webgame/gm/config.php':'392d386a4210fc3517ab026f688661de13cb389e626920a9697193a55f73081d','webgame/gm/assets/item/gmitem.txt':'be9e16b5514aa8d5e4638a327872a0b47315de3141ef296835982fdbed1e7436'}
def sha(b):return hashlib.sha256(b).hexdigest()
def rp(x):return R+'/'+x
def main():
  s=connect();ev={'startedAt':datetime.now(timezone.utc).isoformat(),'scope':'GM catalog new gem IDs + gift cap item60/61'}
  try:
    if run(s,'test -e '+shlex.quote(BACK)+' && echo yes || echo no').strip()!='no':raise RuntimeError('BACKUP_EXISTS')
    with s.open_sftp() as f:
      raw={r:f.open(rp(r),'rb').read() for r in FILES}
    for r,d in raw.items():
      if sha(d)!=EXPECTED[r]:raise RuntimeError(f'CAS:{r}:{sha(d)}:{EXPECTED[r]}')
    config=raw['webgame/gm/config.php'].decode('utf-8')
    old="function gift_reward_amount_limit($id) { return in_array((int)$id,array(1,2,6),true)?1000000000:999999; }"
    new="function gift_reward_amount_limit($id) { $id=(int)$id; return in_array($id,array(1,2,6,60,61),true)?1000000000:999999; }"
    if old not in config: raise RuntimeError('CONFIG_FUNCTION_DRIFT')
    config=config.replace(old,new,1).encode('utf-8')
    catalog=raw['webgame/gm/assets/item/gmitem.txt'].decode('utf-8')
    existing=set()
    for line in catalog.splitlines():
      if line.split(';',1)[0].isdigit(): existing.add(int(line.split(';',1)[0]))
    lines=[]
    for t in range(23,29):
      for level in range(11,101):
        gid=25000+(level-1)*10+(t-22)
        if gid in existing: continue
        lines.append(f'{gid};Hồn ngọc loại {t} - Cấp {level}\r\n')
    catalog_new=(catalog.rstrip('\r\n')+'\r\n'+''.join(lines)).encode('utf-8')
    if len(lines)!=540: raise RuntimeError(f'NEW_LINE_COUNT:{len(lines)}')
    candidates={'webgame/gm/config.php':config,'webgame/gm/assets/item/gmitem.txt':catalog_new}
    run(s,'mkdir -p '+shlex.quote(BACK+'/webgame/gm/assets/item'))
    for r in FILES:run(s,'cp -p '+shlex.quote(rp(r))+' '+shlex.quote(BACK+'/'+r))
    with s.open_sftp() as f:
      for r,d in candidates.items():
        t=rp(r);tmp=t+'.gemgm_tmp_20260913';open(OUT/(Path(r).name+'.next'),'wb').write(d);f.put(str(OUT/(Path(r).name+'.next')),tmp);f.posix_rename(tmp,t) if hasattr(f,'posix_rename') else f.rename(tmp,t)
    ev['newItems']=len(lines);ev['hashes']={r:sha(d) for r,d in candidates.items()};ev['configCap']='item60/61=1,000,000,000; others unchanged'
    ev['catalogReadback']=run(s,"grep -cE '^25(1[0-9]{2}|[2-9][0-9]{2});' /linhhoasu/webgame/gm/assets/item/gmitem.txt || true").strip()
  finally:s.close()
  ev['finishedAt']=datetime.now(timezone.utc).isoformat();ev['result']='PASS' if ev.get('newItems')==540 else 'HOLD';(OUT/'gm-deploy.json').write_text(json.dumps(ev,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'result':ev['result'],'newItems':ev.get('newItems'),'evidence':str(OUT/'gm-deploy.json')}))
if __name__=='__main__':main()
