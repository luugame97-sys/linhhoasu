"""Read-back exact installed bytes, process env, HTTP and in-memory packet probe."""
import hashlib,json,shlex,time
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect,run
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'_ai_workbench/temp/role_level2000_20260922/verification.json'
NODES={'lhs-s1001':8080,'lhs-s1002':8083,'lhs-s1003':8084,'lhs-s1004':8085,'lhs-s1005':8086}
PROBE=r'''
const fs=require('fs'),cp=require('child_process');
const pms=JSON.parse(cp.execSync('pm2 jlist',{encoding:'utf8'})).filter(x=>/^lhs-s100[1-5]$/.test(x.name));
const nodes=pms.map(p=>{const env=fs.readFileSync('/proc/'+p.pid+'/environ','utf8').split('\0');return {name:p.name,status:p.pm2_env.status,pid:p.pid,cwd:p.pm2_env.pm_cwd,role2000:env.find(s=>s.startsWith('ROLE_LEVEL_2000_ENABLED='))?.split('=')[1],customPvp:env.find(s=>s.startsWith('CUSTOM_PVP_FORMULA_ENABLED='))?.split('=')[1]};});
const p=pms.find(x=>x.name==='lhs-s1002');
for(const k of ['SERVER_ID','CONFIG_BIN_PATH','DROP_LEVEL_100_ENABLED','DROP_LEVEL_100_DISABLED','DROP_LEVEL_46_ENABLED','ROLE_LEVEL_2000_ENABLED','ROLE_LEVEL_2000_DISABLED']){const v=p.pm2_env[k]??p.pm2_env.env?.[k];if(v!=null)process.env[k]=String(v);}
const l=require.resolve('./src/logger');require.cache[l]={id:l,filename:l,loaded:true,exports:{info(){},warn(){},error(){},debug(){}}};
// Fail any accidental network/storage attempt by diagnostic code.
require('net').Socket.prototype.connect=()=>{throw Error('AUDIT_NETWORK_DENIED');};
const config=require('./src/services/ConfigService'),tables=config.loadAllTables();
const progress=require('./src/services/CultivationProgressionService');
const payload=require('./src/handlers/playerPayload');
const fixture={_id:'111111111111111111111111',name:'local-fixture-only',level:1305,exp:tables.RoleLevelConfig[1305].exp,roleInfo:{stage:45,stageId:45,kungfuId:4},serverId:1002,items:{},currencies:{},other_attr_info:{},taskInfo:{},petInfo:{pets:[]},equipInfo:{curIndex:0,equipSetMap:{0:{}}},boxInfo:{level:100,tier:10}};
const wire=payload.buildPlayer500Data(fixture);
console.log(JSON.stringify({at:new Date().toISOString(),nodes,tierCount:Object.keys(tables.BoxTierConfig).length,levels:Object.keys(tables.RoleLevelConfig).length,stages:Object.keys(tables.RoleStageConfig).length,
  maxExp:tables.RoleLevelConfig[2000]?.exp,extendedRealms:[45,46,47,48].map(id=>({id,levelMax:tables.RoleStageConfig[id]?.levelMax,tasks:tables.RoleStageConfig[id]?.taskGroup,rate:tables.RoleStageConfig[id]?.successRate,name:tables.LanguageConfig[tables.RoleStageConfig[id]?.name]?.cn})),
  nextLocked:!tables.RoleStageConfig[49]&&!tables.RoleLevelConfig[2001],metadata:progress.metadata()?.version,loginMetadata:wire.cultivation,
  systems:tables.CultivationSystemsConfig,readOnly:true,directPlayerWrites:0}));
'''
def main():
    release=json.loads((OUT.parent/'release.json').read_text(encoding='utf8'))
    ssh=connect();result={'readOnly':True,'directPlayerWrites':0,'sourceHashes':{},'readiness':{},'http':{}}
    try:
        with ssh.open_sftp() as sf:
            for rel,expected in release['files'].items():
                blob=sf.open('/linhhoasu/'+rel,'rb').read();actual=hashlib.sha256(blob).hexdigest()
                if actual!=expected['after']:raise RuntimeError('INSTALLED_DRIFT:'+rel)
                if blob!=(ROOT/'linhhoasu'/rel).read_bytes():raise RuntimeError('LOCAL_DIFF:'+rel)
                result['sourceHashes'][rel]=actual
        result['probe']=json.loads(run(ssh,'cd /linhhoasu/lhs/newServer && timeout 50s node',PROBE))
        if len(result['probe']['nodes'])!=5 or any(p['role2000']!='1' or p['status']!='online' for p in result['probe']['nodes']):raise RuntimeError('NODES_NOT_ACTIVE')
        if result['probe']['levels']!=2000 or result['probe']['stages']!=48 or not result['probe']['nextLocked']:raise RuntimeError('CONFIG_CONTRACT_FAILED')
        if result['probe'].get('loginMetadata',{}).get('version')!='cultivation_2000_v2':raise RuntimeError('LOGIN_METADATA_MISSING')
        for name,port in NODES.items():
            h=json.loads(run(ssh,f'curl -fsS --max-time 5 http://127.0.0.1:{port}/ready'))
            if h.get('status')!='ok' or not h['checks']['mongo'] or not h['checks']['redis']:raise RuntimeError('READINESS:'+name)
            result['readiness'][name]=h
        for rel in ['index.html','js/lhs-role-level2000-data-v1.js','js/lhs-role-level2000-v1.js']:
            url='http://127.0.0.1:81/'+(rel if rel!='index.html' else '')
            body=run(ssh,'curl -fsS --max-time 10 -H '+shlex.quote('Host: 103.116.105.154')+' '+shlex.quote(url))
            actual=hashlib.sha256(body.encode('utf8')).hexdigest();expected=release['files']['webgame/game/'+rel]['after']
            if actual!=expected:raise RuntimeError('HTTP_HASH_MISMATCH:'+rel)
            result['http'][rel]={'status':200,'sha256':actual}
        result['status']='ACTIVE_VERIFIED';result['at']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())
        OUT.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
        print(json.dumps({'status':result['status'],'evidence':str(OUT),'probe':result['probe']},ensure_ascii=True),flush=True)
    finally:ssh.close()
if __name__=='__main__':main()
