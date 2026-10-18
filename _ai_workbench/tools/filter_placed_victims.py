import json
import sys

sys.stdout.reconfigure(encoding='utf-8')
report_path = '_ai_workbench/reports/mount_gem_audit_5servers_20260920.json'
with open(report_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

print("=========================================================================")
print("  DANH SÁCH TẤT CẢ NGƯỜI CHƠI CÓ NGỌC 25001 TRÊN BÀN CỜ (PLACED > 0)    ")
print("=========================================================================")

placed_victims = []

for sname, sdata in data['servers'].items():
    for g in sdata['gemIssues']:
        if g['countPlaced25001'] > 0:
            placed_victims.append({
                'server': sname,
                'name': g['name'],
                'accountId': g['accountId'],
                'userId': g['userId'],
                'level': g['playerLevel'],
                'fieldCount': g['fieldCount'],
                'placed25001': g['countPlaced25001'],
                'total25001': g['count25001'],
                'lv10Gems': g['highGemsCount'],
                'lv11PlusGems': g['lv11PlusCount'],
                'placedUids': g['placedUids25001'],
                'updatedAt': g['updatedAt']
            })

for v in placed_victims:
    print(f"[{v['server']}] {v['name']} (acc: {v['accountId']}, lv: {v['level']})")
    print(f"  - Số ngọc 25001 trên bàn cờ: {v['placed25001']} viên (Tổng số 25001: {v['total25001']} viên)")
    print(f"  - Số ngọc cấp 10: {v['lv10Gems']}, Cấp 11+: {v['lv11PlusGems']}")
    print(f"  - Ô mở bàn cờ: {v['fieldCount']}")
    print(f"  - Vị trí các viên 25001 trên bàn cờ: {v['placedUids']}")
    print(f"  - Cập nhật lúc: {v['updatedAt']}")
    print()

print(f"==> TỔNG CỘNG CÓ {len(placed_victims)} TÀI KHOẢN CÓ NGỌC 25001 ĐẶT TRÊN BÀN CỜ.")
