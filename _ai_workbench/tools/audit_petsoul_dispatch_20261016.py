"""Download exact live dispatch source/config for isolated, read-only checks."""
import hashlib
import json
import shlex
from pathlib import Path
from skin_incident_remote import connect, run

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench/temp/petsoul_dispatch_audit_20261016'
APP = '/linhhoasu/lhs/newServer'

PROBE = r'''
const fs=require('fs'),cp=require('child_process'),crypto=require('crypto');
const app='/linhhoasu/lhs/newServer';
const ps=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8',maxBuffer:16*1024*1024,timeout:15000}));
const nodes=ps.filter(p=>/^lhs-s\d+$/.test(p.name));
const selected=['SERVER_ID','DEFAULT_SERVER_ID','CONFIG_BIN_PATH','ROLE_LEVEL_2000_ENABLED','DROP_LEVEL_100_ENABLED','DROP_LEVEL_200_ENABLED','FASHION_CONTENT_OVERLAY_PATH','FASHION_CHOICE_OVERLAY_PATH','FASHION_CHOICE_STARS_OVERLAY_PATH'];
for(const k of selected){const e=nodes.find(p=>p.name==='lhs-s1001').pm2_env; const v=e[k]??e.env?.[k];if(v!=null)process.env[k]=String(v);}
const cfg=require(app+'/src/services/ConfigService'),all=cfg.loadAllTables();
const names=['PetSoulConfig','PetSoulUpgradeConfig','PetSoulBaseConfig','PetSoulQualityConfig','PetSoulRefiningConfig','PetSoulLifeSkillConfig','SpecSpiritBaseConfig','SpecSpiritPetSoulConfig'];
const tables={};for(const k of names)tables[k]=all[k];
tables.SystemConfig=Object.fromEntries([231,232].map(k=>[k,all.SystemConfig[k]]));
const ids=new Set([261,459,460,461,462,94511,94512,94513,94514]);
for(const row of Object.values(tables.SpecSpiritPetSoulConfig||{}))for(const r of row.rewards||[])ids.add(r.id);
tables.AssetsConfig=Object.fromEntries([...ids].map(k=>[k,all.AssetsConfig[k]]));
tables.LanguageConfig={};const lang=all.LanguageConfig||{};
for(const r of Object.values(tables.AssetsConfig))if(r){tables.LanguageConfig[r.name]=lang[r.name];tables.LanguageConfig[r.desc]=lang[r.desc];}
for(const k of Object.keys(lang))if(Number(k)>=30108040&&Number(k)<=30108050||Number(k)>=30150065&&Number(k)<=30150075)tables.LanguageConfig[k]=lang[k];
const source=fs.readFileSync('/linhhoasu/webgame/game/js/main.min_drop200.js','utf8');
const needles=['PetSoulAssignData=','getCacheRewardCount=function','updatePetSoulCacheRewardCount=function','onClickPetSoulCacheRewardBtn=function','cs_pet_soul_dispatch=function','PetSoulAssignRewardTipItem','sc_pet_soul_dispatch_update=function','regNetMsg(6902'];
const client={};for(const n of needles){const i=source.indexOf(n);client[n]={offset:i,text:i<0?'':source.slice(Math.max(0,i-100),i+1800)};}
const result={at:new Date().toISOString(),productionWrites:0,nodes:nodes.map(p=>({name:p.name,pid:p.pid,cwd:p.pm2_env.pm_cwd,script:p.pm2_env.pm_exec_path,status:p.pm2_env.status,config:p.pm2_env.CONFIG_BIN_PATH??p.pm2_env.env?.CONFIG_BIN_PATH})),tables,client};
process.stdout.write('AUDIT_JSON:'+JSON.stringify(result),()=>process.exit(0));
'''

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    hashes={}
    with connect() as ssh:
        with ssh.open_sftp() as sftp:
            for rel,name in [('src/handlers/pet-soul.js','pet-soul.js'),('src/config/petSoulRewards.js','petSoulRewards.js'),('src/handlers/raid.js','raid.js')]:
                with sftp.open(APP+'/'+rel,'rb') as f: data=f.read()
                (OUT/name).write_bytes(data)
                hashes[name]=hashlib.sha256(data).hexdigest()
        output=run(ssh,'node -e '+shlex.quote(PROBE))
    report=json.loads(output.split('AUDIT_JSON:',1)[1]);report['sourceHashes']=hashes
    (OUT/'live.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(json.dumps({'at':report['at'],'nodes':report['nodes'],'sourceHashes':hashes,'tables':list(report['tables']),'output':str(OUT/'live.json')},ensure_ascii=False))

if __name__=='__main__':main()
