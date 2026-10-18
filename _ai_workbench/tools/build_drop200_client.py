import json, subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / '_ai_workbench/temp/drop200_original_20261007/baseline/webgame/game/js/main.min_drop200.js'
OUTPUT = ROOT / 'linhhoasu/webgame/game/js/main.min_drop200.js'
s = BASE.read_text(encoding='utf-8')
start = s.index('m.applyDrop46Config=function anonymous(serverId')
end = s.index('},m.onPlayerInfo=', start)
js = "const p=require('./linhhoasu/lhs/newServer/src/config/dropLevel100'),d=require('./linhhoasu/lhs/newServer/src/config/demonBossDrop200');console.log(JSON.stringify({level:p.extendTables.toString(),tier:p.extendBoxTier200.toString(),demon:d.extend.toString()}));"
functions = json.loads(subprocess.check_output(['node', '-e', js], cwd=ROOT, encoding='utf-8'))
level_fn = functions['level']
block = '''m.applyDrop46Config=function anonymous(serverId
) {
if ([1001,1002,1003,1004,1005,1006,1007].indexOf(Number(serverId)) < 0) return;
var VERSION='drop200_original_v1',TIER_VERSION='drop_tier200_original_v1',MAX_LEVEL=200,MAX_TIER=200;
function clone(value){return JSON.parse(JSON.stringify(value));}
var extendBoxTier200=TIER_FN;
var extendDemonBoss=function(tables){var VERSION='demon_boss_drop200_original_v1',MAX_STAGE=172;return(DEMON_FN)(tables);};
var meta=(LEVEL_FN)(Y.Config);
if (Y.Config.DemonBossConfig && Y.Config.DemonBossConfig[48]) extendDemonBoss(Y.Config);
Object.keys(meta.qualityNames).forEach(function(q){x.EQUIP_QUALITY_NAME[q]=meta.qualityNames[q];});
Object.keys(meta.qualityNames).forEach(function(q){['QUAILTY_COLOR','QUAILTY_STROKE_COLOR','QUAILTY_COLOR_LIGHT'].forEach(function(key){if(x[key])x[key][q]=x[key][Y.Config.QualityConfig[q].qualityBg];});});
U9.qualityData=Array.from({length:198},function(_,i){return i+2;});
U9.maxQualityData=Array.from({length:193},function(_,i){return i+7;});
'''.replace('TIER_FN', functions['tier']).replace('LEVEL_FN', level_fn).replace('DEMON_FN', functions['demon'])
output = s[:start] + block + s[end:]
old = '{index:t,speedUp:n,count:s,pos:{x:e.x,y:e.y},sellAllEquipments:!!(U9.isOpen&&U9.autoConfig.sellAllEquipments)});this.Rpc(2e3,t,'
new = '{index:t,speedUp:n,count:s,pos:{x:e.x,y:e.y}});this.Rpc(2e3,t,'
assert output.count(old) == 1
output = output.replace(old, new)
# Patch only the original native Yêu Vương consumers. The code is already
# inside the main closure and preserves native controls/rewards/realm gates.
old_view = 'for(t in e)e[t].roleStageId<=r&&i.push({nowStage:a,cleanOutTime:s,stageData:e[t],backOldMutl:Gp.checkRaidCanGetMutl(9),rewardFindBackMutl:Hp.checkRaidCanGetMutl(9)});'
new_view = 'for(t in e){var d=e[t],g=Number(d.stageId||t);if(g<=r){if(g<=48)i.push({nowStage:a,cleanOutTime:s,stageData:d,backOldMutl:Gp.checkRaidCanGetMutl(9),rewardFindBackMutl:Hp.checkRaidCanGetMutl(9)});else i.push({nowStage:g<=a?48:g===a+1?47:46,cleanOutTime:s,stageData:d,bossStageId:g,backOldMutl:Gp.checkRaidCanGetMutl(9),rewardFindBackMutl:Hp.checkRaidCanGetMutl(9)});}}'
assert output.count(old_view) == 1
output = output.replace(old_view, new_view)
old_title = 'i=Y.RoleModel.getNameByStage(e),n=(this.titleLabel.text=i,'
new_title = 'i=this.data.stageData.displayName||Y.RoleModel.getNameByStage(e),n=(this.titleLabel.text=i,'
assert output.count(old_title) == 1
output = output.replace(old_title, new_title)
old_sweep = 'Y.RaidInfoModel.sendCleanOutDemonBoss(this.data.stageData.roleStageId)'
new_sweep = 'Y.RaidInfoModel.sendCleanOutDemonBoss(Number(this.data.bossStageId||this.data.stageData.stageId||this.data.stageData.roleStageId))'
assert output.count(old_sweep) == 1
output = output.replace(old_sweep, new_sweep)
OUTPUT.write_bytes(output.encode('utf-8'))
print(json.dumps({'output': str(OUTPUT), 'bytes': OUTPUT.stat().st_size}))
