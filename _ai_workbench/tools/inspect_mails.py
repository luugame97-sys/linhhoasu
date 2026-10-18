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
const { MongoClient, ObjectId } = require('/linhhoasu/lhs/newServer/node_modules/mongodb');

(async () => {
  const client = new MongoClient('mongodb://127.0.0.1:27017');
  await client.connect();

  const db1 = client.db('lhs_s1001');
  const fox = await db1.collection('players').findOne({ name: 'FoxPlayer' });
  const mailIds = (fox.mailClaimLedger || []).map(id => {
    try { return new ObjectId(id); } catch(_) { return id; }
  });

  const mails = await db1.collection('mails').find({ _id: { $in: mailIds } }).toArray();
  console.log('=== FOX PLAYER MAILS (Total found: ' + mails.length + ') ===');
  for (const m of mails) {
    console.log(`Mail: title="${m.title}", sendTime=${m.sendTime || m.createTime || m.createdAt}, attachments=${JSON.stringify(m.attachments)}`);
  }

  // Also check all mails sent to FoxPlayer's userId
  const directMails = await db1.collection('mails').find({
    $or: [{ userId: fox.userId }, { playerId: fox.playerId }, { receiverId: fox.userId }]
  }).toArray();
  console.log('\n=== DIRECT MAILS TO FOX PLAYER (' + directMails.length + ') ===');
  for (const m of directMails) {
    console.log(`DirectMail: title="${m.title}", attachments=${JSON.stringify(m.attachments)}`);
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
