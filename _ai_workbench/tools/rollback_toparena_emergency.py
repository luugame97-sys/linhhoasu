"""Emergency rollback of incomplete TopArena rollout."""
import datetime as dt, hashlib, json, shlex
from skin_incident_remote import connect, run

REMOTE_BACKUP='/linhhoasu/_ai_workbench/backups/toparena_v3_20261003_223108'
FILES=[
 'lhs/newServer/src/handlers/arena.js','lhs/newServer/src/router.js','lhs/newServer/src/app.js',
 'lhs/newServer/src/services/PlayerService.js','lhs/newServer/src/services/RechargeBenefitService.js',
 'lhs/newServer/src/services/RechargeRewardResolver.js','lhs/newServer/src/services/CrossEventScheduleService.js',
 'lhs/newServer/src/services/CrossEventSettlementService.js','webgame/game/index.html',
 'webgame/game/js/lhs-cross-events-v2.js']
BACKUP_NAMES={rel:'linhhoasu__'+rel.replace('/','__')+'.bak' for rel in FILES}
REMOVE=['/linhhoasu/lhs/newServer/src/services/TopArenaRules.js','/linhhoasu/lhs/newServer/src/services/TopArenaRepository.js','/linhhoasu/lhs/newServer/src/services/TopArenaPassService.js','/linhhoasu/lhs/newServer/src/services/TopArenaService.js','/linhhoasu/webgame/game/js/lhs-toparena-v3.js']
CURRENT={
 '/linhhoasu/lhs/newServer/src/handlers/arena.js':'ec16be8796f7451d32b4b752887b7b0aa3d7f78a346b6318625eea796dbb35f7',
 '/linhhoasu/lhs/newServer/src/router.js':'340e38055acb01731110e09c49e33c23ffc25a5fae81b974fbc417c5f0b38680',
 '/linhhoasu/lhs/newServer/src/app.js':'d6a52f7650bd5d6c594673d9313752e0f24d945a574b0586a308f3c7f9fe72fc',
 '/linhhoasu/lhs/newServer/src/services/PlayerService.js':'e77202165c7f0eeadecbaac81f5e2655228a3144bce52e1149e5d4410a898678',
}
def digest(b): return hashlib.sha256(b).hexdigest()
with connect() as c:
 s=c.open_sftp()
 for rel in FILES:
  remote='/linhhoasu/'+rel;data=s.open(remote,'rb').read();expected=CURRENT.get(remote);source=REMOTE_BACKUP+'/'+BACKUP_NAMES[rel]
  backup_hash=run(c,f'sha256sum {shlex.quote(source)} | cut -d" " -f1').strip()
  if digest(data)==backup_hash: continue
  if expected and digest(data)!=expected:raise RuntimeError('CAS_MISMATCH:'+remote)
  stage=remote+'.rollback_'+dt.datetime.now().strftime('%H%M%S')
  run(c,f'cp -p -- {shlex.quote(source)} {shlex.quote(stage)} && chmod 640 {shlex.quote(stage)} && mv -f -- {shlex.quote(stage)} {shlex.quote(remote)}')
 for path in REMOVE:
  try:s.remove(path)
  except IOError:pass
 s.close()
 for name in ['lhs-s1001','lhs-s1002','lhs-s1003','lhs-s1004','lhs-s1005','lhs-s1006','lhs-s1007']:
  run(c,f'pm2 restart {shlex.quote(name)} --update-env >/dev/null')
 print(json.dumps({'result':'ROLLBACK_APPLIED','backup':REMOTE_BACKUP,'removed':REMOVE,'restored':FILES},indent=2))
