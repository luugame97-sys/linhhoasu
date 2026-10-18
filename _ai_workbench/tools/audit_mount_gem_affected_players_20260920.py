"""Audit all players on 5 servers (S1-S5) for Mount (Sword) and Gem issues.
Read-only script: does NOT modify any player or server data.
Outputs a structured JSON and prints detailed analysis.
"""
import sys
import json
from pathlib import Path

# Ensure UTF-8 output
sys.stdout.reconfigure(encoding='utf-8')
sys.dont_write_bytecode = True

WB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WB / 'tools'))
sys.path.insert(0, str(WB / 'temp/pydeps'))
from snapshot_web_multiserver_20260906 import connect, run

REMOTE_NODE_SCRIPT = r"""
const { MongoClient } = require('/linhhoasu/lhs/newServer/node_modules/mongodb');

(async () => {
  const client = new MongoClient('mongodb://127.0.0.1:27017', { serverSelectionTimeoutMS: 10000 });
  await client.connect();

  const dbs = ['lhs_s1001', 'lhs_s1002', 'lhs_s1003', 'lhs_s1004', 'lhs_s1005'];
  const result = {
    auditAt: new Date().toISOString(),
    servers: {}
  };

  for (const dbName of dbs) {
    const col = client.db(dbName).collection('players');
    const players = await col.find({}, {
      projection: {
        _id: 1, userId: 1, playerId: 1, accountId: 1, name: 1, level: 1,
        swordInfo: 1,
        'other_attr_info.gemInfo': 1,
        gemInfo: 1,
        items: 1,
        currencies: 1,
        updatedAt: 1,
        createdAt: 1
      }
    }).toArray();

    const serverData = {
      dbName,
      totalPlayers: players.length,
      mountIssues: [],
      gemIssues: [],
      topPlayersSummary: []
    };

    for (const p of players) {
      // 1. Audit Mount (Sword)
      const swords = p.swordInfo?.data || [];
      const highSwords = swords.filter(s => (Number(s.level) >= 150));
      const hasMountIssue = highSwords.length > 0;
      if (hasMountIssue) {
        serverData.mountIssues.push({
          userId: p.userId,
          playerId: p.playerId,
          accountId: p.accountId,
          name: p.name,
          playerLevel: p.level,
          equippedUid: p.swordInfo?.equippedUid,
          highSwords: highSwords.map(s => ({
            uid: s.uid,
            id: s.id,
            level: Number(s.level),
            star: Number(s.star || 0),
            quality: Number(s.quality || 0),
            isEquipped: s.uid === p.swordInfo?.equippedUid
          })),
          updatedAt: p.updatedAt
        });
      }

      // 2. Audit Gem (Hồn ngọc)
      const gemInfo = p.gemInfo || p.other_attr_info?.gemInfo;
      let hasGemIssue = false;
      let gemDetail = null;

      if (gemInfo) {
        const gems = Array.isArray(gemInfo.gems) ? gemInfo.gems : [];
        const positions = Array.isArray(gemInfo.plan?.positions) ? gemInfo.plan.positions : [];
        const placedUidSet = new Set(positions.map(pos => pos.uid));

        // Group gems by ID and level
        const gemIdCounts = {};
        let count25001 = 0;
        let countPlaced25001 = 0;
        const highGems = []; // Level >= 10 (id >= 25091)
        const lv12Gems = []; // Level 12 (id: 25111..25116)
        const lv11PlusGems = []; // Level 11+ (id >= 25101)

        for (const g of gems) {
          const gid = Number(g.id || 0);
          gemIdCounts[gid] = (gemIdCounts[gid] || 0) + 1;
          const isPlaced = placedUidSet.has(g.uid);

          if (gid === 25001) {
            count25001++;
            if (isPlaced) countPlaced25001++;
          }
          if (gid >= 25091 && gid <= 25096) {
            highGems.push({ uid: g.uid, id: gid, isPlaced, shapeId: g.shapeId });
          }
          if (gid >= 25101) {
            lv11PlusGems.push({ uid: g.uid, id: gid, isPlaced, shapeId: g.shapeId });
          }
          if (gid >= 25111 && gid <= 25116) {
            lv12Gems.push({ uid: g.uid, id: gid, isPlaced, shapeId: g.shapeId });
          }
        }

        // Potential victim of fallback:
        // A player with multiple 25001 (placed >= 1 or total 25001 >= 3, or level >= 100 with 25001)
        // Note: Starter gems are [25002, 25003, 25003]. 25001 does NOT appear in starter gems!
        // So ANY 25001 came from compose, drop, or fallback!
        // But if placed on board, or if count >= 5, or if player has high fieldCount (> 30), it's highly suspicious.
        const isSuspicious = (countPlaced25001 > 0) || (count25001 >= 3) || (Number(p.level) >= 100 && count25001 >= 1) || (highGems.length > 0) || (lv11PlusGems.length > 0);

        if (isSuspicious) {
          hasGemIssue = true;
          gemDetail = {
            userId: p.userId,
            playerId: p.playerId,
            accountId: p.accountId,
            name: p.name,
            playerLevel: p.level,
            fieldCount: Number(gemInfo.fieldCount || 30),
            totalGems: gems.length,
            totalPlaced: positions.length,
            count25001,
            countPlaced25001,
            placedUids25001: positions.filter(pos => {
              const g = gems.find(x => x.uid === pos.uid);
              return g && g.id === 25001;
            }).map(pos => ({ uid: pos.uid, row: pos.row, col: pos.col })),
            highGemsCount: highGems.length,
            highGems,
            lv11PlusCount: lv11PlusGems.length,
            lv11PlusGems,
            gemIdSummary: gemIdCounts,
            bagGemItems: Object.entries(p.items || {})
              .filter(([k]) => {
                const id = Number(k);
                return (id >= 25000 && id <= 26000) || id === 90076 || id === 90077 || id === 90078;
              })
              .map(([k, v]) => ({ itemId: Number(k), count: Number(v) })),
            updatedAt: p.updatedAt
          };
          serverData.gemIssues.push(gemDetail);
        }
      }

      // Record top players summary for context
      if (Number(p.level) >= 200) {
        serverData.topPlayersSummary.push({
          name: p.name,
          accountId: p.accountId,
          level: p.level,
          hasMountIssue,
          hasGemIssue
        });
      }
    }

    result.servers[dbName] = serverData;
  }

  console.log('AUDIT_RESULT_START');
  console.log(JSON.stringify(result));
  console.log('AUDIT_RESULT_END');

  await client.close();
})();
"""

