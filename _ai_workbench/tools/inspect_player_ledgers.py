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
  console.log('=== FOX PLAYER DETAILS ===');
  console.log('gemBoxRepairLedger:', JSON.stringify(fox.gemBoxRepairLedger));
  console.log('featureReceipts:', JSON.stringify(fox.other_attr_info?.featureReceipts));
  console.log('record keys:', Object.keys(fox.other_attr_info?.record || {}));
  console.log('itemUseRecords:', JSON.stringify(fox.itemUseRecords || {}));
  console.log('recent mail claims:', JSON.stringify((fox.mailClaimLedger || []).slice(-10)));

  const db5 = client.db('lhs_s1005');
  const bb = await db5.collection('players').findOne({ name: 'Bàng Bác' });
  console.log('=== BANG BAC (S5) DETAILS ===');
  console.log('gemBoxRepairLedger:', JSON.stringify(bb?.gemBoxRepairLedger));
  console.log('featureReceipts:', JSON.stringify(bb?.other_attr_info?.featureReceipts));
  console.log('itemUseRecords:', JSON.stringify(bb?.itemUseRecords || {}));
  console.log('recent mail claims:', JSON.stringify((bb?.mailClaimLedger || []).slice(-10)));

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
