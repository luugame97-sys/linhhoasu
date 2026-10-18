"""Prepare a fixed incident allowlist and source candidate; no production writes."""
import hashlib,json,shutil,sys
from pathlib import Path
import paramiko
from release_huyenvu_daily_20260906 import run,hashes,pm2,ready

WB=Path(__file__).resolve().parents[1];ROOT=WB/'temp/fishing_recovery_20260906';APP='/linhhoasu/lhs/newServer'

def main():
 sys.stdout.reconfigure(encoding='utf-8')
 auditPath=WB/'temp/fishing_free_claim_audit_20260906T144141Z/inventory-final.json'
 audit=json.loads(auditPath.read_text(encoding='utf-8'));pre=json.loads((WB/'temp/fishing_penalty_preflight_20260906T152334Z/preflight.json').read_text(encoding='utf-8'))
 owners={p['userId']:p['mappedAccounts'][0] for p in pre['profiles'] if p['accountMappingUnique']}
 rows=[]
 for p in audit['profiles']:
  if p['excessBaozi']<=0:continue
  amount=p['excessBaozi'];seconds=next(m*60 for limit,m in [(100,10),(500,20),(1000,30),(2000,120),(30000,720),(199999,1440)] if amount<=limit)
  account=owners[p['userId']]
  rows.append({k:p[k] for k in ['userId','playerId','serverId','name','recordedClaims']}|{'accountId':account,'amount':amount,'penaltySeconds':0 if account=='vanduc97' else seconds})
 assert len(rows)==19 and sum(r['amount'] for r in rows)==231860 and len({r['accountId'] for r in rows})==19
 assert sum(r['penaltySeconds']>0 for r in rows)==18
 ROOT.mkdir();(ROOT/'app/src/config').mkdir(parents=True);(ROOT/'app/src/services').mkdir();(ROOT/'app/src/net').mkdir()
 plan={'incident':'fishing_free_20260906','code':'FISH_FREE_20260906','evidenceSha256':hashlib.sha256(auditPath.read_bytes()).hexdigest(),'createdFrom':'inventory-final.json','excludeBans':['vanduc97'],'rows':rows}
 (ROOT/'plan.json').write_text(json.dumps(plan,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 shutil.copy2(ROOT/'plan.json',ROOT/'app/src/config/fishingFreeRecovery20260906.json')
 creds=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(creds[0].strip(),username='root',password=creds[2],look_for_keys=False,allow_agent=False,timeout=20)
 try:
  expected=json.loads((WB/'temp/fishing_contest_shop_20260906/deploy.json').read_text())['expected'];assert hashes(s,list(expected))==expected
  f=s.open_sftp()
  try:
   for rel in ['src/net/HTTPServer.js','src/services/AccountBanService.js']:f.get(APP+'/'+rel,str(ROOT/'app'/rel))
   with f.open('/linhhoasu/webgame/gm/config.php') as src:web=src.read().decode('utf-8')
   # Fetch just the login source for inspection, never credentials from config.php.
   for name in ['login.php','api/login.php']:
    try:f.get('/linhhoasu/webgame/gm/'+name,str(ROOT/name.replace('/','-')))
    except FileNotFoundError:pass
  finally:f.close()
  old=(ROOT/'app/src/net/HTTPServer.js').read_text(encoding='utf-8');shutil.copy2(ROOT/'app/src/net/HTTPServer.js',ROOT/'HTTPServer.before.js')
  marker="    internalRouter.post('/account/unban', (req, res) => this._internalAccountUnban(req, res));"
  assert old.count(marker)==1
  added="\n    internalRouter.post('/account/fishing-free-recovery-20260906', async (req, res) => {\n      try { res.json(await require('../services/FishingFreeRecoveryService').dispatch(req.body || {}, this.wsServer)); }\n      catch (error) { res.status(409).json({ success: false, error: error.message }); }\n    });"
  # Mechanical insertion with exact marker, staged only.
  (ROOT/'app/src/net/HTTPServer.js').write_text(old.replace(marker,marker+added),encoding='utf-8')
  start=web.index('function vht6ur_web_ban_state(');end=web.index('function vht6ur_web_ban_message(',start)
  before=web[start:end];line="    if (!$row) return array('banned'=>false,'permanent'=>false,'until'=>0,'remainingSeconds'=>0,'reason'=>'','code'=>'','bannedAt'=>'','bannedBy'=>'','meta'=>array());"
  assert before.count(line)==1
  after=before.replace(line,'    // A timed ban also applies before the first successful WebGM login.')
  (ROOT/'web-edit.json').write_text(json.dumps({'before':before,'after':after,'expected':hashlib.sha256(web.encode()).hexdigest()},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
  (ROOT/'web-ban-before.php.txt').write_text(before,encoding='utf-8');(ROOT/'web-ban-after.php.txt').write_text(after,encoding='utf-8')
  baseline={**expected,APP+'/src/net/HTTPServer.js':hashlib.sha256((ROOT/'HTTPServer.before.js').read_bytes()).hexdigest(),'/linhhoasu/webgame/gm/config.php':hashlib.sha256(web.encode()).hexdigest()}
  out={'expected':baseline,'pm2':pm2(s),'ready':ready(s),'productionWrites':0};(ROOT/'manifest.json').write_text(json.dumps(out,indent=2)+'\n',encoding='utf-8')
  backup=WB/'backups/fishing_recovery_20260906';backup.mkdir()
  for name in ['session_report.md','session_report.html']:shutil.copy2(WB/'reports'/name,backup/name)
  print(json.dumps({'root':str(ROOT),'recoverRoles':len(rows),'banAccounts':18,'baozi':231860,'exempt':'vanduc97','ready':out['ready']}))
 finally:s.close()

if __name__=='__main__':main()
