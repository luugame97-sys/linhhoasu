"""Run the ownership-checked CrossRival QA fixture cleanup in the app runtime."""
from pathlib import Path
import shlex
from auction_ops_20261015 import connect, APP, run

ROOT=Path(__file__).resolve().parents[2]
source=(ROOT/'_ai_workbench/tools/cleanup_cross_rival_qa_20261015.js').read_text(encoding='utf-8')
client=connect()
try:
    print(run(client,'cd '+shlex.quote(APP)+" && timeout 30s node - <<'CROSS_RIVAL_QA_CLEANUP'\n"+source+'\nCROSS_RIVAL_QA_CLEANUP',timeout=35))
finally:
    client.close()
