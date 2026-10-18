"""Restore the exact pre-TopArena baseline after an interrupted emergency rollback."""
import json,shlex
from skin_incident_remote import connect,run
BACK='/linhhoasu/_ai_workbench/backups/toparena_v3_20261003_222315'
MAP={
 '/linhhoasu/lhs/newServer/src/handlers/arena.js':'linhhoasu__lhs__newServer__src__handlers__arena.js.bak',
 '/linhhoasu/lhs/newServer/src/router.js':'linhhoasu__lhs__newServer__src__router.js.bak',
 '/linhhoasu/lhs/newServer/src/app.js':'linhhoasu__lhs__newServer__src__app.js.bak',
 '/linhhoasu/lhs/newServer/src/services/PlayerService.js':'linhhoasu__lhs__newServer__src__services__PlayerService.js.bak',
 '/linhhoasu/lhs/newServer/src/services/RechargeBenefitService.js':'linhhoasu__lhs__newServer__src__services__RechargeBenefitService.js.bak',
 '/linhhoasu/lhs/newServer/src/services/RechargeRewardResolver.js':'linhhoasu__lhs__newServer__src__services__RechargeRewardResolver.js.bak',
 '/linhhoasu/lhs/newServer/src/services/CrossEventScheduleService.js':'linhhoasu__lhs__newServer__src__services__CrossEventScheduleService.js.bak',
 '/linhhoasu/lhs/newServer/src/services/CrossEventSettlementService.js':'linhhoasu__lhs__newServer__src__services__CrossEventSettlementService.js.bak',
 '/linhhoasu/webgame/game/index.html':'linhhoasu__webgame__game__index.html.bak',
 '/linhhoasu/webgame/game/js/lhs-cross-events-v2.js':'linhhoasu__webgame__game__js__lhs-cross-events-v2.js.bak',
}
REMOVE=['/linhhoasu/lhs/newServer/src/services/TopArenaRules.js','/linhhoasu/lhs/newServer/src/services/TopArenaRepository.js','/linhhoasu/lhs/newServer/src/services/TopArenaPassService.js','/linhhoasu/lhs/newServer/src/services/TopArenaService.js','/linhhoasu/webgame/game/js/lhs-toparena-v3.js']
with connect() as c:
 for remote,name in MAP.items():
  src=f'{BACK}/{name}';stage=remote+'.rollback_v2';run(c,f'cp -p -- {shlex.quote(src)} {shlex.quote(stage)} && chmod 640 {shlex.quote(stage)} && mv -f -- {shlex.quote(stage)} {shlex.quote(remote)}')
 for path in REMOVE:run(c,f'rm -f -- {shlex.quote(path)}')
 for name in ['lhs-s1001','lhs-s1002','lhs-s1003','lhs-s1004','lhs-s1005','lhs-s1006','lhs-s1007']:run(c,f'pm2 restart {name} --update-env >/dev/null')
 print(json.dumps({'result':'ROLLBACK_APPLIED','backup':BACK,'restored':list(MAP),'removed':REMOVE},indent=2))
