"""Scoped pet grid/fast merge release: candidate QA, CAS, rolling gates."""
import hashlib,json,shlex,sys,time
from datetime import datetime,timezone
from pathlib import Path
from skin_incident_remote import connect,run
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'_ai_workbench/temp/pet_grid48_20261005'
APP='/linhhoasu/lhs/newServer'
GAME='/linhhoasu/webgame/game'
MANIFEST=OUT/'deployment.json'
NODES=[('lhs-s1001',8080),('lhs-s1002',8083),('lhs-s1003',8084),('lhs-s1004',8085),('lhs-s1005',8086),('lhs-s1006',8087),('lhs-s1007',8088)]
def save(m):MANIFEST.write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def sha(b):return hashlib.sha256(b).hexdigest()
def rh(s,p):return run(s,'sha256sum '+shlex.quote(p)+" | awk '{print $1}'").strip()
def exists(s,p):return run(s,'test -e '+shlex.quote(p)+' && echo yes || echo no').strip()=='yes'
def processes(s):
    return json.loads(run(s,'node -',"const a=JSON.parse(require('child_process').execFileSync('pm2',['jlist'],{encoding:'utf8'}));console.log(JSON.stringify(a.map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,started:p.pm2_env.pm_uptime}))))"))
def ready(s,port):
    for i in range(25):
        try:
            b=json.loads(run(s,f'curl -fsS --max-time 4 http://127.0.0.1:{port}/ready'))
            if b.get('status')=='ok' and b.get('checks',{}).get('mongo') is True and b.get('checks',{}).get('redis') is True:return {'http':200,'body':b,'attempts':i+1}
        except Exception:pass
        time.sleep(2)
    raise RuntimeError('READINESS_FAILED:'+str(port))
def loader(s,m,candidate):
    mapping={('/linhhoasu/'+r):m['stage']+'/candidate/'+r for r in m['files'] if r.startswith('lhs/')}
    if not candidate:mapping={}
    src="""const fs=require('fs'),path=require('path'),Module=require('module'),cp=require('child_process'),map=MAP;
const read=fs.readFileSync;fs.readFileSync=function(file,...args){return read.call(this,map[String(file)]||file,...args)};
const resolve=Module._resolveFilename;Module._resolveFilename=function(request,parent,...args){try{return resolve.call(this,request,parent,...args)}catch(e){const f=request.startsWith('.')&&parent?path.resolve(path.dirname(parent.filename),request):request;if(e.code==='MODULE_NOT_FOUND'&&map[f+'.js'])return f+'.js';throw e}};
const app=APP;const pm=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'})).find(p=>p.name==='lhs-s1001');
const env={...require(app+'/node_modules/dotenv').parse(read(app+'/.env')),...pm.pm2_env.env,...pm.pm2_env};for(const k of ['CONFIG_BIN_PATH','ROLE_LEVEL_2000_ENABLED','DROP_LEVEL_46_ENABLED','DROP_LEVEL_100_ENABLED','FASHION_CONTENT_OVERLAY_PATH','FASHION_CHOICE_OVERLAY_PATH','FASHION_CHOICE_STARS_OVERLAY_PATH'])if(env[k]!=null)process.env[k]=String(env[k]);
const lp=require.resolve(app+'/src/logger');require.cache[lp]={exports:{info(){},warn(){},error(){},debug(){}}};
const deny=()=>{throw Error('QA_NETWORK_DENIED')};require('net').Socket.prototype.connect=deny;require('tls').connect=deny;for(const n of ['http','https']){require(n).request=deny;require(n).get=deny}global.fetch=deny;
""".replace('MAP',json.dumps(mapping)).replace('APP;',json.dumps(APP)+';')
    p=m['stage']+('/candidate-loader.js' if candidate else '/installed-loader.js')
    with s.open_sftp() as sf:
        with sf.open(p,'wb') as h:h.write(src.encode('utf-8'))
    return p
