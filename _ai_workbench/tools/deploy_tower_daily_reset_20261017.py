"""Reuse the verified shared-source rollout transport for the tower daily reset."""
from pathlib import Path
import deploy_mount_star_progress_20261017 as release

release.TASK=Path(__file__).resolve().parents[2]/'_ai_workbench/temp/baodian_reset_20261017'
release.VERSION='20261017_tower_daily_reset_v1'
release.BACKUP_PREFIX='tower_daily_reset_'
release.RECOVERY_POLICY='00:00 GMT+7; legacy initialize once; preserve maxlayer/mounts/inventory; CAS on normal player load'
release.FILES={
 'lhs/newServer/src/services/TowerDailyResetService.js':'src/services/TowerDailyResetService.js',
 'lhs/newServer/src/services/PlayerService.js':'src/services/PlayerService.js',
 'lhs/newServer/src/handlers/tower.js':'src/handlers/tower.js',
 'lhs/newServer/src/handlers/raid.js':'src/handlers/raid.js',
 'lhs/newServer/src/handlers/index.js':'src/handlers/index.js',
 'webgame/game/js/lhs-tower-daily-v1.js':'web/js/lhs-tower-daily-v1.js',
 'webgame/game/index.html':'web/index.html',
}
if __name__=='__main__':release.main()
