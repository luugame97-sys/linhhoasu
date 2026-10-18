"""Snapshot exact in-scope production baselines and inspect config; no remote writes."""
import hashlib,json,sys
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect,run
ROOT=Path(__file__).resolve().parents[2]
BACKUP=ROOT/'_ai_workbench/backups/box_tier100_20260922'
OUT=ROOT/'_ai_workbench/temp/box_tier100_20260922'
FILES=['lhs/newServer/src/config/dropLevel100.js','lhs/newServer/src/handlers/box.js','lhs/newServer/src/handlers/compat.js','lhs/newServer/src/handlers/account.js','lhs/newServer/src/handlers/playerPayload.js','webgame/game/js/main.min_drop100.js','webgame/game/index.html','lhs/newServer/src/handlers/official-compat.js']
SCRIPT=r'''
const fs=require('fs'),cp=require('child_process');
const pm=JSON.parse(cp.execSync('pm2 jlist',{encoding:'utf8'})).filter(x=>/^lhs-s100[1-5]$/.test(x.name));
for(const k of ['SERVER_ID','CONFIG_BIN_PATH','DROP_LEVEL_100_ENABLED','DROP_LEVEL_100_DISABLED','DROP_LEVEL_46_ENABLED']){const v=pm[0].pm2_env[k]??pm[0].pm2_env.env?.[k];if(v!=null)process.env[k]=String(v)}
const lp=require.resolve('./src/logger');require.cache[lp]={id:lp,filename:lp,loaded:true,exports:{info(){},warn(){},error(){},debug(){}}};
const c=require('./src/services/ConfigService'),all=c.loadAllTables();
const lang=c.decodeTables(fs.readFileSync('/linhhoasu/webgame/game/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin')).LanguageConfig;
const text=id=>lang[id]||id,btn=c.get('FashionBtnConfig');const ids=Object.values(btn).map(x=>x.id);
const refs=[];
function walk(v,path){if(!v||typeof v!=='object')return;if(!Array.isArray(v)&&ids.includes(v.id)&&path.length>1)refs.push({path:path.join('.'),row:v});for(const[k,x]of Object.entries(v))if(x&&typeof x==='object')walk(x,path.concat(k));}
for(const[n,t]of Object.entries(all))if(!['AssetsConfig','FashionBtnConfig','FashionConfig','LanguageConfig'].includes(n))walk(t,[n]);
const targets={};for(const n of ['RoleLevelConfig','RoleStageConfig','DungeonConfig','DungeonBossConfig','MapConfig']){const t=c.get(n)||{};targets[n]={count:Object.keys(t).length,max:Math.max(0,...Object.keys(t).map(Number).filter(Number.isFinite)),last:Object.values(t).slice(-2)};}
console.log(JSON.stringify({at:new Date().toISOString(),readOnly:true,pm:pm.map(x=>({name:x.name,cwd:x.pm2_env.pm_cwd,status:x.pm2_env.status})),boxTiers:c.get('BoxTierConfig'),targets,
themes:Object.values(btn).map(b=>{const a=c.get('AssetsConfig')[b.id],f=c.get('FashionConfig')[b.id];return{button:b,asset:a,fashion:f,name:text(a?.name),desc:text(a?.desc),themeDesc:text(b.desc),use:c.get('AssetsUseConfig')[b.id]};}),references:refs,
taskLanguage:Object.fromEntries([20070007,20070107,20070207,20070210].map(id=>[id,text(id)])),levelRows:Object.values(c.get('RoleLevelConfig')||{}).slice(-1)}));
'''
def sha(b):return hashlib.sha256(b).hexdigest()
def main():
    BACKUP.mkdir(parents=True,exist_ok=True);OUT.mkdir(parents=True,exist_ok=True)
    ssh=connect();manifest={}
    try:
        with ssh.open_sftp() as sf:
            for rel in FILES:
                remote='/linhhoasu/'+rel
                data=sf.open(remote,'rb').read();dest=BACKUP/'remote'/rel;dest.parent.mkdir(parents=True,exist_ok=True)
                if dest.exists() and dest.read_bytes()!=data:raise RuntimeError('BASELINE_DRIFT:'+rel)
                dest.write_bytes(data)
                local=ROOT/'linhhoasu'/rel;candidate=BACKUP/'candidate_before_review'/rel;candidate.parent.mkdir(parents=True,exist_ok=True)
                if local.exists() and not candidate.exists():candidate.write_bytes(local.read_bytes())
                manifest[rel]={'sha256':sha(data),'bytes':len(data),'mode':sf.stat(remote).st_mode&0o777}
        info=json.loads(run(ssh,'cd /linhhoasu/lhs/newServer && node',SCRIPT))
    finally:ssh.close()
    (OUT/'baseline.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf8')
    (OUT/'config_audit.json').write_text(json.dumps(info,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(json.dumps({'backup':str(BACKUP),'files':len(manifest),'themes':info['themes'],'references':info['references'],'targets':info['targets'],'taskLanguage':info['taskLanguage']},ensure_ascii=True))
if __name__=='__main__':main()
