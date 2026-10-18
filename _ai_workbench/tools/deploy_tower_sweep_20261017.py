"""Deploy the verified tower sweep batch path over the shared current source."""
from pathlib import Path
import deploy_mount_star_progress_20261017 as release

release.TASK=Path(__file__).resolve().parents[2]/'_ai_workbench/temp/baodian_sweep_20261017'
release.VERSION='20261017_tower_sweep_v1'
release.BACKUP_PREFIX='tower_sweep_'
release.RECOVERY_POLICY='batch sweep to max historical allowed target, idempotent receipt 3705, no first-clear replay'
release.FILES={
 'lhs/newServer/src/services/TowerSweepService.js':'src/services/TowerSweepService.js',
 'lhs/newServer/src/services/TowerDailyResetService.js':'src/services/TowerDailyResetService.js',
 'lhs/newServer/src/services/PlayerService.js':'src/services/PlayerService.js',
 'lhs/newServer/src/handlers/tower.js':'src/handlers/tower.js',
 'lhs/newServer/src/handlers/index.js':'src/handlers/index.js',
 'webgame/game/js/lhs-tower-daily-v1.js':'web/js/lhs-tower-daily-v1.js',
 'webgame/game/index.html':'web/index.html',
}
if __name__=='__main__':release.main()
