from pathlib import Path
import hashlib, json

root=Path(__file__).resolve().parents[2]
src=root/'_ai_workbench/temp/artifact_forge_20261013/candidate/lhs-artifact-forge-v1.js'
out=root/'_ai_workbench/temp/ui_freeze_20261013/lhs-artifact-forge-cn.js'
text=src.read_text(encoding='utf-8')
old_func="""  function forgeEligible(row) {
    var m = manager(), cfg = m && m.Config || root.Config || {};
    var base = cfg.ArtifactBaseConfig || {}, artifactCfg = cfg.ArtifactConfig && cfg.ArtifactConfig[row && row.id];
    var minQuality = base.forgeQuality == null ? 6 : Math.max(1, Number(base.forgeQuality) || 6);
    if (!row || !artifactCfg || Number(artifactCfg.quality) < minQuality) return false;
    if (Number(row.attr && row.attr.level || 0) < Number(base.forgeLevel || 20)) return false;
    if (Number(row.count || 0) >= Number(base.forgeCountMax || 7)) return false;
    if (Number(row.forgeTime || 0) > 0 && Number(row.forgeTime) <= Number((root.T && root.T.serverTimeMilli) || Date.now())) return false;
    return !!(m && m.ArtifactModel && m.ArtifactModel.getArtifactFitSkillGroupIdByData && m.ArtifactModel.getArtifactFitSkillGroupIdByData(row));
  }
"""
new_func="""  function forgeEligible(row) {
    var m = manager(), model = m && m.ArtifactModel;
    return !!(row && model && typeof model.getArtifactFitSkillGroupIdByData === 'function'
      && model.getArtifactFitSkillGroupIdByData(row));
  }
"""
if text.count(old_func)!=1: raise SystemExit('old forgeEligible block not found once')
text=text.replace(old_func,new_func)
old_block="""    if (typeof model.getAllCanForgeArtifact === 'function') {
      var originalList = model.getAllCanForgeArtifact;
      model.getAllCanForgeArtifact = function () {
        var list = originalList.apply(this, arguments) || [];
        return list.filter(forgeEligible);
      };
    }
"""
if text.count(old_block)!=1: raise SystemExit('list override block not found once')
text=text.replace(old_block,'')
candidate=text
out.write_text(candidate,encoding='utf-8',newline='')
manifest={'source':str(src),'candidate':str(out),'sourceSha256':hashlib.sha256(src.read_bytes()).hexdigest(),'candidateSha256':hashlib.sha256(candidate.encode()).hexdigest(),'removedListOverride':True,'logic':'match CN getAllCanForgeArtifact; checkArtifactCanForge uses fit skill mapping'}
(out.parent/'forge_cn_manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print(json.dumps(manifest,indent=2))
