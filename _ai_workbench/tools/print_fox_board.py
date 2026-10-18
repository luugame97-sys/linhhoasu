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

  const db1 = client.db('lhs_s1001');
  const fox = await db1.collection('players').findOne({ name: 'FoxPlayer' });
  const gemInfo = fox.other_attr_info?.gemInfo;
  const positions = gemInfo?.plan?.positions || [];
  const gems = gemInfo?.gems || [];
  const gemMap = new Map(gems.map(g => [g.uid, g]));

  console.log('=== FOXPLAYER 5x5 BOARD POSITIONS ===');
  const board = Array.from({ length: 5 }, () => Array(5).fill(null));
  for (const pos of positions) {
    const g = gemMap.get(pos.uid);
    if (pos.row < 5 && pos.col < 5) {
      board[pos.row][pos.col] = {
        uid: pos.uid,
        id: g ? g.id : 'missing',
        shapeId: g ? g.shapeId : null
      };
    }
  }

  for (let r = 0; r < 5; r++) {
    const rowStr = board[r].map((cell, c) => {
      if (!cell) return `[Empty (r${r}c${c})]`;
      return `[r${r}c${c}: uid=${cell.uid}, id=${cell.id}]`;
    }).join(' ');
    console.log(rowStr);
  }

  console.log('\n=== UNPLACED GEMS IN INVENTORY ===');
  const placedUids = new Set(positions.map(p => p.uid));
  const unplaced = gems.filter(g => !placedUids.has(g.uid));
  console.log('Total unplaced:', unplaced.length);
  for (const g of unplaced) {
    console.log(`uid=${g.uid}, id=${g.id}, shapeId=${g.shapeId}`);
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
