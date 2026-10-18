import json
import sys

sys.stdout.reconfigure(encoding='utf-8')
report_path = '_ai_workbench/reports/mount_gem_audit_5servers_20260920.json'
with open(report_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

print("=== TẤT CẢ TÀI KHOẢN CÓ >= 3 VIÊN 25001 (KỂ CẢ TRONG KHO) TRÊN 5 SERVER ===")
for sname, sdata in data['servers'].items():
    for g in sdata['gemIssues']:
        if g['count25001'] >= 3:
            print(f"[{sname}] {g['name']} (acc: {g['accountId']}, lv: {g['playerLevel']})")
            print(f"  Total 25001: {g['count25001']}, Placed: {g['countPlaced25001']}, Lv10: {g['highGemsCount']}, Lv11+: {g['lv11PlusCount']}, Field: {g['fieldCount']}")
            print(f"  Gem ID summary: {g['gemIdSummary']}")
            print(f"  Updated at: {g['updatedAt']}")
            print()
