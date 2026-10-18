"""Send an isolated QA script on stdin; never stage or edit live service files."""
import base64
import json
from pathlib import Path
from release_petsoul_day1_20261007 import connect

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench/temp/fulu_qa_20261008/qa'
candidate = ROOT / '_ai_workbench/temp/fulu_qa_20261008/candidate/lhs/newServer/src/services/Activity52TaskService.js'
script = ROOT / '_ai_workbench/tools/test_fulu_followup_mongo_20261008.js'
source = 'const FULU_CANDIDATE_BASE64=' + json.dumps(base64.b64encode(candidate.read_bytes()).decode()) + ';\n' + script.read_text(encoding='utf-8')
with connect() as client:
    stdin, stdout, stderr = client.exec_command("NODE_ENV=test LOG_DIR='' node -", timeout=60)
    stdin.write(source)
    stdin.channel.shutdown_write()
    output = stdout.read().decode('utf-8', 'replace')
    error = stderr.read().decode('utf-8', 'replace')
    code = stdout.channel.recv_exit_status()
    rows = [line.split('=', 1)[1] for line in output.splitlines() if line.startswith('FULU_FOLLOWUP_REPORT=')]
    if not rows:
        raise RuntimeError('NO_QA_REPORT: ' + error[-1500:])
    report = json.loads(rows[-1])
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'server_followup_mongo.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False))
    if code or report.get('result') != 'PASS' or not report.get('cleanup'):
        raise SystemExit(1)
