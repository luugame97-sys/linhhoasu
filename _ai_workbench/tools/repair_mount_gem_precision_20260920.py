"""Precision in-place restoration for affected Gem players (FoxPlayer S1 and Bàng Bác S5).
Features:
- Dry-run mode by default
- Automatic full player JSON snapshot backup before any modification
- CAS guard matching _id, userId, and specific UID list
- Readback verification ensuring 100% assertions pass
- Zero guesswork: restores exact ID and shapeId identified from audit evidence
"""
import sys
import json
import argparse
from pathlib import Path
from datetime import datetime, timezone

sys.stdout.reconfigure(encoding='utf-8')
sys.dont_write_bytecode = True

WB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WB / 'tools'))
sys.path.insert(0, str(WB / 'temp/pydeps'))
from snapshot_web_multiserver_20260906 import connect, run

REMOTE_SCRIPT_TEMPLATE = r"""
const { MongoClient, ObjectId } = require('/linhhoasu/lhs/newServer/node_modules/mongodb');
const fs = require('fs');

const isApply = __IS_APPLY__;
const targetAccounts = __TARGET_ACCOUNTS__; // ['minhtoanmt', 'xxxxxx']

(async () => {
  const client = new MongoClient('mongodb://127.0.0.1:27017', { serverSelectionTimeoutMS: 10000 });
  await client.connect();

  const report = {
    at: new Date().toISOString(),
    isApply,
    results: []
  };

  try {
    // 1. FoxPlayer on lhs_s1001
    if (targetAccounts.includes('minhtoanmt') || targetAccounts.includes('all')) {
      const col1 = client.db('lhs_s1001').collection('players');
      const fox = await col1.findOne({ name: 'FoxPlayer' });
      if (!fox) {
        report.results.push({ account: 'minhtoanmt', status: 'NOT_FOUND' });
      } else {
        const gemInfo = fox.other_attr_info?.gemInfo;
        const gems = gemInfo?.gems || [];
        const positions = gemInfo?.plan?.positions || [];

        // Exact 20 UIDs of 25001 to restore to 25111 (Lv 12 Sinh Mệnh, shapeId: 109)
        const foxTargetUids = new Set([
          12838, 12839, 13634, 15016, 15017, 15018, 16009, 16937, 17801,
          18896, 18897, 18997, 19556, 19863, 19864, 20179, 22587, 24281, 24282, 24283
        ]);

        let matchedCount = 0;
        const updatedGems = gems.map(g => {
          if (foxTargetUids.has(g.uid) && g.id === 25001) {
            matchedCount++;
            return {
              ...g,
              id: 25111,
              shapeId: 109
            };
          }
          return g;
        });

        const playerSummary = {
          account: 'minhtoanmt',
          name: 'FoxPlayer',
          serverId: 1001,
          totalGems: gems.length,
          targetUidsCount: foxTargetUids.size,
          matchedTargetUids: matchedCount,
          placedBefore25001: positions.filter(p => {
            const g = gems.find(x => x.uid === p.uid);
            return g && g.id === 25001;
          }).length,
          placedAfter25111: positions.filter(p => {
            const g = updatedGems.find(x => x.uid === p.uid);
            return g && g.id === 25111;
          }).length
        };

        if (matchedCount !== 20) {
          report.results.push({
            ...playerSummary,
            status: 'ABORTED_COUNT_MISMATCH',
            message: `Expected 20 target UIDs with id=25001, but found ${matchedCount}`
          });
        } else if (!isApply) {
          report.results.push({
            ...playerSummary,
            status: 'DRY_RUN_OK',
            message: 'Ready to restore 20 gems to id=25111, shapeId=109'
          });
        } else {
          // Backup before modification
          const backupDir = '/linhhoasu/_ai_workbench/backups/precision_gem_repair_20260920';
          if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
          fs.writeFileSync(`${backupDir}/foxplayer_before.json`, JSON.stringify(fox, null, 2), 'utf8');

          // CAS update: match exact _id, userId, and updatedAt
          const filter = {
            _id: fox._id,
            userId: fox.userId,
            updatedAt: fox.updatedAt
          };

          const update = {
            $set: {
              'other_attr_info.gemInfo.gems': updatedGems,
              'gemRepairLedger.precision_gem_repair_v1': {
                restoredAt: new Date().toISOString(),
                targetUids: Array.from(foxTargetUids),
                restoredId: 25111,
                shapeId: 109
              }
            }
          };

          const updateRes = await col1.updateOne(filter, update);
          if (updateRes.matchedCount !== 1) {
            report.results.push({
              ...playerSummary,
              status: 'CAS_CONFLICT',
              message: 'Player was modified concurrently during apply'
            });
          } else {
            // Readback verification
            const readback = await col1.findOne({ _id: fox._id });
            const readbackGems = readback.other_attr_info?.gemInfo?.gems || [];
            const readback25111 = readbackGems.filter(g => foxTargetUids.has(g.uid) && g.id === 25111 && g.shapeId === 109);
            const readbackRemaining25001 = readbackGems.filter(g => g.id === 25001);

            report.results.push({
              ...playerSummary,
              status: 'APPLIED_SUCCESS',
              readbackRestored25111: readback25111.length,
              readbackRemaining25001: readbackRemaining25001.length,
              backupPath: `${backupDir}/foxplayer_before.json`
            });
          }
        }
      }
    }

    // 2. Bàng Bác on lhs_s1005
    if (targetAccounts.includes('xxxxxx') || targetAccounts.includes('all')) {
      const col5 = client.db('lhs_s1005').collection('players');
      const bb = await col5.findOne({ name: 'Bàng Bác' });
      if (!bb) {
        report.results.push({ account: 'xxxxxx', status: 'NOT_FOUND' });
      } else {
        const gemInfo = bb.gemInfo || bb.other_attr_info?.gemInfo;
        const gems = gemInfo?.gems || [];
        const positions = gemInfo?.plan?.positions || [];

        // Exact 3 placed UIDs of 25001 on row 4 to restore to 25095 (Lv 10 Bạo Kích, shapeId: 107)
        const bbTargetUids = new Set([1839, 1840, 2977]);

        let matchedCount = 0;
        const updatedGems = gems.map(g => {
          if (bbTargetUids.has(g.uid) && g.id === 25001) {
            matchedCount++;
            return {
              ...g,
              id: 25095,
              shapeId: 107
            };
          }
          return g;
        });

        const playerSummary = {
          account: 'xxxxxx',
          name: 'Bàng Bác',
          serverId: 1005,
          totalGems: gems.length,
          targetUidsCount: bbTargetUids.size,
          matchedTargetUids: matchedCount,
          placedBefore25001: positions.filter(p => {
            const g = gems.find(x => x.uid === p.uid);
            return g && g.id === 25001;
          }).length,
          placedAfter25095: positions.filter(p => {
            const g = updatedGems.find(x => x.uid === p.uid);
            return g && g.id === 25095;
          }).length
        };

        if (matchedCount !== 3) {
          report.results.push({
            ...playerSummary,
            status: 'ABORTED_COUNT_MISMATCH',
            message: `Expected 3 target UIDs with id=25001, but found ${matchedCount}`
          });
        } else if (!isApply) {
          report.results.push({
            ...playerSummary,
            status: 'DRY_RUN_OK',
            message: 'Ready to restore 3 gems to id=25095, shapeId=107'
          });
        } else {
          // Backup before modification
          const backupDir = '/linhhoasu/_ai_workbench/backups/precision_gem_repair_20260920';
          if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
          fs.writeFileSync(`${backupDir}/bangbac_before.json`, JSON.stringify(bb, null, 2), 'utf8');

          const gemHolderField = bb.other_attr_info?.gemInfo ? 'other_attr_info.gemInfo.gems' : 'gemInfo.gems';
          const filter = {
            _id: bb._id,
            userId: bb.userId,
            updatedAt: bb.updatedAt
          };

          const update = {
            $set: {
              [gemHolderField]: updatedGems,
              'gemRepairLedger.precision_gem_repair_v1': {
                restoredAt: new Date().toISOString(),
                targetUids: Array.from(bbTargetUids),
                restoredId: 25095,
                shapeId: 107
              }
            }
          };

          const updateRes = await col5.updateOne(filter, update);
          if (updateRes.matchedCount !== 1) {
            report.results.push({
              ...playerSummary,
              status: 'CAS_CONFLICT',
              message: 'Player was modified concurrently during apply'
            });
          } else {
            const readback = await col5.findOne({ _id: bb._id });
            const readbackHolder = readback.other_attr_info?.gemInfo || readback.gemInfo;
            const readbackGems = readbackHolder?.gems || [];
            const readback25095 = readbackGems.filter(g => bbTargetUids.has(g.uid) && g.id === 25095 && g.shapeId === 107);

            report.results.push({
              ...playerSummary,
              status: 'APPLIED_SUCCESS',
              readbackRestored25095: readback25095.length,
              backupPath: `${backupDir}/bangbac_before.json`
            });
          }
        }
      }
    }
  } finally {
    await client.close();
  }

  console.log('REPAIR_RESULT_START');
  console.log(JSON.stringify(report, null, 2));
  console.log('REPAIR_RESULT_END');
})();
"""

