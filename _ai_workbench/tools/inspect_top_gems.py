import json
import sys

sys.stdout.reconfigure(encoding='utf-8')
report_path = '_ai_workbench/reports/mount_gem_audit_5servers_20260920.json'
with open(report_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

targets = ['liglig', 'FoxPlayer', 'Bàng Bác', 'KORY', 'Hứa Thanh', 'ZâmCaCa', 'Lặng', 'Trần Bình An', 'FangZi', 'Shopee']

for sname, sdata in data['servers'].items():
    for g in sdata['gemIssues']:
        if g['name'] in targets:
            print(f"=== {sname}: {g['name']} (acc: {g['accountId']}, lv: {g['playerLevel']}) ===")
            print(f"  FieldCount: {g['fieldCount']}, Total Gems: {g['totalGems']}, Placed: {g['totalPlaced']}")
            print(f"  25001: placed={g['countPlaced25001']} / total={g['count25001']}")
            print(f"  Lv10 gems: {g['highGemsCount']}, Lv11+ gems: {g['lv11PlusCount']}")
            if g['lv11PlusGems']:
                print(f"  Lv11+ details: {g['lv11PlusGems']}")
            print(f"  Gem ID summary: {g['gemIdSummary']}")
            print(f"  Bag gem items: {g['bagGemItems']}")
            print(f"  Updated at: {g['updatedAt']}")
            print()
