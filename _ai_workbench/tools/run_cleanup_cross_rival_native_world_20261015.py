from pathlib import Path
import shlex
from auction_ops_20261015 import connect, APP, run
root=Path(__file__).resolve().parents[2]
src=(root/'_ai_workbench/tools/cleanup_cross_rival_native_world_20261015.js').read_text(encoding='utf-8')
client=connect()
try: print(run(client,'cd '+shlex.quote(APP)+" && timeout 30s node - <<'CROSS_RIVAL_NATIVE_CLEANUP'\n"+src+'\nCROSS_RIVAL_NATIVE_CLEANUP',timeout=35))
finally: client.close()
