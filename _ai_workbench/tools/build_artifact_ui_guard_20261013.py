from pathlib import Path
import hashlib, json

root = Path(__file__).resolve().parents[2]
src = root / '_ai_workbench' / 'temp' / 'ui_freeze_20261013' / 'main.live.js'
out = root / '_ai_workbench' / 'temp' / 'ui_freeze_20261013' / 'main.candidate.js'
text = src.read_text(encoding='utf-8')
old = 'Ane.dataChanged=function(){var t=Y.Config.ArtifactSkillConfig[this.data.id][this.data.lv||1];t.skillIds&&t.skillIds[0]&&(t=Y.Config.SkillConfig[t.skillIds[0]],this.labName.text=B.strformatByLangId(t.skillName),t=Y.ArtifactModel.getSkillQualityByLv(this.data.lv||0),this.labName.textColor=nO.getElementArtifactSkillQualityColor(t),this.imgBg.source=this.getBg(t),this.isFitImg.visible=this.data.isFit||!1,this.validateNow())}'
new = 'Ane.dataChanged=function(){var e=this.data||{},i=Y.Config&&Y.Config.ArtifactSkillConfig&&Y.Config.ArtifactSkillConfig[e.id],t=i&&i[e.lv||1];if(!t){this.visible=!1;return}this.visible=!0,t.skillIds&&t.skillIds[0]&&(t=Y.Config.SkillConfig[t.skillIds[0]],this.labName.text=B.strformatByLangId(t.skillName),t=Y.ArtifactModel.getSkillQualityByLv(this.data.lv||0),this.labName.textColor=nO.getElementArtifactSkillQualityColor(t),this.imgBg.source=this.getBg(t),this.isFitImg.visible=this.data.isFit||!1,this.validateNow())}'
count = text.count(old)
if count != 1:
    raise SystemExit(f'expected exact renderer snippet once, found {count}')
candidate = text.replace(old, new)
out.write_text(candidate, encoding='utf-8', newline='')
manifest = {
    'source': str(src), 'candidate': str(out), 'sourceSha256': hashlib.sha256(text.encode()).hexdigest(),
    'candidateSha256': hashlib.sha256(candidate.encode()).hexdigest(), 'replacementCount': count,
    'oldLength': len(old), 'newLength': len(new)
}
(out.parent / 'ui_guard_manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
print(json.dumps(manifest, indent=2))
