"""Read-only scoped runtime backup; never load/save player documents."""
import hashlib,json
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect,run
ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'_ai_workbench/backups/role_level2000_20260922'
OUT=ROOT/'_ai_workbench/temp/role_level2000_20260922'
FILES=['lhs/newServer/src/services/ConfigService.js','lhs/newServer/src/handlers/upgrade.js','lhs/newServer/src/handlers/raid.js','lhs/newServer/src/handlers/playerPayload.js','lhs/newServer/src/services/RealmTaskProgressService.js','webgame/game/index.html','webgame/game/js/main.min_drop100.js']
PROBE=r'''
const fs=require('fs'),cp=require('child_process'),crypto=require('crypto');
const pm=JSON.parse(cp.execSync('pm2 jlist',{encoding:'utf8'})).filter(p=>/^lhs-s100[1-5]$/.test(p.name));
const p=pm.find(p=>p.name==='lhs-s1001');if(!p)throw Error('S1_MISSING');
const keys=['SERVER_ID','CONFIG_BIN_PATH','DROP_LEVEL_100_ENABLED','DROP_LEVEL_100_DISABLED','DROP_LEVEL_46_ENABLED','FASHION_CONTENT_OVERLAY_PATH','FASHION_CHOICE_OVERLAY_PATH','FASHION_CHOICE_STARS_OVERLAY_PATH','ROLE_LEVEL_2000_ENABLED'];
for(const k of keys){const v=p.pm2_env[k]??p.pm2_env.env?.[k];if(v!=null)process.env[k]=String(v);}
const lp=require.resolve('./src/logger');require.cache[lp]={id:lp,filename:lp,loaded:true,exports:{info(){},warn(){},error(){},debug(){}}};
const c=require('./src/services/ConfigService'),tables=c.loadAllTables();
const lang=c.decodeTables(fs.readFileSync('/linhhoasu/webgame/game/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin')).LanguageConfig;
const stages=Object.values(tables.RoleStageConfig).sort((a,b)=>a.id-b.id);
const names=Object.fromEntries(stages.map(s=>[s.name,lang[s.name]]));
console.log(JSON.stringify({at:new Date().toISOString(),directPlayerWrites:0,
 pm:pm.map(p=>({name:p.name,status:p.pm2_env.status,cwd:p.pm2_env.pm_cwd,env:Object.fromEntries(keys.map(k=>[k,p.pm2_env[k]??p.pm2_env.env?.[k]??null]))})),
 stages,levels:Object.values(tables.RoleLevelConfig).slice(-12),
 stageTaskTemplates:Object.fromEntries([40044,40144,40244].map(id=>[id,tables.TaskConfig[id]])),
 smallPills:tables.RoleStageConfig[44].itemIds.map(id=>tables.AssetsConfig[id]),
 bigPills:tables.RoleStageConfig[42].itemIds.map(id=>({...tables.AssetsConfig[id],replacement:tables.AssetsConfig[id+100]})),
 levelMax:Math.max(...Object.values(tables.LevelConfig).map(r=>r.id)),
 lastBoss:tables.DemonBossConfig[45],lastMonster:tables.MonsterConfig[200045],lastAlchemy:tables.AlchemyFormulaConfig[121511],names,
 idCollisions:{tasks:[45,46,47,48,49,50,51,52,53].flatMap(s=>[980000+s*10,980001+s*10,980002+s*10]).filter(id=>tables.TaskConfig[id]),language:[...Array(54)].map((_,i)=>39802001+i).filter(id=>lang[id])}}));
'''
def digest(b):return hashlib.sha256(b).hexdigest()
def main():
    OUT.mkdir(parents=True,exist_ok=True);manifest={}
    ssh=connect()
    try:
        with ssh.open_sftp() as sf:
            for rel in FILES:
                data=sf.open('/linhhoasu/'+rel,'rb').read();stat=sf.stat('/linhhoasu/'+rel)
                dest=BASE/'remote'/rel;dest.parent.mkdir(parents=True,exist_ok=True)
                if dest.exists() and dest.read_bytes()!=data:raise RuntimeError('BACKUP_DRIFT:'+rel)
                if not dest.exists():dest.write_bytes(data)
                local=ROOT/'linhhoasu'/rel
                if local.exists():
                    destLocal=BASE/'local'/rel;destLocal.parent.mkdir(parents=True,exist_ok=True)
                    if not destLocal.exists():destLocal.write_bytes(local.read_bytes())
                manifest[rel]={'sha256':digest(data),'mode':stat.st_mode&0o777,'uid':stat.st_uid,'gid':stat.st_gid,'bytes':len(data),'localSame':local.exists() and local.read_bytes()==data}
        result=json.loads(run(ssh,'cd /linhhoasu/lhs/newServer && timeout 50s node',PROBE))
    finally:ssh.close()
    (OUT/'baseline.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf8')
    (OUT/'baseline_config.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(json.dumps({'backup':str(BASE),'files':manifest,'maxStage':result['stages'][-1]['id'],'levelMax':result['levels'][-1]['lv'],'idCollisions':result['idCollisions']},ensure_ascii=True))
if __name__=='__main__':main()
