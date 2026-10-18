"""Investigate fishing rank rewards and fashion box delivery across all 5 servers."""
import sys
import json
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

  const servers = ['lhs_s1001', 'lhs_s1002', 'lhs_s1003', 'lhs_s1004', 'lhs_s1005'];

  for (const s of servers) {
    const db = client.db(s);
    const mails = await db.collection('mails').find({
      $or: [
        { title: { $regex: 'câu cá', $options: 'i' } },
        { content: { $regex: 'câu cá', $options: 'i' } }
      ]
    }).sort({ createdAt: -1 }).limit(10).toArray();

    console.log(`=== ${s}: Tìm thấy ${mails.length} thư câu cá gần nhất ===`);
    for (const m of mails) {
      console.log(`Mail ID: ${m._id} | UserId: ${m.userId} | Title: ${m.title}`);
      console.log(`  Claimed: ${m.claimed} | CreatedAt: ${m.createdAt}`);
      console.log(`  Attachments: ${JSON.stringify(m.attachments)}`);
      
      const p = await db.collection('players').findOne({ userId: m.userId }, {
        projection: { name: 1, 'items.99002': 1, 'items.29040': 1, 'items.99001': 1, fashionInfo: 1 }
      });
      console.log(`  Player: ${p?.name} | items[99002]: ${p?.items?.[99002]} | items[99001]: ${p?.items?.[99001]} | items[29040]: ${p?.items?.[29040]}`);
    }

    // Kiểm tra thêm các bản ghi Settlement
    const settlements = await db.collection('eventrewardsettlements').find({
      _id: { $regex: '6006' }
    }).sort({ _id: -1 }).limit(5).toArray();
    console.log(`--- ${s}: Settlement records (6006) count = ${settlements.length} ---`);
    for (const st of settlements) {
      console.log(`  Settlement: ${st._id} | state: ${st.state} | recipients: ${st.recipients?.length}`);
      if (st.recipients?.length) {
        console.log(`    Sample recipient: ${st.recipients[0].name}, rank: ${st.recipients[0].rank}, attachments: ${JSON.stringify(st.recipients[0].attachments)}`);
      }
    }
  }

  await client.close();
})();
"""

def main():
    ssh = connect()
    try:
        out = run(ssh, 'node', input_text=REMOTE_SCRIPT)
        print(out)
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
