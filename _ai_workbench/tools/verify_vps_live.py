import sys
from pathlib import Path
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, str(Path(__file__).resolve().parent))
from snapshot_web_multiserver_20260906 import connect, run

ssh = connect()
try:
    verify_script = """
const basic = require('/linhhoasu/lhs/newServer/src/handlers/basic');
const arena = require('/linhhoasu/lhs/newServer/src/handlers/arena');
const assert = require('assert');

// 1. Verify buildOtherPlayerDetail
const sample = {
  _id: '68c746e50e93ca914757ba3b',
  playerId: 'p_u_Wk_1001_1725514605',
  name: 'VPS_Hero',
  level: 80,
  artifactInfo: {
    artifacts: [{ uid: 1, id: 23101, quenchLv: 1, attr: { level: 5, value: 500 } }],
  },
  petInfo: {
    pets: [{ id: 201, level: 30, slot: -1, passiveSkills: [1001] }],
  },
  other_attr_info: {
    bloodlineInfo: {
      wearUid: 1,
      dataList: [{ uid: 1, id: 27341, tier: 1, score: 300, refineList: [] }],
    },
  },
};

const detail = basic.buildOtherPlayerDetail(sample, { playerId: sample.playerId, serverId: 1001 });
assert.ok(detail.artifact, 'artifact should exist');
assert.ok(detail.artifact[1], 'artifact[1] should exist');
assert.ok(Array.isArray(detail.pet), 'pet should be array');
assert.ok(detail.bloodline, 'bloodline should exist');
console.log('Verification: buildOtherPlayerDetail on VPS -> PASS');

// 2. Verify handleTopArenaCrossPlayerDetail
(async () => {
  const session = { userId: 'u_test', serverId: 1001, player: sample };
  const res = await arena.handleTopArenaCrossPlayerDetail({ playerId: sample.playerId, serverId: 1001 }, session, 1);
  assert.strictEqual(res.tag, 6217);
  assert.strictEqual(res.data.name, 'VPS_Hero');
  console.log('Verification: handleTopArenaCrossPlayerDetail on VPS -> PASS');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
"""
    with ssh.open_sftp() as sftp:
        with sftp.open('/linhhoasu/_ai_workbench/temp/vps_live_verify.js', 'w') as f:
            f.write(verify_script)

    out = run(ssh, "node /linhhoasu/_ai_workbench/temp/vps_live_verify.js")
    print(out.strip())
finally:
    ssh.close()
