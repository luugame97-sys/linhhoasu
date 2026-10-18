"""Build the Activity9 candidate while preserving the live handler bytes."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / '_ai_workbench/temp/events_full_20261004/baseline'
CAND = ROOT / '_ai_workbench/temp/events_full_20261004/candidate'

old = b"  const bought = payId > 0 && (row.recordList.includes(payId) || hasActivity9RechargeRecord(player, payId));"
new = b"  const cycleManaged = toSafeInt(row.extra && row.extra.loginPrivileges && row.extra.loginPrivileges.version, 0) >= 2;\r\n  const bought = payId > 0 && (row.recordList.includes(payId) || (!cycleManaged && hasActivity9RechargeRecord(player, payId)));"
src = (BASE / 'src/handlers/activity.js').read_bytes()
if src.count(old) != 1:
    raise SystemExit(f'expected one handler target, found {src.count(old)}')
dst = src.replace(old, new)
(CAND / 'src/handlers').mkdir(parents=True, exist_ok=True)
(CAND / 'src/handlers/activity.js').write_bytes(dst)
print('candidate bytes written', len(src), len(dst))
