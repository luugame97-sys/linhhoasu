import sys
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, r'i:/Linhhoasu/server/server/_ai_workbench/tools')
from snapshot_web_multiserver_20260906 import connect, run

ssh = connect()

verify_script = """
'use strict';
const assert = require('assert');
const config = require('/linhhoasu/lhs/newServer/src/services/ConfigService');

async function test() {
    console.log('Loading ConfigService on VPS...');
    config.reload();

    const topCombatDay = config.get('TopCombatDayRankRewardConfig');
    const topCombatWeek = config.get('TopCombatWeeklyRankRewardConfig');
    const crossArenaDay = config.get('CrossArenaDayRankRewardConfig');
    const crossArenaWeek = config.get('CrossArenaWeeklyRankRewardConfig');

    assert.ok(topCombatDay, 'TopCombatDayRankRewardConfig must exist');
    assert.ok(topCombatWeek, 'TopCombatWeeklyRankRewardConfig must exist');
    assert.ok(crossArenaDay, 'CrossArenaDayRankRewardConfig must exist');
    assert.ok(crossArenaWeek, 'CrossArenaWeeklyRankRewardConfig must exist');

    assert.strictEqual(Object.keys(topCombatDay).length, 10, 'TopCombat Day config must have 10 rows');
    assert.strictEqual(Object.keys(topCombatWeek).length, 10, 'TopCombat Weekly config must have 10 rows');
    console.log('Tables loaded successfully, row counts verified: 10 each.');

    // TopCombat Day Checks
    const day1 = topCombatDay[1].rewards;
    console.log('TopCombat Day 1:', JSON.stringify(day1));
    assert.strictEqual(day1.find(r => r.id === 1).count, 400000);
    assert.strictEqual(day1.find(r => r.id === 90077).count, 10);
    assert.strictEqual(day1.find(r => r.id === 89).count, 100);

    const day2 = topCombatDay[2].rewards;
    assert.strictEqual(day2.find(r => r.id === 1).count, 360000);
    assert.strictEqual(day2.find(r => r.id === 90077).count, 8);

    const day3 = topCombatDay[3].rewards;
    assert.strictEqual(day3.find(r => r.id === 1).count, 320000);
    assert.strictEqual(day3.find(r => r.id === 90077).count, 5);

    const day4 = topCombatDay[4].rewards;
    assert.strictEqual(day4.find(r => r.id === 1).count, 280000);
    assert.strictEqual(day4.find(r => r.id === 90077).count, 3);

    const day5 = topCombatDay[5].rewards;
    console.log('TopCombat Day 5:', JSON.stringify(day5));
    assert.strictEqual(day5.find(r => r.id === 1).count, 50000);
    assert.strictEqual(day5.find(r => r.id === 90077).count, 3);

    const day6 = topCombatDay[6].rewards;
    assert.strictEqual(day6.find(r => r.id === 1).count, 50000);
    assert.strictEqual(day6.find(r => r.id === 90077).count, 3);

    const day7 = topCombatDay[7].rewards;
    assert.strictEqual(day7.find(r => r.id === 1).count, 50000);
    assert.strictEqual(day7.find(r => r.id === 90077).count, 2);

    const day10 = topCombatDay[10].rewards;
    assert.strictEqual(day10.find(r => r.id === 1).count, 10000);
    assert.strictEqual(day10.find(r => r.id === 90077).count, 2);
    console.log('TopCombat Day Reward checks: PASS');

    // TopCombat Week Checks
    const w1 = topCombatWeek[1].rewards;
    console.log('TopCombat Week 1:', JSON.stringify(w1));
    assert.strictEqual(w1.find(r => r.id === 1).count, 2000000);
    assert.strictEqual(w1.find(r => r.id === 90077).count, 20);
    assert.strictEqual(w1.find(r => r.id === 11221).count, 1);
    assert.strictEqual(w1.find(r => r.id === 89).count, 1000);

    const w2 = topCombatWeek[2].rewards;
    assert.strictEqual(w2.find(r => r.id === 1).count, 1500000);
    assert.strictEqual(w2.find(r => r.id === 90077).count, 16);

    const w3 = topCombatWeek[3].rewards;
    assert.strictEqual(w3.find(r => r.id === 1).count, 1000000);
    assert.strictEqual(w3.find(r => r.id === 90077).count, 10);

    const w4 = topCombatWeek[4].rewards;
    assert.strictEqual(w4.find(r => r.id === 1).count, 800000);
    assert.strictEqual(w4.find(r => r.id === 90077).count, 6);

    const w5 = topCombatWeek[5].rewards;
    assert.strictEqual(w5.find(r => r.id === 1).count, 600000);
    assert.strictEqual(w5.find(r => r.id === 90077).count, 6);

    const w6 = topCombatWeek[6].rewards;
    assert.strictEqual(w6.find(r => r.id === 1).count, 400000);
    assert.strictEqual(w6.find(r => r.id === 90077).count, 6);

    const w7 = topCombatWeek[7].rewards;
    assert.strictEqual(w7.find(r => r.id === 1).count, 300000);
    assert.strictEqual(w7.find(r => r.id === 90077).count, 4);

    const w10 = topCombatWeek[10].rewards;
    assert.strictEqual(w10.find(r => r.id === 1).count, 60000);
    assert.strictEqual(w10.find(r => r.id === 90077).count, 4);
    console.log('TopCombat Week Reward checks: PASS');

    // CrossArena Checks
    assert.strictEqual(crossArenaDay[1].rewards.find(r => r.id === 1).count, 400000);
    assert.strictEqual(crossArenaDay[1].rewards.find(r => r.id === 90077).count, 10);
    assert.strictEqual(crossArenaWeek[1].rewards.find(r => r.id === 1).count, 2000000);
    assert.strictEqual(crossArenaWeek[1].rewards.find(r => r.id === 90077).count, 20);
    console.log('CrossArena Reward checks: PASS');

    console.log('>>> ALL REMOTE CONFIG ASSERTIONS PASSED! <<<');
}
test().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
"""

sftp = ssh.open_sftp()
remote_verify_path = '/linhhoasu/_ai_workbench/temp/live_verify_all_rewards.js'
with sftp.file(remote_verify_path, 'w') as f:
    f.write(verify_script)
sftp.close()

out = run(ssh, f"node {remote_verify_path}")
print(out)
run(ssh, f"rm -f {remote_verify_path}")

# Verify index.html translationVersion on VPS
idx_ver = run(ssh, "grep 'translationVersion' /linhhoasu/webgame/game/index.html")
print("Remote index.html cache version:", idx_ver.strip())

# Check HTTP curl on port 80/443 for index.html to ensure web server is serving the new version
web_head = run(ssh, "curl -s http://127.0.0.1/game/index.html 2>/dev/null | grep 'translationVersion' || curl -s http://127.0.0.1:80/index.html 2>/dev/null | grep 'translationVersion' || echo 'curl_check_skipped'")
print("Served web index.html check:", web_head.strip())

ssh.close()
