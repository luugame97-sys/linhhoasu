"""Apply the reviewed side-task plan with Mongo CAS and an idempotency marker."""
import base64
import json
import shlex
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.dont_write_bytecode = True
WB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WB / 'temp/pydeps'))
from snapshot_web_multiserver_20260906 import connect, run

PLAN = WB / 'temp' / 'vo_hon_than_binh_migration_20260919' / 'plan.json'
OUT = WB / 'temp' / 'vo_hon_than_binh_migration_20260919'
MARKER = 'vo_hon_than_binh_migration_v1'

NODE = r'''
'use strict';
const fs=require('fs');
const {MongoClient,ObjectId}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
const plan=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const marker='vo_hon_than_binh_migration_v1';
const int=v=>Number.isFinite(Number(v))?Math.floor(Number(v)):0;
const out={at:new Date().toISOString(),readOnly:false,marker,applied:0,skipped:0,casConflicts:0,errors:0,results:[]};
const idValue=x=>{try{return new ObjectId(String(x))}catch(_){return String(x)}};
const pathSet=(set,path,value)=>{if(path==='systemUnlockInfo.unlockedSystem')set[path]=value;else if(path==='taskInfo.tasks'||path.startsWith('taskInfo.tasks.'))set[path]=value;else if(path==='taskInfo.tasksMap.9')set['taskInfo.tasksMap.9']=value};
(async()=>{const mongo=new MongoClient('mongodb://127.0.0.1:27017',{serverSelectionTimeoutMS:7000});await mongo.connect();try{
 for(const p of (plan.players||[])){
  if(p.status!=='planned'||p.blocked||!Array.isArray(p.changes)||p.changes.length===0){out.skipped++;continue;}
  const ident=p.identity||{}, sid=int(ident.serverId); if(!sid||!ident._id){out.errors++;out.results.push({identity:ident,result:'INVALID_IDENTITY'});continue;}
  const cas=p.cas||{}; if(cas.field==='fullDocumentHash'||!cas.field){out.casConflicts++;out.results.push({identity:ident,result:'CAS_UNSUPPORTED'});continue;}
  const col=mongo.db('lhs_s'+sid).collection('players'); const oid=idValue(ident._id);
  const current=await col.findOne({_id:oid},{projection:{_id:1,updatedAt:1,stateVersion:1,systemUnlockInfo:1,taskInfo:1}});
  if(!current){out.casConflicts++;out.results.push({identity:ident,result:'CAS_MISSING'});continue;}
  const currentCas=current[cas.field]; const expected=cas.expected;
  if(String(currentCas instanceof Date?currentCas.toISOString():currentCas)!==String(expected)){
    out.casConflicts++;out.results.push({identity:ident,result:'CAS_MISMATCH',field:cas.field,expected,actual:currentCas instanceof Date?currentCas.toISOString():currentCas});continue;
  }
  const existing=(((current.taskInfo||{}).migrationLedger||{})[marker]); if(existing){out.skipped++;out.results.push({identity:ident,result:'ALREADY_APPLIED'});continue;}
  const set={}; const after=p.afterFields||{}; const wanted=new Set(p.changes.map(x=>x.path));
  for(const path of wanted) if(Object.prototype.hasOwnProperty.call(after,path)) pathSet(set,path,after[path]);
  for(const [path,value] of Object.entries(p.updates||{})) set[path]=value;
  set['taskInfo.migrationLedger.'+marker]={marker,planHash:p.idempotency&&p.idempotency.planHash,beforeHash:p.beforeHash,afterHash:p.afterHash,appliedAt:new Date().toISOString()};
  const filter={_id:oid,[cas.field]:currentCas,['taskInfo.migrationLedger.'+marker]:{$exists:false}};
  const result=await col.updateOne(filter,{$set:set});
  if(result.matchedCount!==1){out.casConflicts++;out.results.push({identity:ident,result:'CAS_RACE'});continue;}
  const readback=await col.findOne({_id:oid},{projection:{_id:1,updatedAt:1,stateVersion:1,systemUnlockInfo:1,taskInfo:1}});
  const markerAfter=readback&&readback.taskInfo&&readback.taskInfo.migrationLedger&&readback.taskInfo.migrationLedger[marker];
  if(!markerAfter){out.errors++;out.results.push({identity:ident,result:'READBACK_MARKER_MISSING'});continue;}
  out.applied++;out.results.push({identity:ident,result:'APPLIED',serverId:sid,changes:[...wanted]});
 }
}finally{await mongo.close()} console.log(JSON.stringify(out));})().catch(e=>{console.error(e.stack||String(e));process.exitCode=1});
'''


def main():
    if not PLAN.is_file():
        raise SystemExit('MISSING_PLAN')
    plan = json.loads(PLAN.read_text(encoding='utf-8'))
    if plan.get('status') != 'DRY_RUN' or plan.get('summary', {}).get('blocked', 0):
        raise SystemExit('PLAN_NOT_SAFE_TO_APPLY')
    known = {90002,90003,90004,90005,90006,90020,90021,90022}
    compact_players = []
    for row in plan.get('players', []):
        if row.get('status') != 'planned' or row.get('blocked') or not row.get('changes'):
            continue
        after = row.get('afterFields') or {}
        updates = {}
        changed_paths = {item.get('path') for item in row.get('changes', [])}
        if 'systemUnlockInfo.unlockedSystem' in changed_paths:
            updates['systemUnlockInfo.unlockedSystem'] = after.get('systemUnlockInfo.unlockedSystem', [])
        if 'taskInfo.tasksMap.9' in changed_paths:
            updates['taskInfo.tasksMap.9'] = (after.get('taskInfo.tasksMap.9') or [])
        if 'taskInfo.tasks' in changed_paths:
            for key, value in (after.get('taskInfo.tasks') or {}).items():
                try:
                    if int(key) in known:
                        updates['taskInfo.tasks.' + str(key)] = value
                except (TypeError, ValueError):
                    pass
        compact_players.append({key: row.get(key) for key in (
            'status', 'blocked', 'identity', 'changes', 'beforeHash', 'afterHash',
            'cas', 'idempotency') } | {'updates': updates})
    compact = {
        'status': plan.get('status'),
        'summary': plan.get('summary'),
        'players': compact_players,
    }
    compact_path = OUT / 'apply_plan_compact.json'
    compact_path.write_text(json.dumps(compact, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    ssh = connect()
    try:
        remote_dir = '/linhhoasu/_ai_workbench/temp/vo_hon_than_binh_migration_20260919'
        remote_plan = remote_dir + '/plan.json'
        # mkdir is idempotent and scoped to the private workbench directory.
        run(ssh, 'install -d -m 700 ' + shlex.quote(remote_dir))
        with ssh.open_sftp() as sftp:
            with sftp.open(remote_plan, 'wb') as handle:
                handle.write(compact_path.read_bytes())
            with sftp.open(remote_dir + '/apply_node.js', 'wb') as handle:
                handle.write(NODE.encode())
        raw = run(ssh, 'node ' + shlex.quote(remote_dir + '/apply_node.js') + ' ' + shlex.quote(remote_plan))
        line = raw.strip().splitlines()[-1]
        result = json.loads(line)
        result['productionWrites'] = result.get('applied', 0)
        result['plan'] = str(PLAN)
        output = OUT / 'apply_result.json'
        output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        if hasattr(sys.stdout, 'reconfigure'):
            sys.stdout.reconfigure(encoding='utf-8')
        print(json.dumps(result, ensure_ascii=False))
    finally:
        ssh.close()


if __name__ == '__main__':
    main()
