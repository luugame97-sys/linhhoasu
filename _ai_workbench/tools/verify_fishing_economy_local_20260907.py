"""Report local source parity, without overwriting local unrelated deltas."""
import json
from stage_fishing_economy_20260907 import ROOT,FILES
from snapshot_web_multiserver_20260906 import WB
out=[]
for rel in FILES:
 a=(WB.parent/'linhhoasu/lhs/newServer'/rel).read_text(encoding='utf-8')
 b=(ROOT/'app'/rel).read_text(encoding='utf-8')
 out.append({'file':rel,'sameContent':a==b})
(ROOT/'local-source-parity.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out))