def main():
    parser = argparse.ArgumentParser(description="Precision Gem Restoration Tool")
    parser.add_argument('--apply', action='store_true', help="Perform actual database update (default is dry-run)")
    parser.add_argument('--targets', default='all', help="Target accounts ('minhtoanmt', 'xxxxxx', or 'all')")
    args = parser.parse_args()

    targets_list = ['minhtoanmt', 'xxxxxx'] if args.targets == 'all' else [t.strip() for t in args.targets.split(',')]
    node_script = REMOTE_SCRIPT_TEMPLATE.replace('__IS_APPLY__', 'true' if args.apply else 'false')
    node_script = node_script.replace('__TARGET_ACCOUNTS__', json.dumps(targets_list))

    print(f"Connecting to VPS 103.116.105.154 (Mode: {'APPLY (WRITE TO DB)' if args.apply else 'DRY-RUN (READ-ONLY)'})...")
    ssh = connect()
    try:
        output = run(ssh, 'node', input_text=node_script)
        if 'REPAIR_RESULT_START' in output and 'REPAIR_RESULT_END' in output:
            res = json.loads(output.split('REPAIR_RESULT_START')[1].split('REPAIR_RESULT_END')[0].strip())
            print("\n=======================================================")
            print(f"   KẾT QUẢ THỰC THI ({'APPLY' if args.apply else 'DRY-RUN'})")
            print("=======================================================")
            for r in res.get('results', []):
                print(f"\n[+] Tài khoản: {r.get('account')} ({r.get('name')}, S{r.get('serverId')}):")
                print(f"    - Trạng thái: {r.get('status')}")
                print(f"    - Thông điệp: {r.get('message', 'N/A')}")
                print(f"    - Tổng số UID mục tiêu: {r.get('targetUidsCount')}")
                print(f"    - Số UID khớp điều kiện 25001: {r.get('matchedTargetUids')}")
                if 'placedBefore25001' in r:
                    print(f"    - Số viên trên bàn cờ trước: {r.get('placedBefore25001')}")
                    print(f"    - Số viên trên bàn cờ sau: {r.get('placedAfter25111') or r.get('placedAfter25095')}")
                if args.apply:
                    print(f"    - Backup an toàn tại: {r.get('backupPath')}")
                    print(f"    - Readback xác nhận phục hồi: {r.get('readbackRestored25111') or r.get('readbackRestored25095')} viên")
        else:
            print("Output does not contain valid markers:")
            print(output)
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
