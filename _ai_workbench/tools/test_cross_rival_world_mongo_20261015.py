"""Run the new domain engine only in a uniquely-owned isolated Mongo QA collection."""
from datetime import datetime, timezone
from pathlib import Path
import hashlib
import json
import shlex
import sys
from auction_ops_20261015 import connect, run, APP

ROOT = Path(__file__).resolve().parents[2]
TASK = ROOT / '_ai_workbench/temp/cross_rival_20261015'

def main():
    sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
    engine = (TASK / 'next/src/services/CrossRivalBattlefieldService.js').read_text(encoding='utf-8')
    rules = (TASK / 'candidate/src/services/CrossRivalRules.js').read_text(encoding='utf-8')
    cases = (ROOT / '_ai_workbench/tools/test_cross_rival_world_20261015.js').read_text(encoding='utf-8')
    tables = json.loads((TASK / 'live-audit.json').read_text(encoding='utf-8'))['config']
    collection = 'owned_world_' + datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S_%f')
    payload = {'engine':engine,'rules':rules,'cases':cases,'tables':tables,'collection':collection}
    source = 'const input=' + json.dumps(payload, ensure_ascii=False) + ';\n' + r'''
const {MongoClient}=require('mongodb'),Module=require('module'),cp=require('child_process');
function compile(text,name){const filename='/linhhoasu/_ai_workbench/temp/virtual_'+name+'.js';const m=new Module(filename);m.filename=filename;m.paths=module.paths;m._compile(text,filename);return m.exports;}
const engine=compile(input.engine,'rival_world'),rules=compile(input.rules,'rival_rules'),cases=compile(input.cases,'rival_cases');
const nodes=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8',maxBuffer:8e6}));
const env=nodes.find(p=>p.name==='lhs-s1001').pm2_env;
const client=new MongoClient(env.MONGO_URI,{serverSelectionTimeoutMS:5000,maxPoolSize:6});
(async()=>{
  await client.connect();
  const dbName='lhs_qa_cross_rival_20261015',db=client.db(dbName);
  if(!/^owned_world_20261015_\d+_\d+$/.test(input.collection))throw Error('QA_COLLECTION_NAME_INVALID');
  if((await db.listCollections({name:input.collection}).toArray()).length)throw Error('QA_COLLECTION_ALREADY_EXISTS');
  const collection=db.collection(input.collection),store=engine.mongoStore(collection);
  try{
    const result=await cases.runSuite({engine,rules,tables:input.tables,store});
    const docs=await collection.find({}, {projection:{_id:1,version:1}}).toArray();
    if(docs.length!==result.worldsCreated || docs.some(d=>!/^rival_v2_QA_WORLD_\d+$/.test(d._id)||d.version!==2))throw Error('QA_CLEANUP_OWNERSHIP_FAILED');
    await collection.drop();
    console.log(JSON.stringify({...result,database:dbName,collection:input.collection,fixtureDocuments:docs.length,
      fixtureCollectionRemoved:true,mode:'REAL_MONGODB_ISOLATED',otherDatabasesWritten:false}));
  }catch(error){console.log(JSON.stringify({result:'FAIL',error:error.message,database:dbName,collection:input.collection,fixturesPreserved:true}));process.exitCode=1;}
  finally{await client.close();}
})().catch(async error=>{console.error(error.message);await client.close();process.exitCode=1;});
'''
    client = connect()
    try:
        stdin, stdout, stderr = client.exec_command('cd ' + shlex.quote(APP) + ' && ulimit -c 0 && timeout 50s node -', timeout=55)
        stdin.write(source)
        stdin.channel.shutdown_write()
        output = stdout.read().decode('utf-8', 'replace')
        error_output = stderr.read().decode('utf-8', 'replace')
        rc = stdout.channel.recv_exit_status()
        if rc:
            raise RuntimeError(f'Isolated QA exit {rc}: {output[:1800]} {error_output[:1800]}')
        result = json.loads(output)
        result['sourceSha256'] = hashlib.sha256(engine.encode('utf-8')).hexdigest()
        (TASK / 'world-mongo-tests.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps(result, ensure_ascii=False))
    finally:
        client.close()

if __name__ == '__main__':
    main()
