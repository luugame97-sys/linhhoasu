"""Deep analysis of all remaining players with 25001 gems on all 5 servers."""
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

  const dbs = ['lhs_s1001', 'lhs_s1002', 'lhs_s1003', 'lhs_s1004', 'lhs_s1005'];
  const candidates = [];

  for (const dbName of dbs) {
    const col = client.db(dbName).collection('players');
    const players = await col.find({
      $or: [
        { 'other_attr_info.gemInfo.gems.id': 25001 },
        { 'gemInfo.gems.id': 25001 }
      ]
    }, {
      projection: {
        _id: 1, userId: 1, accountId: 1, name: 1, level: 1,
        'other_attr_info.gemInfo': 1, gemInfo: 1, updatedAt: 1
      }
    }).toArray();

    for (const p of players) {
      // Skip FoxPlayer and Bàng Bác already repaired
      if (p.name === 'FoxPlayer' || p.name === 'Bàng Bác') continue;

      const gInfo = p.other_attr_info?.gemInfo || p.gemInfo;
      const gems = gInfo?.gems || [];
      const positions = gInfo?.plan?.positions || [];
      const placedUidSet = new Set(positions.map(pos => pos.uid));

      const gems25001 = gems.filter(g => g.id === 25001);
      const placed25001 = gems25001.filter(g => placedUidSet.has(g.uid));

      // Calculate max gem level owned
      const otherGems = gems.filter(g => g.id !== 25001);
      const maxOtherLevel = otherGems.reduce((max, g) => {
        // Estimate level from ID: 25000 + (level-1)*10 + type
        const diff = g.id - 25000;
        const lv = diff > 0 ? Math.floor(diff / 10) + 1 : 1;
        return Math.max(max, lv);
      }, 1);

      candidates.push({
        db: dbName,
        name: p.name,
        account: p.accountId,
        userId: p.userId,
        level: p.level,
        fieldCount: gInfo?.fieldCount || 30,
        totalGems: gems.length,
        total25001: gems25001.length,
        placed25001: placed25001.length,
        maxOtherLevel,
        placedDetails: placed25001.map(g => {
          const pos = positions.find(pos => pos.uid === g.uid);
          return { uid: g.uid, row: pos?.row, col: pos?.col };
        }),
        unplaced25001Uids: gems25001.filter(g => !placedUidSet.has(g.uid)).map(g => g.uid),
        updatedAt: p.updatedAt
      });
    }
  }

  console.log('CANDIDATES_START');
  console.log(JSON.stringify(candidates, null, 2));
  console.log('CANDIDATES_END');

  await client.close();
})();
"""

def main():
    ssh = connect()
    try:
        output = run(ssh, 'node', input_text=REMOTE_SCRIPT)
        if 'CANDIDATES_START' in output and 'CANDIDATES_END' in output:
            data = json.loads(output.split('CANDIDATES_START')[1].split('CANDIDATES_END')[0].strip())
            print(f"Tổng số tài khoản còn có 25001 trên 5 server: {len(data)}")
            print("\n--- PHÂN LOẠI CHI TIẾT ---")
            
            # Nhóm 1: Có ngọc 25001 ĐẶT TRÊN BÀN CỜ (Nghi vấn fallback cao nhất)
            placed_group = [c for c in data if c['placed25001'] > 0]
            print(f"\n[NHÓM 1: CÓ 25001 ĐẶT TRÊN BÀN CỜ ({len(placed_group)} tài khoản)]")
            for c in placed_group:
                print(f"  * [{c['db']}] {c['name']} (acc: {c['account']}, lv: {c['level']}): "
                      f"25001 đặt={c['placed25001']}/{c['total25001']}, Max ngọc khác=Lv{c['maxOtherLevel']}, "
                      f"Field={c['fieldCount']}, Đặt={c['placedDetails']}, Updated={c['updatedAt']}")

            # Nhóm 2: Người chơi cấp cao (Lv >= 150) có 25001 trong kho
            high_level_unplaced = [c for c in data if c['placed25001'] == 0 and c['level'] >= 150]
            print(f"\n[NHÓM 2: NGƯỜI CHƠI CẤP CAO (LV >= 150) CÓ 25001 TRONG KHO ({len(high_level_unplaced)} tài khoản)]")
            for c in high_level_unplaced:
                print(f"  * [{c['db']}] {c['name']} (acc: {c['account']}, lv: {c['level']}): "
                      f"25001 trong kho={c['total25001']}, Max ngọc khác=Lv{c['maxOtherLevel']}, "
                      f"Field={c['fieldCount']}, Updated={c['updatedAt']}")

            # Nhóm 3: Tài khoản cấp thấp (Lv < 150) chỉ có 25001 trong kho (thường là rác cấp 1 tự nhiên)
            low_level_unplaced = [c for c in data if c['placed25001'] == 0 and c['level'] < 150]
            print(f"\n[NHÓM 3: TÀI KHOẢN CẤP THẤP (LV < 150) CÓ 25001 TRONG KHO ({len(low_level_unplaced)} tài khoản)]")
            print(f"  (Đa số là ngọc cấp 1 nhặt lúc mới tạo tài khoản, max ngọc khác chỉ lv 1-5)")

    finally:
        ssh.close()

if __name__ == '__main__':
    main()
