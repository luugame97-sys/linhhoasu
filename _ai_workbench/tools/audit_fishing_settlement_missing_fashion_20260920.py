"""Audit missing Fashion Choice Box (item 99002) for all players who received
Fishing Rank (event 6006) settlement mail on 2026-09-20 across all 5 servers.
"""
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
const configService = require('/linhhoasu/lhs/newServer/src/services/ConfigService');
configService.loadAllTables();

const rankCfg = configService.get('Activity6RankConfig')?.['6006'] || {};

function getExpectedFashionBoxCount(rank) {
  // Tra bảng Activity6RankConfig[6006]
  for (const k of Object.keys(rankCfg)) {
    const row = rankCfg[k];
    const rMin = Number(row.rankMin);
    const rMax = Number(row.rankMax);
    if (rank >= rMin && rank <= rMax) {
      const rewards = row.rewards || [];
      const fBox = rewards.find(r => Number(r.id) === 99002);
      return fBox ? Number(fBox.count) : 0;
    }
  }
  return 0;
}

(async () => {
  const client = new MongoClient('mongodb://127.0.0.1:27017');
  await client.connect();

  const servers = [
    { serverId: 1001, dbName: 'lhs_s1001', name: 'Server 1' },
    { serverId: 1002, dbName: 'lhs_s1002', name: 'Server 2' },
    { serverId: 1003, dbName: 'lhs_s1003', name: 'Server 3' },
    { serverId: 1004, dbName: 'lhs_s1004', name: 'Server 4' },
    { serverId: 1005, dbName: 'lhs_s1005', name: 'Server 5' },
  ];

  const fullReport = {};

  for (const srv of servers) {
    const db = client.db(srv.dbName);
    
    // Tìm settlement 6006 hôm nay (2026-09-20)
    const settlements = await db.collection('eventrewardsettlements').find({
      _id: { $regex: '6006' }
    }).sort({ _id: -1 }).toArray();

    // Lấy settlement gần nhất của kỳ 20/09
    const latestSettlement = settlements[0];
    const recipients = latestSettlement?.recipients || [];

    const playerAudits = [];

    for (const r of recipients) {
      const expectedBoxCount = getExpectedFashionBoxCount(r.rank);
      
      // Kiểm tra mail thực tế đã gửi cho người này
      const mail = await db.collection('mails').findOne({
        $or: [
          { _id: r.mailId },
          { eventKey: r.eventKey },
          { userId: r.userId, title: { $regex: 'câu cá', $options: 'i' }, createdAt: { $gte: new Date('2026-09-20T00:00:00Z') } }
        ]
      });

      const actualAttachments = mail?.attachments || [];
      const actualBox = actualAttachments.find(att => Number(att.id) === 99002);
      const actualBoxCount = actualBox ? Number(actualBox.count) : 0;
      const missingCount = Math.max(0, expectedBoxCount - actualBoxCount);

      const playerDoc = await db.collection('players').findOne({ userId: r.userId }, {
        projection: { name: 1, level: 1, 'items.99002': 1 }
      });

      playerAudits.push({
        rank: r.rank,
        name: r.name,
        userId: r.userId,
        playerId: r.playerId,
        score: r.score,
        mailId: mail?._id || r.mailId,
        mailClaimed: !!mail?.claimed,
        expectedFashionBox99002: expectedBoxCount,
        actualSentInMail: actualBoxCount,
        missingFashionBox99002: missingCount,
        currentInventory99002: playerDoc?.items?.[99002] ?? 0
      });
    }

    fullReport[srv.name] = {
      serverId: srv.serverId,
      settlementId: latestSettlement?._id,
      settlementState: latestSettlement?.state,
      totalRecipients: recipients.length,
      affectedCount: playerAudits.filter(p => p.missingFashionBox99002 > 0).length,
      players: playerAudits
    };
  }

  await client.close();

  console.log('AUDIT_FISHING_START');
  console.log(JSON.stringify(fullReport, null, 2));
  console.log('AUDIT_FISHING_END');
})();
"""

def main():
    ssh = connect()
    try:
        out = run(ssh, 'node', input_text=REMOTE_SCRIPT)
        if 'AUDIT_FISHING_START' in out and 'AUDIT_FISHING_END' in out:
            data = json.loads(out.split('AUDIT_FISHING_START')[1].split('AUDIT_FISHING_END')[0].strip())
            total_affected = 0
            total_missing_boxes = 0
            print("==================================================================")
            print("  KẾT QUẢ KIỂM TRA QUÀ TOP CÂU CÁ BỊ THIẾU RƯƠNG THỜI TRANG 99002")
            print("==================================================================")
            for sname, sinfo in data.items():
                affected = sinfo.get('affectedCount', 0)
                tot = sinfo.get('totalRecipients', 0)
                sid = sinfo.get('settlementId', 'N/A')
                print(f"\n[+] {sname} (Settlement: {sid}):")
                print(f"    - Tổng số người nhận thưởng xếp hạng: {tot}")
                print(f"    - Số người bị thiếu Rương thời trang 99002: {affected}")
                for p in sinfo.get('players', []):
                    total_affected += 1
                    total_missing_boxes += p['missingFashionBox99002']
                    claimed_str = "ĐÃ NHẬN THƯ" if p['mailClaimed'] else "CHƯA NHẬN THƯ"
                    print(f"      * Top {p['rank']}: {p['name']} (Thiếu: {p['missingFashionBox99002']} Rương 99002) | Trạng thái: {claimed_str} | Kho hiện có: {p['currentInventory99002']}")
            print("\n==================================================================")
            print(f"  TỔNG KẾT TOÀN BỘ 5 MÁY CHỦ:")
            print(f"  - Tổng số người chơi bị thiếu quà: {total_affected}")
            print(f"  - Tổng số Rương thời trang 3 sao (99002) bị thiếu: {total_missing_boxes}")
            print("==================================================================")
        else:
            print(out)
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
