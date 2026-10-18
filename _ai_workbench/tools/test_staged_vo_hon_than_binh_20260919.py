"""Run isolated task/P0 regressions against the staged remote source map."""
import base64
import json
import shlex
import sys
from pathlib import Path

sys.dont_write_bytecode = True
WB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WB / 'temp/pydeps'))
from snapshot_web_multiserver_20260906 import connect, run

OUT = WB / 'temp' / 'feature_unlock_release_20260917' / 'vo_hon_than_binh_stage'
APP = '/linhhoasu/lhs/newServer'
GAME = '/linhhoasu/webgame/game'


def main():
    manifest = json.loads((OUT / 'stage.json').read_text(encoding='utf-8'))
    ssh = connect()
    try:
        mapping = {APP + '/' + rel: row['remote'] for rel, row in manifest['files'].items()}
        loader = r'''"use strict";
const fs=require('fs'),path=require('path'),Module=require('module'),mapping=__MAPPING__,app=__APP__,stage=__STAGE__;
const originalResolve=Module._resolveFilename,originalExtensions={...Module._extensions};
Module._resolveFilename=function(request,parent,...rest){
 let target=request;
 if(request.startsWith('../src/')&&parent&&parent.filename.startsWith(stage+'/tests/'))target=app+'/'+request.slice(3);
 try{return originalResolve.call(this,target,parent,...rest)}catch(error){
  const abs=target.startsWith('.')&&parent?path.resolve(path.dirname(parent.filename),target):target;
  for(const variant of [abs,abs+'.js',abs+'.json'])if(mapping[variant])return variant;
  throw error;
 }
};
Module._extensions['.js']=function(mod,file){if(mapping[file])return mod._compile(fs.readFileSync(mapping[file],'utf8'),file);return originalExtensions['.js'](mod,file)};
Module._extensions['.json']=function(mod,file){if(mapping[file]){mod.exports=JSON.parse(fs.readFileSync(mapping[file],'utf8'));return}return originalExtensions['.json'](mod,file)};
const logger=require.resolve(app+'/src/logger');require.cache[logger]={id:logger,filename:logger,loaded:true,exports:{info(){},warn(){},error(){},debug(){}}};
if(process.env.FEATURE_QA_OFFLINE==='1'){const deny=()=>{throw Error('FEATURE_QA_NETWORK_DENIED')};require('net').Socket.prototype.connect=deny;require('tls').connect=deny;for(const n of ['http','https']){require(n).request=deny;require(n).get=deny}global.fetch=deny}
'''.replace('__MAPPING__', json.dumps(mapping)).replace('__APP__', json.dumps(APP)).replace('__STAGE__', json.dumps(manifest['stage']))
        stage = manifest['stage']
        with ssh.open_sftp() as sftp:
            sftp.open(stage + '/loader.js', 'wb').write(loader.encode())
        test_files = [
            WB / 'tools' / 'test_feature_tasks_20260917.js',
            WB / 'tools' / 'test_vo_hon_than_binh_scope_20260919.js',
        ]
        outputs = {}
        for local in test_files:
            remote_test = stage + '/tests/' + local.name
            with ssh.open_sftp() as sftp:
                run(ssh, 'install -d -m 700 ' + shlex.quote(stage + '/tests'))
                sftp.open(remote_test, 'wb').write(local.read_bytes())
            env = {
                'FEATURE_QA_OFFLINE': '1',
                'FEATURE_SIDE_TASKS_ENABLED': '1',
                'FEATURE_SIDE_TASK_ROOTS': '90002,90020',
                'FEATURE_APP': APP,
                'FEATURES_APP': APP,
                'FEATURE_CANDIDATE_ROOT': stage,
                'FEATURE_MAIN': GAME + '/js/main.min_drop100.js',
            }
            prefix = ' '.join(k + '=' + shlex.quote(v) for k, v in env.items())
            command = 'cd ' + shlex.quote(APP) + ' && ' + prefix + ' node -r ' + shlex.quote(stage + '/loader.js') + ' ' + shlex.quote(remote_test)
            outputs[local.name] = run(ssh, command).strip()
        result = {'status': 'STAGE_TESTS_PASS', 'outputs': outputs, 'productionWrites': 0, 'playerWrites': 0}
        (OUT / 'vo_hon_than_binh_tests.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(json.dumps(result, ensure_ascii=False))
    finally:
        ssh.close()


if __name__ == '__main__':
    main()
