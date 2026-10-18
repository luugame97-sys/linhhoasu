"""Run staged modules against real Mongo/BattleService in a uniquely owned QA DB."""
from datetime import datetime, timezone
from pathlib import Path
import hashlib
import json
import shlex
import sys
from auction_ops_20261015 import connect, APP

ROOT = Path(__file__).resolve().parents[2]
TASK = ROOT / '_ai_workbench/temp/cross_rival_20261015'

def main():
    sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
    sources = {str(p.relative_to(TASK / 'next')).replace('\\', '/'): p.read_text(encoding='utf-8')
               for p in (TASK / 'next/src').rglob('*') if p.suffix in ('.js', '.json')}
    db = 'lhs_qa_rival_' + datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S_%f')
    suite = (ROOT / '_ai_workbench/tools/test_cross_rival_integration_20261015.js').read_text(encoding='utf-8')
    preamble = r'''
const cp=require('child_process'),Module=require('module'),path=require('path');
const env=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8',maxBuffer:8e6})).find(p=>p.name==='lhs-s1001').pm2_env;
for(const [k,v] of Object.entries(env))if(typeof v==='string')process.env[k]=v;
if(!/^lhs_qa_rival_20261015_\d+_\d+$/.test(input.db))throw Error('QA_DATABASE_GUARD');
process.env.IDENTITY_MONGO_DB=input.db;
const realLoad=Module._load;
Module._load=function(request,parent,isMain){
  let filename;
  if(request.startsWith('.'))filename=path.resolve(path.dirname(parent.filename),request);
  else if(request.startsWith('/'))filename=request;
  if(filename){
    let relative=path.relative(process.cwd(),filename);
    if(!path.extname(relative))relative+='.js';
    if(Object.hasOwn(input.sources,relative)){
      filename=path.join(process.cwd(),relative);
      if(require.cache[filename])return require.cache[filename].exports;
      const m=new Module(filename,parent);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));require.cache[filename]=m;
      if(relative.endsWith('.json'))m.exports=JSON.parse(input.sources[relative]);else m._compile(input.sources[relative],filename);
      m.loaded=true;return m.exports;
    }
  }
  return realLoad.call(this,request,parent,isMain);
};
const log=require.resolve('./src/logger');require.cache[log]={id:log,loaded:true,exports:{info(){},warn(){},error(){},debug(){}}};
'''
    source = 'const input=' + json.dumps({'sources': sources, 'db': db}, ensure_ascii=False) + ';\n' + preamble + suite
    client = connect()
    try:
        stdin, stdout, stderr = client.exec_command('cd ' + shlex.quote(APP) + ' && ulimit -c 0 && timeout 55s node -', timeout=60)
        stdin.write(source)
        stdin.channel.shutdown_write()
        output = stdout.read().decode('utf-8', 'replace')
        errors = stderr.read().decode('utf-8', 'replace')
        rc = stdout.channel.recv_exit_status()
        if rc:
            raise RuntimeError(f'QA exit {rc}: {output[-5000:]} {errors[-5000:]}')
        result = json.loads(output)
        result['sourceHashes'] = {name: hashlib.sha256(data.encode('utf-8')).hexdigest() for name, data in sources.items()}
        (TASK / 'integration-tests.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps(result, ensure_ascii=False))
    finally:
        client.close()

if __name__ == '__main__': main()
