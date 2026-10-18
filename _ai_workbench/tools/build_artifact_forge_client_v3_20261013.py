from pathlib import Path
import hashlib, json

root = Path(__file__).resolve().parents[2]
src = root / '_ai_workbench' / 'temp' / 'artifact_forge_20261013' / 'candidate' / 'lhs-artifact-forge-v1.js'
out = root / '_ai_workbench' / 'temp' / 'ui_freeze_20261013' / 'lhs-artifact-forge-v3.js'
text = src.read_text(encoding='utf-8')
old = "    return !!(m && m.ArtifactModel && m.ArtifactModel.getArtifactFitSkillGroupIdByData && m.ArtifactModel.getArtifactFitSkillGroupIdByData(row));"
new = "    return true;"
if text.count(old) != 1:
    raise SystemExit(f'expected forge eligibility guard once, found {text.count(old)}')
candidate = text.replace(old, new)
out.write_text(candidate, encoding='utf-8', newline='')
manifest = {'source': str(src), 'candidate': str(out), 'sourceSha256': hashlib.sha256(text.encode()).hexdigest(), 'candidateSha256': hashlib.sha256(candidate.encode()).hexdigest(), 'replacementCount': 1, 'change': 'allow valid quality/level artifact when initial skillGroup is zero'}
(out.parent / 'forge_v3_manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
print(json.dumps(manifest, indent=2))
