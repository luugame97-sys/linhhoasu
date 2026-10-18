from pathlib import Path
import hashlib, json, shutil

ROOT = Path(__file__).resolve().parents[2]
files = [ROOT / 'linhhoasu/webgame/game/js/main.min_drop200.js']
needle = 'Y.TaskModel.getActivityTaskDataById(t.id,i.taskId).status'
replacement = '(Y.TaskModel.getActivityTaskDataById(t.id,i.taskId)||{}).status'
stamp = '20261011'
backup = ROOT / f'_ai_workbench/backups/newyear_client_guard_pre_{stamp}'
backup.mkdir(parents=True, exist_ok=False)
report = {'files': [], 'result': 'STARTED', 'productionWrites': 0}
try:
    for path in files:
        data = path.read_bytes()
        count = data.count(needle.encode())
        if count != 1:
            raise RuntimeError(f'EXPECTED_ONE_MATCH:{path}:{count}')
        rel = path.relative_to(ROOT)
        dst = backup / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, dst)
        old_sha = hashlib.sha256(data).hexdigest()
        new_data = data.replace(needle.encode(), replacement.encode())
        path.write_bytes(new_data)
        report['files'].append({'path': str(path), 'matches': count, 'before': old_sha, 'after': hashlib.sha256(new_data).hexdigest(), 'bytes': len(new_data)})
    report['result'] = 'PATCHED_LOCAL_CANDIDATE'
except Exception as exc:
    report['result'] = 'FAILED'
    report['error'] = str(exc)
    raise
finally:
    out = ROOT / '_ai_workbench/temp/newyear_client_guard_20261011'
    out.mkdir(parents=True, exist_ok=True)
    (out / 'patch.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))
