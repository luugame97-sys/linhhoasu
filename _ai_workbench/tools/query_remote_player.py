import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from snapshot_web_multiserver_20260906 import connect, run

s = connect()
node_code = """
const { MongoClient } = require('mongodb');
async function main() {
  const client = new MongoClient('mongodb://127.0.0.1:27017');
  await client.connect();
  const db = client.db('lhs_game_1001');
  const p = await db.collection('players').findOne({ $or: [{ name: 'Talo' }, { account: 'vanduc97' }] });
  if (!p) {
    console.log('Player not found! First player:', await db.collection('players').findOne({}, { projection: { name: 1, account: 1, username: 1 } }));
    return;
  }
  console.log('PLAYER:', p.name, p.account);
  console.log('EQUIPS:', JSON.stringify(p.petInfo?.equips));
  console.log('PETS:', JSON.stringify(p.petInfo?.pets?.map(x => ({ uid: x.uid, id: x.id, level: x.level }))));
  await client.close();
}
main();
"""
import shlex
cmd = "cd /linhhoasu/lhs/newServer && node -e " + shlex.quote(node_code)
out = run(s, cmd)
print(out)
s.close()