def tests(s,m,candidate):
    l=loader(s,m,candidate)
    data={}
    for name in ['test_pet_grid48_server_20261005.js','test_client.js']:
        env='FEATURE_APP='+shlex.quote(APP)+' PET_GRID_SKINS='+shlex.quote(m['stage']+'/skins.json')+' PET_GRID_MAIN='+shlex.quote(GAME+'/js/main.min_drop100.js')+' PET_GRID_CLIENT='+shlex.quote(m['stage']+'/candidate/webgame/game/js/lhs-pet-grid48-v1.js' if candidate else GAME+'/js/lhs-pet-grid48-v1.js')
        raw=run(s,env+' node -r '+shlex.quote(l)+' '+shlex.quote(m['stage']+'/'+name))
        obj=json.loads(raw);data[name]=obj
        if 'checks' not in obj:raise RuntimeError('TEST_RESULT_INVALID:'+name)
    config=run(s,'node -r '+shlex.quote(l)+' -',"const c=require("+json.dumps(APP+'/src/services/ConfigService')+");c.loadAllTables();const b=c.get('PetBaseConfig');if(b.initialField!==48||b.fieldMax!==48||b.fieldConsume.length!==0||b.freeFieldCount!==48)throw Error('GRID_CONFIG_WRONG');console.log(JSON.stringify({initialField:b.initialField,fieldMax:b.fieldMax,fieldConsume:b.fieldConsume,freeFieldCount:b.freeFieldCount}))")
    data['runtimeConfig']=json.loads(config)
    m['candidateTests' if candidate else 'installedTests']=data;save(m)
    print(json.dumps({'step':'tests','candidate':candidate,'result':data},ensure_ascii=False),flush=True)
def install(s,m,rel):
    r=m['files'][rel];p='/linhhoasu/'+rel
    before=r['before']
    if before:
        if rh(s,p)!=before:raise RuntimeError('CAS:'+rel)
        b=m['backup']+'/'+rel;run(s,'mkdir -p '+shlex.quote(b.rsplit('/',1)[0])+' && cp -p '+shlex.quote(p)+' '+shlex.quote(b))
    elif exists(s,p):raise RuntimeError('NEW_FILE_EXISTS:'+rel)
    temp=p+'.pet-grid48-next';run(s,'mkdir -p '+shlex.quote(p.rsplit('/',1)[0])+' && cp '+shlex.quote(m['stage']+'/candidate/'+rel)+' '+shlex.quote(temp))
    if before:run(s,'chown --reference='+shlex.quote(p)+' '+shlex.quote(temp)+' && chmod --reference='+shlex.quote(p)+' '+shlex.quote(temp))
    else:
        reference=APP+'/src/handlers/pet.js' if rel.startswith('lhs/') else GAME+'/js/lhs-petsoul-fix-v1.js'
        run(s,'chown --reference='+shlex.quote(reference)+' '+shlex.quote(temp)+' && chmod --reference='+shlex.quote(reference)+' '+shlex.quote(temp))
    run(s,'mv '+shlex.quote(temp)+' '+shlex.quote(p))
    if rh(s,p)!=r['after']:raise RuntimeError('INSTALLED_HASH:'+rel)
    m['installed'].append(rel);save(m)
