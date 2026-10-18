"""Stage/test a feature release without modifying live source or player state."""
import hashlib
import json
import shlex
import sys
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

sys.dont_write_bytecode = True
WB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WB / 'temp/pydeps'))
from snapshot_web_multiserver_20260906 import connect, run

OUT = WB / 'temp/feature_unlock_release_20260917'
APP = '/linhhoasu/lhs/newServer'
GAME = '/linhhoasu/webgame/game'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def state(ssh):
    rows = json.loads(run(ssh, 'pm2 jlist'))
    return [{'name':r['name'],'pid':r['pid'],'status':r['pm2_env']['status'],
             'restarts':r['pm2_env']['restart_time']} for r in rows if r['name'].startswith('lhs-')]


def candidate_files():
    files = {}
    baseline = read_json(OUT / 'baseline.json')['files']
    for kind, remote in [('server', APP), ('client', GAME)]:
        root = OUT / 'candidate' / kind
        for source in root.rglob('*'):
            if not source.is_file():
                continue
            rel = source.relative_to(root).as_posix()
            if source.suffix not in ('.js', '.json', '.html'):
                continue
            target = remote + '/' + rel
            data = source.read_bytes()
            old = baseline.get(target, {}).get('sha256')
            if digest(data) == old:
                continue
            files[kind + '/' + rel] = {'path':target,'data':data,'before':old,'sha256':digest(data)}
    return files


def preconditions(ssh, files):
    with ssh.open_sftp() as sftp:
        for entry in files.values():
            try:
                current = sftp.open(entry['path'], 'rb').read()
                actual = digest(current)
            except FileNotFoundError:
                actual = None
            if actual != entry['before']:
                raise RuntimeError('LIVE_BASELINE_DRIFT:' + entry['path'])


def put(ssh, remote, data):
    run(ssh, 'install -d -m 700 ' + shlex.quote(str(PurePosixPath(remote).parent)))
    with ssh.open_sftp() as sftp:
        with sftp.open(remote, 'wb') as stream:
            stream.write(data)
        if digest(sftp.open(remote, 'rb').read()) != digest(data):
            raise RuntimeError('STAGE_HASH_MISMATCH:' + remote)


def stage(ssh):
    files = candidate_files()
    if not files:
        raise RuntimeError('NO_CANDIDATE_CHANGES')
    preconditions(ssh, files)
    previous = OUT / 'stage.json'
    if previous.exists():
        manifest = read_json(previous)
        remote = manifest['stage']
        if not remote.startswith('/linhhoasu/_ai_workbench/temp/feature_unlock_'):
            raise RuntimeError('UNEXPECTED_STAGE_PATH')
    else:
        stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
        remote = '/linhhoasu/_ai_workbench/temp/feature_unlock_' + stamp
        manifest = {'stage':remote,'createdAt':datetime.now(timezone.utc).isoformat()}
    before = state(ssh)
    mapping = {}
    for rel, row in files.items():
        put(ssh, remote + '/' + rel, row['data'])
        if rel.startswith('server/'):
            mapping[row['path']] = remote + '/' + rel
    loader = r'''"use strict";
const fs=require('fs'),path=require('path'),Module=require('module'),mapping=__MAPPING__,app=__APP__;
const originalResolve=Module._resolveFilename,originalExtensions={...Module._extensions};
Module._resolveFilename=function(request,parent,...rest){
 let target=request;
 if(request.startsWith('../src/')&&parent&&parent.filename.startsWith(__STAGE__+'/tests/'))target=app+'/'+request.slice(3);
 try{return originalResolve.call(this,target,parent,...rest);}catch(error){
  const abs=target.startsWith('.')&&parent?path.resolve(path.dirname(parent.filename),target):target;
  for(const variant of [abs,abs+'.js',abs+'.json'])if(mapping[variant])return variant;
  throw error;
 }
};
Module._extensions['.js']=function(mod,file){if(mapping[file])return mod._compile(fs.readFileSync(mapping[file],'utf8'),file);return originalExtensions['.js'](mod,file);};
Module._extensions['.json']=function(mod,file){if(mapping[file]){mod.exports=JSON.parse(fs.readFileSync(mapping[file],'utf8'));return;}return originalExtensions['.json'](mod,file);};
const logger=require.resolve(app+'/src/logger');require.cache[logger]={id:logger,filename:logger,loaded:true,exports:{info(){},warn(){},error(){},debug(){}}};
if(process.env.FEATURE_QA_OFFLINE==='1'){
 const deny=()=>{throw Error('FEATURE_QA_NETWORK_DENIED');};
 require('net').Socket.prototype.connect=deny;require('tls').connect=deny;
 for(const name of ['http','https']){require(name).request=deny;require(name).get=deny;}global.fetch=deny;
}
'''.replace('__MAPPING__', json.dumps(mapping)).replace('__APP__', json.dumps(APP)).replace('__STAGE__', json.dumps(remote))
    put(ssh, remote + '/loader.js', loader.encode())
    for rel, row in files.items():
        if rel.endswith('.js'):
            run(ssh, 'node --check ' + shlex.quote(remote + '/' + rel))
        elif rel.endswith('.json'):
            code='JSON.parse(require("fs").readFileSync('+json.dumps(remote+'/'+rel)+',"utf8"));'
            run(ssh, 'node -e ' + shlex.quote(code))
    preconditions(ssh, files)
    after = state(ssh)
    if after != before:
        raise RuntimeError('PROCESS_CHANGED_DURING_STAGE')
    manifest.update({'status':'STAGED_SYNTAX_PASS','files':{rel:{k:v for k,v in row.items() if k!='data'} for rel,row in files.items()},
                     'beforeProcesses':before,'processesUnchanged':True,'productionWrites':0,'realPlayerWrites':0})
    write_json(previous, manifest)
    print(json.dumps({'status':manifest['status'],'files':len(files),'stage':remote,'productionWrites':0}))


def test(ssh, local_test):
    manifest=read_json(OUT/'stage.json')
    test_path=Path(local_test).resolve()
    if not test_path.is_relative_to(WB.resolve()) or test_path.suffix!='.js':
        raise RuntimeError('TEST_PATH_OUT_OF_SCOPE')
    target=manifest['stage']+'/tests/'+test_path.name
    put(ssh,target,test_path.read_bytes())
    env={'FEATURE_QA_OFFLINE':'1','FEATURE_UNLOCK_DAY1_ENABLED':'1','FEATURE_APP':APP,'FEATURES_APP':APP,
         'FEATURE_CANDIDATE_ROOT':manifest['stage']+'/server','FEATURE_CLIENT_ROOT':manifest['stage']+'/client',
         'FEATURE_MAIN':GAME+'/js/main.min_drop100.js'}
    command='cd '+shlex.quote(APP)+' && '+ ' '.join(k+'='+shlex.quote(v) for k,v in env.items())+' node -r '+shlex.quote(manifest['stage']+'/loader.js')+' '+shlex.quote(target)
    output=run(ssh,command)
    manifest.setdefault('tests',{})[test_path.name]={'output':output.strip(),'sourceSha256':digest(test_path.read_bytes()),
        'candidateHashes':{rel:row['sha256'] for rel,row in manifest['files'].items()}}
    write_json(OUT/'stage.json',manifest)
    print(output)


def main():
    mode=sys.argv[1] if len(sys.argv)>1 else 'stage'
    if mode not in ('stage','test'):
        raise SystemExit('Unknown mode')
    ssh=connect()
    try:
        if mode=='stage':stage(ssh)
        else:test(ssh,sys.argv[2])
    finally:ssh.close()


if __name__=='__main__':main()
