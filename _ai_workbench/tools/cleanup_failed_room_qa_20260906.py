"""Recover own withdrawn QA artifacts. Exact inventory identity, private backup, no game restart."""
import json,sys
import paramiko
from inspect_room_qa_cleanup_20260906 import WB,ROOT,QUERY
from release_huyenvu_daily_20260906 import run,hashes,pm2,ready

def main():
 sys.stdout.reconfigure(encoding='utf-8')
 inventory=json.loads((ROOT/'qa-cleanup-inventory.json').read_text(encoding='utf-8'))
 expected=json.loads((ROOT/'manifest.json').read_text(encoding='utf-8'))['expected']
 c=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
 try:
  processes=inventory['qaProcesses']
  stop="const fs=require('fs'),rows="+json.dumps(processes)+";const stopped=[];for(const row of rows){let args;try{args=fs.readFileSync('/proc/'+row.pid+'/cmdline','utf8').split('\\0').filter(Boolean);}catch(e){if(e.code==='ENOENT')continue;throw e;}if(JSON.stringify(args)!==JSON.stringify(row.args))throw Error('PROCESS_IDENTITY_CHANGED');process.kill(row.pid,'SIGTERM');stopped.push(row.pid);}console.log(JSON.stringify({stopped}));"
  stopped=json.loads(run(s,'node -',stop))
  # Closing the diagnostic process lets the server finish normal disconnect/save first.
  check=json.loads(run(s,'node -',QUERY));assert not check['qaProcesses'],'QA_PROCESS_STILL_PRESENT'
  targets={name:data['rows']for name,data in inventory['databases'].items()}
  cleanup=r"""
const assert=require('assert/strict'),fs=require('fs'),{MongoClient,ObjectId,BSON}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
const targets=__TARGETS__;
(async()=>{
 const c=new MongoClient('mongodb://127.0.0.1:27017');await c.connect();const result={};
 const backup='/linhhoasu/_ai_workbench/backups/failed_room_qa_20260906_'+Date.now();fs.mkdirSync(backup,{mode:0o700});
 try{
  for(const[name,rows]of Object.entries(targets)){
   assert(['lhs_s1001','lhs_s1002'].includes(name));const db=c.db(name),players=db.collection('players');
   const identities=rows.map(row=>{
    const m=/^(qa_room_[0-9a-f]{16})_u([0-4])(_s100[12])?$/.exec(row.userId);assert(m);
    assert(String(row.name).startsWith('QA Room '+m[2]));assert.equal(row.serverId,Number(name.slice(5)));
    assert(m[3]?row.playerId.startsWith('p_'+row.userId+'_'):row.playerId===m[1]+'_p'+m[2]);
    return {_id:new ObjectId(row._id),userId:row.userId,playerId:row.playerId,name:row.name};
   });
   const docs=identities.length?await players.find({$or:identities}).toArray():[];assert.equal(docs.length,identities.length);
   fs.writeFileSync(backup+'/'+name+'.ejson',BSON.EJSON.stringify(docs),{mode:0o600,flag:'wx'});
   let removed=0;
   for(const identity of identities){const r=await players.deleteOne(identity);assert.equal(r.deletedCount,1);removed++;}
   const remaining=await players.countDocuments({userId:/^qa_room_[0-9a-f]{16}_u[0-4](?:_s100[12])?$/});
   result[name]={backedUp:docs.length,removed,remaining};assert.equal(remaining,0);
  }
 }finally{await c.close();}
 console.log(JSON.stringify({backup,result}));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
""".replace('__TARGETS__',json.dumps(targets))
  cleaned=json.loads(run(s,'node -',cleanup,timeout=30))
  after=json.loads(run(s,'node -',QUERY));assert not after['qaProcesses'];assert all(not v['rows']for v in after['databases'].values())
  assert hashes(s,list(expected))==expected;assert pm2(s)==inventory['pm2'];assert ready(s)=={'8080':200,'8083':200}
  report={'result':'OWN_QA_CLEANED','stopped':stopped,**cleaned,'postcheck':after,'allProductionSourceHashesUnchanged':True,'pm2Unchanged':True,'ready':ready(s)}
  (ROOT/'qa-cleanup-final.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
  print(json.dumps(report,ensure_ascii=False))
 finally:s.close()
if __name__=='__main__':main()