def main():
    print("Connecting to VPS 103.116.105.154...")
    ssh = connect()
    try:
        print("Running comprehensive multi-server audit...")
        output = run(ssh, 'node', input_text=REMOTE_NODE_SCRIPT)
        if 'AUDIT_RESULT_START' in output and 'AUDIT_RESULT_END' in output:
            raw_json = output.split('AUDIT_RESULT_START')[1].split('AUDIT_RESULT_END')[0].strip()
            data = json.loads(raw_json)
            
            # Save report to workbench
            out_file = WB / 'reports' / 'mount_gem_audit_5servers_20260920.json'
            out_file.parent.mkdir(parents=True, exist_ok=True)
            out_file.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
            print(f"Audit JSON saved to: {out_file}")

            # Print Summary
            print("\n========================================================")
            print("                 BÁO CÁO AUDIT 5 SERVER                ")
            print("========================================================")
            for dbName, sdata in data.get('servers', {}).items():
                print(f"\n--- {dbName} (Tổng: {sdata['totalPlayers']} người chơi) ---")
                print(f"  [+] Người chơi có Thú cưỡi >= 150: {len(sdata['mountIssues'])}")
                for m in sdata['mountIssues']:
                    sw_str = ", ".join([f"UID {s['uid']} (Lv {s['level']}, Sao {s['star']})" for s in m['highSwords']])
                    print(f"      * {m['name']} (acc: {m['accountId']}, lv: {m['playerLevel']}): {sw_str}")

                print(f"  [+] Người chơi có dấu hiệu Hồn ngọc (25001 bất thường hoặc ngọc cao): {len(sdata['gemIssues'])}")
                # Sort gem issues by countPlaced25001 desc, then highGemsCount desc
                sorted_gems = sorted(sdata['gemIssues'], key=lambda x: (x['countPlaced25001'], x['count25001'], x['highGemsCount']), reverse=True)
                for g in sorted_gems:
                    if g['countPlaced25001'] > 0 or g['count25001'] >= 5 or g['highGemsCount'] > 0 or g['lv11PlusCount'] > 0 or g['playerLevel'] >= 100:
                        print(f"      * {g['name']} (acc: {g['accountId']}, lv: {g['playerLevel']}): "
                              f"Ô mở={g['fieldCount']}, Đặt={g['totalPlaced']}, "
                              f"25001 đặt bàn={g['countPlaced25001']}/{g['count25001']} tổng, "
                              f"Ngọc lv10={g['highGemsCount']}, Ngọc lv11+={g['lv11PlusCount']}")
        else:
            print("Audit output did not contain valid markers:")
            print(output[:2000])
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
