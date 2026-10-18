"""Generate narrowly-scoped hunks from production baseline to local checkout."""
import difflib
import json
from pathlib import Path
import sys
WB=Path(__file__).resolve().parents[1]
REL=WB/'temp/reward_release_20260905'
deployment=json.loads((REL/'deploy_20260905_063510.json').read_text(encoding='utf-8'))
lines=['*** Begin Patch']
for relative,row in deployment['files'].items():
    candidate=(REL/'app'/relative).read_text(encoding='utf-8')
    local=WB.parent/'linhhoasu/lhs/newServer'/relative
    if row['before'] is None:
        assert not local.exists(),str(local)
        lines.append('*** Add File: '+local.as_posix())
        lines.extend('+'+line for line in candidate.splitlines())
    else:
        before=(WB/'backups/reward_release_source_pre_20260905'/relative).read_text(encoding='utf-8')
        delta=list(difflib.unified_diff(before.splitlines(),candidate.splitlines(),n=3))
        if not delta:continue
        lines.append('*** Update File: '+local.as_posix())
        for line in delta[2:]:lines.append('@@' if line.startswith('@@') else line)
lines.append('*** End Patch')
sys.stdout.reconfigure(encoding='utf-8')
print('\n'.join(lines))
