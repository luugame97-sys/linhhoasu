import sys
from pathlib import Path

if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

sys.path.insert(0, r'i:/Linhhoasu/server/server/_ai_workbench/tools')
from snapshot_web_multiserver_20260906 import connect, run

node_code = r'''
const { MongoClient } = require('/linhhoasu/lhs/newServer/node_modules/mongodb');
(async () => {
  const m = new MongoClient('mongodb://127.0.0.1:27017');
  await m.connect();
  for (const sid of [1001, 1002, 1003, 1004, 1005]) {
    const rows = await m.db('lhs_s' + sid).collection('players')
      .find({ updatedAt: { $gt: new Date(Date.now() - 3600000) } })
      .project({ userId: 1, name: 1, items: 1, currencies: 1, rechargeInfo: 1, 'other_attr_info.oldTrekInfo': 1 })
      .toArray();
    if (rows.length > 0) {
      console.log('--- SERVER', sid, '---');
      rows.forEach(r => {
        const info = (r.other_attr_info || {}).oldTrekInfo || {};
        console.log(JSON.stringify({
          name: r.name,
          userId: r.userId,
          diamond: r.currencies?.diamond,
          gold: r.currencies?.gold,
          token1001: r.items?.['1001'],
          token1002: r.items?.['1002'],
          passRecords: info.passRecords,
        }));
      });
    }
  }
  await m.close();
})();
'''

ssh = connect()
import shlex
out = run(ssh, f"node -e {shlex.quote(node_code)}")
print(out)
ssh.close()
