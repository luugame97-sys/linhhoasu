import sys
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, r'i:/Linhhoasu/server/server/_ai_workbench/tools')
from snapshot_web_multiserver_20260906 import connect, run

def main():
    ssh = connect()
    sftp = ssh.open_sftp()
    
    test_code = """
const assert = require('assert');
const fs = require('fs');

// 1. Check GameDayService & FarmShopService
const gameDay = require('/linhhoasu/lhs/newServer/src/services/GameDayService');
const farmShop = require('/linhhoasu/lhs/newServer/src/services/FarmShopService');
const now = Date.now();
const todayFarm = gameDay.key(now);
console.log('Live GameDayService key:', todayFarm);
assert(todayFarm >= 20260900, 'GameDayService key invalid');

// 2. Check activity handler
const activity = require('/linhhoasu/lhs/newServer/src/handlers/activity');
const dayKey = activity.getGmt8DayKey(now);
console.log('Live activity dayKey:', dayKey);
assert(dayKey > 20000, 'Activity dayKey invalid');

// 3. Check client bundle for -420
const bundle = fs.readFileSync('/linhhoasu/webgame/game/js/main.min_drop100.js', 'utf8');
assert(bundle.includes('-420-e'), 'main.min_drop100.js missing -420 offset');
console.log('Client bundle -420 GMT+7 offset verified: PASS');

const indexHtml = fs.readFileSync('/linhhoasu/webgame/game/index.html', 'utf8');
assert(indexHtml.includes('20260920_gmt7_sync_v1'), 'index.html missing cache-buster version');
console.log('index.html cache-buster verified: PASS');

console.log('\\n>>> LIVE VERIFICATION ON VPS: ALL CHECKS PASSED 100% <<<');
"""
    with sftp.file('/tmp/verify_gmt7.js', 'w') as f:
        f.write(test_code)
    
    out = run(ssh, 'node /tmp/verify_gmt7.js')
    print(out.strip())
    run(ssh, 'rm -f /tmp/verify_gmt7.js')
    
    # Also verify PM2 status
    pm2_out = run(ssh, 'pm2 list')
    print('\nPM2 Status:')
    print(pm2_out.strip())

if __name__ == '__main__':
    main()
