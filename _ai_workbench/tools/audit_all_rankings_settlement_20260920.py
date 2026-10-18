"""Read-only audit of all leaderboard and ranking settlement systems across all 5 servers.
Checks:
1. All Settlement collections: ArenaSettlement, CrossEventSettlement, EventRewardSettlement
   - Check for failed states, pending leases, errors in lastError field
   - Verify recent settlements, delivery rates, and attached items
2. Configuration integrity of all Ranking Reward Tables in server runtime:
   - ArenaDayRankRewardConfig, ArenaWeeklyRankRewardConfig
   - TopCombatDayRankRewardConfig, TopCombatWeeklyRankRewardConfig
   - CrossArenaDayRankRewardConfig, CrossArenaWeeklyRankRewardConfig
   - Activity44RankConfig (Kim Mã), Activity6RankConfig (Câu Cá), Activity14RankConfig, Activity33RankConfig
   - HorseRaceRankingRewardConfig, CrossRivalScoreRankRewardConfig
   - GuildBattleRankConfig, TowerRankRewardConfig, DoubleTowerRankRewardsConfig
   - Verify every reward item exists in AssetsConfig/ItemConfig and count > 0
3. Check recent ranking reward mails across all 5 databases
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

const assetsConfig = configService.get('AssetsConfig') || {};
const itemConfig = configService.get('ItemConfig') || {};

function checkItemValid(id) {
  const numId = Number(id);
  if (numId <= 0) return false;
  // Các item cơ bản hợp lệ
  if ([1, 2, 3, 4, 6, 7, 8, 20, 50, 65, 71].includes(numId)) return true;
  if (assetsConfig[numId] || assetsConfig[String(numId)]) return true;
  if (itemConfig[numId] || itemConfig[String(numId)]) return true;
  return false;
}

function auditRankConfigTable(tableName, tableData) {
  if (!tableData || typeof tableData !== 'object') {
    return { status: 'MISSING_OR_EMPTY', issues: ['Table not found in ConfigService'] };
  }

  const issues = [];
  let bracketCount = 0;

  function checkRewardsArray(rewards, path) {
    if (!Array.isArray(rewards) || rewards.length === 0) {
      issues.push(`${path}: rewards array is empty or not an array`);
      return;
    }
    rewards.forEach((r, idx) => {
      const id = Number(r && r.id);
      const count = Number(r && r.count);
      if (!Number.isSafeInteger(id) || id <= 0) {
        issues.push(`${path}[${idx}]: invalid item ID ${r?.id}`);
      } else if (!checkItemValid(id)) {
        issues.push(`${path}[${idx}]: item ID ${id} NOT FOUND in AssetsConfig/ItemConfig`);
      }
      if (!Number.isSafeInteger(count) || count <= 0) {
        issues.push(`${path}[${idx}]: invalid count ${r?.count}`);
      }
    });
  }

  // Một số bảng là object đa tầng (ví dụ Activity6RankConfig[6006][bracketKey])
  // Một số bảng là object 1 tầng (ArenaDayRankRewardConfig[rankKey])
  Object.entries(tableData).forEach(([k1, v1]) => {
    if (!v1 || typeof v1 !== 'object') return;
    if (v1.rewards) {
      bracketCount++;
      checkRewardsArray(v1.rewards, `${tableName}[${k1}]`);
    } else {
      Object.entries(v1).forEach(([k2, v2]) => {
        if (!v2 || typeof v2 !== 'object') return;
        if (v2.rewards) {
          bracketCount++;
          checkRewardsArray(v2.rewards, `${tableName}[${k1}][${k2}]`);
        }
      });
    }
  });

  return {
    status: issues.length === 0 ? 'OK' : 'HAS_ISSUES',
    totalBrackets: bracketCount,
    issues
  };
}

(async () => {
  const client = new MongoClient('mongodb://127.0.0.1:27017', { serverSelectionTimeoutMS: 10000 });
  await client.connect();

  const servers = [
    { serverId: 1001, dbName: 'lhs_s1001', name: 'Server 1' },
    { serverId: 1002, dbName: 'lhs_s1002', name: 'Server 2' },
    { serverId: 1003, dbName: 'lhs_s1003', name: 'Server 3' },
    { serverId: 1004, dbName: 'lhs_s1004', name: 'Server 4' },
    { serverId: 1005, dbName: 'lhs_s1005', name: 'Server 5' },
  ];

  // 1. Audit các bảng cấu hình xếp hạng trong game
  const TABLES_TO_AUDIT = [
    'ArenaDayRankRewardConfig',
    'ArenaWeeklyRankRewardConfig',
    'TopCombatDayRankRewardConfig',
    'TopCombatWeeklyRankRewardConfig',
    'CrossArenaDayRankRewardConfig',
    'CrossArenaWeeklyRankRewardConfig',
    'Activity44RankConfig',
    'Activity6RankConfig',
    'Activity14RankConfig',
    'Activity33RankConfig',
    'HorseRaceRankingRewardConfig',
    'CrossRivalScoreRankRewardConfig',
    'GuildBattleRankConfig',
    'TowerRankRewardConfig',
    'DoubleTowerRankRewardsConfig',
    'TempleGameRankConfig',
    'BidKingRankConfig'
  ];

  const configAuditResults = {};
  for (const tName of TABLES_TO_AUDIT) {
    const tData = configService.get(tName);
    configAuditResults[tName] = auditRankConfigTable(tName, tData);
  }

  // 2. Audit Database Settlements và Mails trên cả 5 server
  const serverDbAudits = {};

  for (const srv of servers) {
    const db = client.db(srv.dbName);

    // a) ArenaSettlements
    const arenaSettlements = await db.collection('arenasettlements').find({}).sort({ _id: -1 }).limit(5).toArray();
    const arenaIssues = arenaSettlements.filter(s => s.state !== 'done' || (s.lastError && s.lastError.length > 0));

    // b) CrossEventSettlements
    const crossSettlements = await db.collection('crosseventsettlements').find({}).sort({ _id: -1 }).limit(5).toArray();
    const crossIssues = crossSettlements.filter(s => s.state !== 'done' || (s.lastError && s.lastError.length > 0));

    // c) EventRewardSettlements (Kim Mã, Câu cá...)
    const eventSettlements = await db.collection('eventrewardsettlements').find({}).sort({ _id: -1 }).limit(10).toArray();
    const eventIssues = eventSettlements.filter(s => s.state !== 'done' || (s.lastError && s.lastError.length > 0));

    // d) Kiểm tra thư xếp hạng có rỗng attachments không
    const emptyAttachmentMails = await db.collection('mails').find({
      $or: [
        { title: { $regex: 'xếp hạng|thưởng ngày|thưởng tuần|võ đạo|đỉnh phong|câu cá|kim mã', $options: 'i' } }
      ],
      $or: [
        { attachments: { $exists: false } },
        { attachments: { $size: 0 } },
        { attachments: null }
      ]
    }).limit(10).toArray();

    serverDbAudits[srv.name] = {
      serverId: srv.serverId,
      arena: {
        totalRecent: arenaSettlements.length,
        abnormal: arenaIssues.map(s => ({ id: s._id, state: s.state, error: s.lastError })),
        latest: arenaSettlements[0] ? { id: arenaSettlements[0]._id, state: arenaSettlements[0].state, period: arenaSettlements[0].period } : null
      },
      crossEvent: {
        totalRecent: crossSettlements.length,
        abnormal: crossIssues.map(s => ({ id: s._id, state: s.state, error: s.lastError })),
        latest: crossSettlements[0] ? { id: crossSettlements[0]._id, state: crossSettlements[0].state } : null
      },
      eventReward: {
        totalRecent: eventSettlements.length,
        abnormal: eventIssues.map(s => ({ id: s._id, state: s.state, error: s.lastError })),
        latest: eventSettlements[0] ? { id: eventSettlements[0]._id, state: eventSettlements[0].state, recipients: eventSettlements[0].recipients?.length } : null
      },
      emptyMailsFound: emptyAttachmentMails.length,
      emptyMailsSample: emptyAttachmentMails.map(m => ({ id: m._id, userId: m.userId, title: m.title, createdAt: m.createdAt }))
    };
  }

  await client.close();

  console.log('AUDIT_RANKINGS_START');
  console.log(JSON.stringify({ configAuditResults, serverDbAudits }, null, 2));
  console.log('AUDIT_RANKINGS_END');
})();
"""

