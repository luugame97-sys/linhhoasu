import sys
from pathlib import Path
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, str(Path(__file__).resolve().parent))
from snapshot_web_multiserver_20260906 import connect, run

ssh = connect()
try:
    js_content = """
    const cfg = require('/linhhoasu/lhs/newServer/src/services/ConfigService');
    const tables = cfg.loadAllTables();
    console.log('=== ConfigService loaded on VPS ===');
    console.log('SwordLevelConfig keys:', Object.keys(tables.SwordLevelConfig || {}));
    if (tables.SwordLevelConfig) {
      for (const q of Object.keys(tables.SwordLevelConfig)) {
        const levels = Object.keys(tables.SwordLevelConfig[q]).map(Number);
        console.log(`SwordLevelConfig Quality ${q}: min=${Math.min(...levels)}, max=${Math.max(...levels)}, count=${levels.length}`);
      }
    }

    console.log('GemLevelConfig rows:', Object.keys(tables.GemLevelConfig || {}).length);
    if (tables.GemLevelConfig) {
      const gemLevels = Object.values(tables.GemLevelConfig).map(x => Number(x.level));
      console.log('GemLevelConfig min level:', Math.min(...gemLevels), 'max level:', Math.max(...gemLevels));
      const ids = Object.keys(tables.GemLevelConfig).map(Number);
      console.log('GemLevelConfig min id:', Math.min(...ids), 'max id:', Math.max(...ids));
      // In các id > 25096 nếu có
      const highGems = Object.values(tables.GemLevelConfig).filter(x => Number(x.level) > 10);
      console.log('Gems with level > 10 count:', highGems.length);
    }
    """
    sftp = ssh.open_sftp()
    with sftp.file('/tmp/check_config_runtime.js', 'w') as f:
        f.write(js_content)
    sftp.close()
    out = run(ssh, 'node /tmp/check_config_runtime.js')
    print(out)
finally:
    ssh.close()