def main():
    mode=sys.argv[1] if len(sys.argv)>1 else 'stage'
    OUT.mkdir(parents=True,exist_ok=True)
    with connect() as s:
        if mode in ['stage','restage']:
            specs=json.loads((OUT/'candidate_files.json').read_text(encoding='utf-8'))
            if mode=='stage':
                if MANIFEST.exists():raise RuntimeError('MANIFEST_EXISTS')
                stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
                m={'status':'STAGING','stage':'/linhhoasu/_ai_workbench/temp/pet_grid48_'+stamp,'backup':'/linhhoasu/_ai_workbench/backups/pet_grid48_'+stamp,'files':specs,'installed':[],'restarted':[],'readiness':{},'directPlayerWrites':0,'beforeProcesses':processes(s)}
            else:
                m=json.loads(MANIFEST.read_text(encoding='utf-8'))
                if m['status'] not in ['STAGING','STAGED']:raise RuntimeError('CANNOT_RESTAGE')
                m['files']=specs;m['status']='STAGING'
            save(m)
            for rel,r in specs.items():
                if r['before'] and rh(s,'/linhhoasu/'+rel)!=r['before']:raise RuntimeError('BASELINE_DRIFT:'+rel)
                if not r['before'] and exists(s,'/linhhoasu/'+rel):raise RuntimeError('NEW_FILE_EXISTS:'+rel)
            run(s,'mkdir -p '+shlex.quote(m['stage']))
            upload={('candidate/'+r):(OUT/'candidate'/r).read_bytes() for r in specs}
            upload['test_pet_grid48_server_20261005.js']=(ROOT/'_ai_workbench/tools/test_pet_grid48_server_20261005.js').read_bytes()
            upload['test_client.js']=(OUT/'client/test_client.js').read_bytes()
            upload['skins.json']=(OUT/'skins.json').read_bytes()
            with s.open_sftp() as sf:
                for rel,b in upload.items():
                    target=m['stage']+'/'+rel;run(s,'mkdir -p '+shlex.quote(target.rsplit('/',1)[0]))
                    with sf.open(target,'wb') as h:h.write(b)
                    if rh(s,target)!=sha(b):raise RuntimeError('STAGE_HASH:'+rel)
                    if rel.endswith('.js'):run(s,'node --check '+shlex.quote(target))
            tests(s,m,True)
            if processes(s)!=m['beforeProcesses']:raise RuntimeError('LIVE_STATE_CHANGED_DURING_QA')
            m['status']='STAGED';save(m);print(json.dumps({'status':m['status'],'stage':m['stage']}),flush=True);return
        m=json.loads(MANIFEST.read_text(encoding='utf-8'))
        if mode=='deploy':
            if m['status']!='STAGED':raise RuntimeError('NOT_STAGED')
            m['predeployReady']={str(p):ready(s,p) for _,p in NODES};m['predeployProcesses']=processes(s);save(m)
            for rel in m['files']:
                if rel=='webgame/game/index.html':continue
                install(s,m,rel)
            m['status']='INSTALLED';save(m)
        elif mode!='resume':raise RuntimeError('UNKNOWN_MODE')
        if m['status'] not in ['INSTALLED','ROLLING']:raise RuntimeError('NOT_INSTALLED')
        try:
            for name,port in NODES:
                if name in m['restarted']:continue
                m['status']='ROLLING';m['restarted'].append(name);save(m);print(json.dumps({'step':'restart','node':name}),flush=True)
                run(s,'pm2 restart '+shlex.quote(name));m['readiness'][str(port)]=ready(s,port);save(m)
                if len(m['restarted'])==1:tests(s,m,False)
                print(json.dumps({'step':'ready','node':name}),flush=True)
            if 'webgame/game/index.html' in m['files'] and 'webgame/game/index.html' not in m['installed']:install(s,m,'webgame/game/index.html')
            m['finalReady']={str(p):ready(s,p) for _,p in NODES}
            m['afterProcesses']=processes(s)
            old={p['name']:p for p in m['predeployProcesses'] if not p['name'].startswith('lhs-s100')}
            new={p['name']:p for p in m['afterProcesses'] if p['name'] in old}
            if old!=new:raise RuntimeError('UNRELATED_PROCESS_CHANGED')
            for rel,r in m['files'].items():
                if rh(s,'/linhhoasu/'+rel)!=r['after']:raise RuntimeError('FINAL_HASH:'+rel)
            m['status']='DEPLOYED_NEEDS_NATIVE_UI';m['finishedAt']=datetime.now(timezone.utc).isoformat();save(m)
            print(json.dumps({'status':m['status'],'backup':m['backup']}),flush=True)
        except Exception as e:
            m['error']=str(e);m['status']='HOLD';save(m);raise
if __name__=='__main__':main()
