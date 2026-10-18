import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
sys.dont_write_bytecode = True

WB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WB / 'tools'))
sys.path.insert(0, str(WB / 'temp/pydeps'))
from snapshot_web_multiserver_20260906 import connect, run

REMOTE_SCRIPT = r"""
const { MongoClient } = require('/linhhoasu/lhs/newServer/node_modules/mongodb');

(async () => {
  const client = new MongoClient('mongodb://127.0.0.1:27017');
  await client.connect();

  const db5 = client.db('lhs_s1005');
  const bb = await db5.collection('players').findOne({ name: 'Bàng Bác' });
  const gemInfo = bb?.gemInfo || bb?.other_attr_info?.gemInfo;
  const positions = gemInfo?.plan?.positions || [];
  const gems = gemInfo?.gems || [];
  const gemMap = new Map(gems.map(g => [g.uid, g]));

  console.log('=== BANG BAC (S5) BOARD POSITIONS ===');
  for (const pos of positions) {
    const g = gemMap.get(pos.uid);
    console.log(`pos r${pos.row}c${pos.col}: uid=${pos.uid}, id=${g ? g.id : 'missing'}, shapeId=${g ? g.shapeId : null}`);
  }

  console.log('\n=== BANG BAC (S5) ALL GEMS ===');
  for (const g of gems) {
    const isPlaced = positions.some(p => p.uid === g.uid);
    console.log(`uid=${g.uid}, id=${g.id}, placed=${isPlaced}`);
  }

  await client.close();
})();
"""

def main():
    ssh = connect()
    try:
        print(run(ssh, 'node', input_text=REMOTE_SCRIPT))
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