def main():
    ssh = connect()
    try:
        out = run(ssh, 'node', input_text=REMOTE_SCRIPT)
        if 'AUDIT_RANKINGS_START' in out and 'AUDIT_RANKINGS_END' in out:
            data = json.loads(out.split('AUDIT_RANKINGS_START')[1].split('AUDIT_RANKINGS_END')[0].strip())
            
            print("==================================================================")
            print("  AUDIT TOÀN DIỆN CÁC BẢNG XẾP HẠNG & KẾT TOÁN TRÊN 5 SERVER")
            print("==================================================================")
            
            print("\n[PHẦN 1: KIỂM TRA TÍNH TOÀN VẸN CẤU HÌNH PHẦN THƯỞNG BXH]")
            cfg = data.get('configAuditResults', {})
            for tname, tinfo in cfg.items():
                st = tinfo.get('status')
                br = tinfo.get('totalBrackets', 0)
                issues = tinfo.get('issues', [])
                if st == 'OK':
                    print(f"  [OK] {tname:32} : {br} mốc thưởng | 100% item hợp lệ")
                else:
                    print(f"  [CẢNH BÁO] {tname:26} : {st} ({len(issues)} lỗi)")
                    for iss in issues[:5]:
                        print(f"      - {iss}")

            print("\n[PHẦN 2: KIỂM TRA LỊCH SỬ KẾT TOÁN (SETTLEMENTS) TRÊN 5 SERVER]")
            srvs = data.get('serverDbAudits', {})
            for sname, sdata in srvs.items():
                print(f"\n[+] {sname} (ID: {sdata['serverId']}):")
                
                # Arena
                ar = sdata.get('arena', {})
                ar_abn = ar.get('abnormal', [])
                ar_lat = ar.get('latest')
                ar_lat_str = f"'{ar_lat.get('id')}' [{ar_lat.get('state')}]" if ar_lat else 'Chưa có'
                print(f"    - Võ Đạo Hội (Arena): Gần nhất {ar_lat_str} | Lỗi bất thường: {len(ar_abn)}")
                
                # CrossEvent
                cr = sdata.get('crossEvent', {})
                cr_abn = cr.get('abnormal', [])
                cr_lat = cr.get('latest')
                cr_lat_str = f"'{cr_lat.get('id')}' [{cr_lat.get('state')}]" if cr_lat else 'Chưa có'
                print(f"    - Đỉnh Phong (CrossArena): Gần nhất {cr_lat_str} | Lỗi bất thường: {len(cr_abn)}")
                
                # EventReward
                ev = sdata.get('eventReward', {})
                ev_abn = ev.get('abnormal', [])
                ev_lat = ev.get('latest')
                ev_lat_str = f"'{ev_lat.get('id')}' [{ev_lat.get('state')}]" if ev_lat else 'Chưa có'
                print(f"    - Sự Kiện Tuần Hoàn (Kim Mã, Câu Cá): Gần nhất {ev_lat_str} | Lỗi bất thường: {len(ev_abn)}")
                
                # Empty mails
                em = sdata.get('emptyMailsFound', 0)
                print(f"    - Thư xếp hạng có đính kèm rỗng (attachments = 0): {em}")
                if em > 0:
                    for sm in sdata.get('emptyMailsSample', []):
                        print(f"        * Mail: {sm['title']} (ID: {sm['id']}, User: {sm['userId']}, At: {sm['createdAt']})")

            print("\n==================================================================")
        else:
            print(out)
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
