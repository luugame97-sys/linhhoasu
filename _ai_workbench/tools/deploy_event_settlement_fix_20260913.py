"""Scoped event settlement release. prepare -> apply -> verify; never replay apply."""
import argparse
import hashlib
import json
import shlex
from pathlib import Path
from datetime import datetime, timezone
from snapshot_web_multiserver_20260906 import connect, run

WB = Path(__file__).resolve().parents[1]
ROOT = WB.parent / 'linhhoasu/lhs/newServer'
APP = '/linhhoasu/lhs/newServer'
REMOTE_STAGE = '/linhhoasu/_ai_workbench/temp/event_settlement_v2_20260913'
BACKUP = '/linhhoasu/_ai_workbench/backups/event_settlement_fix_v2_20260913_pre'
LOCAL = WB / 'temp/event_settlement_fix_20260913'
FILES = ['src/services/EventRewardSettlementService.js', 'src/services/NewYearEventSchedule.js',
         'src/config/eventRewardSettlement.json', 'src/db/models/EventRewardSettlement.js',
         'src/config/fishingGameplayBalance.json',
         'src/handlers/activity.js', 'src/services/FishingEventService.js', 'src/app.js']
PROCS = ['lhs-s1001', 'lhs-s1002', 'lhs-s1003']
PORTS = [8080, 8083, 8084]
def digest(data): return hashlib.sha256(data).hexdigest()
def read_remote(sftp, path):
    try:
        with sftp.open(path, 'rb') as handle: return handle.read()
    except FileNotFoundError: return None
def save(name, value):
    LOCAL.mkdir(parents=True, exist_ok=True)
    (LOCAL / name).write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
def inventory(ssh):
    ps = json.loads(run(ssh, 'pm2 jlist'))
    return [{'name': p['name'], 'pid': p['pid'], 'status': p['pm2_env']['status'],
             'enabled': p['pm2_env'].get('EVENT_SETTLEMENT_ENABLED'),
             'activation': p['pm2_env'].get('EVENT_SETTLEMENT_ACTIVATION_AT'),
             'restarts': p['pm2_env']['restart_time']} for p in ps if p['name'] in PROCS]
def ready(ssh):
    return {str(p): run(ssh, "curl -fsS --max-time 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:"+str(p)+"/ready").strip() for p in PORTS}
def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('phase', choices=['prepare','apply','resume','verify'])
    args=parser.parse_args()
    ssh=connect()
    try:
        if args.phase=='prepare':
            if (LOCAL/'apply-started.json').exists(): raise RuntimeError('APPLY_ALREADY_STARTED_USE_VERIFY')
            ev={'phase':'prepared','at':datetime.now(timezone.utc).isoformat(),'files':{},'before':inventory(ssh)}
            with ssh.open_sftp() as s:
                for rel in FILES:
                    data=(ROOT/rel).read_bytes()
                    before=read_remote(s,APP+'/'+rel)
                    dest=REMOTE_STAGE+'/app/'+rel
                    run(ssh,'mkdir -p '+shlex.quote(dest.rsplit('/',1)[0]))
                    with s.open(dest,'wb') as f:f.write(data)
                    assert digest(read_remote(s,dest))==digest(data)
                    ev['files'][rel]={'baseline':digest(before) if before is not None else None,'candidate':digest(data)}
                    if rel.endswith('.js'):run(ssh,'node --check '+shlex.quote(dest))
                for name in ['test_event_settlement_20260913.js','test_event_settlement_mongo_20260913.js']:
                    run(ssh,'mkdir -p '+shlex.quote(REMOTE_STAGE+'/tools'))
                    with s.open(REMOTE_STAGE+'/tools/'+name,'wb') as f:f.write((WB/'tools'/name).read_bytes())
            env='EVENT_TEST_APP='+REMOTE_STAGE+'/app EVENT_TEST_LIVE='+APP+' '
            ev['unit']=json.loads(run(ssh,env+'node '+REMOTE_STAGE+'/tools/test_event_settlement_20260913.js'))
            raw=run(ssh,env+'node '+REMOTE_STAGE+'/tools/test_event_settlement_mongo_20260913.js')
            ev['mongo']=json.loads(next(x for x in raw.splitlines() if x.startswith('{"result"')))
            ev['core']=run(ssh,'cd '+APP+' && npm run test:core-contract').strip().splitlines()[-1]
            assert ev['unit']['result']=='PASS' and ev['mongo']['result']=='PASS'
            save('prepared.json',ev)
            print(json.dumps({'phase':'prepared','unit':ev['unit']['count'],'mongo':ev['mongo'],'core':ev['core']}))
        elif args.phase=='apply':
            ev=json.loads((LOCAL/'prepared.json').read_text(encoding='utf-8'))
            if (LOCAL/'apply-started.json').exists():raise RuntimeError('NO_REPLAY_USE_VERIFY')
            with ssh.open_sftp() as s:
                for rel,meta in ev['files'].items():
                    data=read_remote(s,APP+'/'+rel)
                    assert (digest(data) if data is not None else None)==meta['baseline'],'BASELINE_DRIFT:'+rel
                    assert digest(read_remote(s,REMOTE_STAGE+'/app/'+rel))==meta['candidate'],'STAGE_DRIFT:'+rel
                save('apply-started.json',{'at':datetime.now(timezone.utc).isoformat(),'backup':BACKUP})
                # Backups never overwritten on retry.
                for rel,meta in ev['files'].items():
                    dest=BACKUP+'/'+rel
                    run(ssh,'mkdir -p '+shlex.quote(dest.rsplit('/',1)[0]))
                    if meta['baseline'] is not None:
                        run(ssh,'test ! -e '+shlex.quote(dest)+' && cp -p '+shlex.quote(APP+'/'+rel)+' '+shlex.quote(dest))
                    # Copy via same-directory temp and rename. CAS checked again immediately.
                    data=read_remote(s,APP+'/'+rel)
                    assert (digest(data) if data is not None else None)==meta['baseline'],'COMMIT_DRIFT:'+rel
                    tmp=APP+'/'+rel+'.event-v2-stage'
                    run(ssh,'cp '+shlex.quote(REMOTE_STAGE+'/app/'+rel)+' '+shlex.quote(tmp)+' && mv '+shlex.quote(tmp)+' '+shlex.quote(APP+'/'+rel))
                    assert digest(read_remote(s,APP+'/'+rel))==meta['candidate']
            # Import an immutable delivery receipt only; no new rewards or player edits.
            receipt_js=r"""
const cp=require('child_process'),crypto=require('crypto'),root='/linhhoasu/lhs/newServer';
const ps=JSON.parse(cp.execSync('pm2 jlist',{encoding:'utf8'})).filter(p=>/^lhs-s100[123]$/.test(p.name));
const {MongoClient}=require(root+'/node_modules/mongodb');
(async()=>{const out=[];for(const p of ps){const c=new MongoClient(p.pm2_env.MONGO_URI);try{await c.connect();const d=c.db(),sid=Number(p.pm2_env.SERVER_ID);
const docs=await d.collection('mails').find({batchId:'kimma_compensation_top123_20260913_v1'}).project({userId:1,eventKey:1,attachments:1,createdAt:1}).sort({userId:1}).toArray();
if(docs.length!==({1001:94,1002:48,1003:11}[sid]))throw Error('COMPENSATION_RECEIPT_COUNT_MISMATCH');
const hash=crypto.createHash('sha256').update(JSON.stringify(docs)).digest('hex'),id='kimma_compensation_receipt_'+sid+'_20260913';
await d.collection('eventrewardsettlements').updateOne({_id:id},{$setOnInsert:{serverId:sid,event:{kind:'compensation',key:'kimma_compensation_top123_20260913_v1'},snapshotHash:hash,recipients:docs,delivered:docs.map(x=>x.userId),expired:[],state:'done',completedAt:Date.now()}},{upsert:true});
const row=await d.collection('eventrewardsettlements').findOne({_id:id});if(row.snapshotHash!==hash)throw Error('COMPENSATION_RECEIPT_DRIFT');
out.push({serverId:sid,recipients:docs.length});}finally{await c.close();}}console.log(JSON.stringify(out));})().catch(e=>{console.error(e.message);process.exitCode=1});
"""
            ev['receipts']=json.loads(run(ssh,'node',receipt_js));save('receipt.json',ev['receipts'])
            for name in PROCS:
                run(ssh,'EVENT_SETTLEMENT_ENABLED=1 EVENT_SETTLEMENT_ACTIVATION_AT=1789292110847 pm2 reload '+name+' --update-env')
                save('reload-progress.json',{'lastReloaded':name})
            print(json.dumps({'phase':'applied','receipts':ev['receipts']}))
        elif args.phase=='resume':
            if (LOCAL/'receipt.json').exists(): raise RuntimeError('RESUME_ALREADY_COMPLETED_USE_VERIFY')
            ev=json.loads((LOCAL/'prepared.json').read_text(encoding='utf-8'))
            with ssh.open_sftp() as s:
                for rel,meta in ev['files'].items():
                    assert digest(read_remote(s,APP+'/'+rel))==meta['candidate'],'RESUME_HASH_MISMATCH:'+rel
            receipt_js=r"""
const cp=require('child_process'),crypto=require('crypto'),root='/linhhoasu/lhs/newServer';
const ps=JSON.parse(cp.execSync('pm2 jlist',{encoding:'utf8'})).filter(p=>/^lhs-s100[123]$/.test(p.name));const expected={1001:94,1002:48,1003:11};const {MongoClient}=require(root+'/node_modules/mongodb');
(async()=>{const out=[];for(const p of ps){const c=new MongoClient(p.pm2_env.MONGO_URI);try{await c.connect();const d=c.db(),sid=Number(p.pm2_env.SERVER_ID),docs=await d.collection('mails').find({eventKey:/^kimma_compensation_top123_20260913_v1/}).project({userId:1,eventKey:1,attachments:1,createdAt:1}).sort({userId:1}).toArray();if(docs.length!==expected[sid])throw Error('COMPENSATION_RECEIPT_COUNT_MISMATCH_'+sid);const hash=crypto.createHash('sha256').update(JSON.stringify(docs)).digest('hex'),id='kimma_compensation_receipt_'+sid+'_20260913';await d.collection('eventrewardsettlements').updateOne({_id:id},{$setOnInsert:{serverId:sid,event:{kind:'compensation',key:'kimma_compensation_top123_20260913_v1'},snapshotHash:hash,recipients:docs,delivered:docs.map(x=>x.userId),expired:[],state:'done',completedAt:Date.now()}},{upsert:true});const row=await d.collection('eventrewardsettlements').findOne({_id:id});if(row.snapshotHash!==hash)throw Error('COMPENSATION_RECEIPT_DRIFT_'+sid);out.push({serverId:sid,recipients:docs.length});}finally{await c.close();}}console.log(JSON.stringify(out));})().catch(e=>{console.error(e.message);process.exitCode=1});
"""
            receipts=json.loads(run(ssh,'node',receipt_js));save('receipt.json',receipts)
            for name in PROCS:
                run(ssh,'EVENT_SETTLEMENT_ENABLED=1 EVENT_SETTLEMENT_ACTIVATION_AT=1789292110847 pm2 reload '+name+' --update-env')
                save('reload-progress.json',{'lastReloaded':name})
            print(json.dumps({'phase':'resumed','receipts':receipts}))
        else:
            ev=json.loads((LOCAL/'prepared.json').read_text(encoding='utf-8'))
            result={'at':datetime.now(timezone.utc).isoformat(),'processes':inventory(ssh),'ready':ready(ssh),'files':{}}
            with ssh.open_sftp() as s:
                for rel,meta in ev['files'].items():
                    result['files'][rel]=digest(read_remote(s,APP+'/'+rel))
                    assert result['files'][rel]==meta['candidate'],'LIVE_HASH_MISMATCH:'+rel
            assert len(result['processes'])==3 and all(p['status']=='online' and str(p['enabled'])=='1' and str(p['activation'])=='1789292110847' for p in result['processes'])
            assert set(result['ready'].values())=={'200'}
            result['result']='DEPLOY_VERIFIED'
            save('deploy.json',result)
            print(json.dumps(result))
    finally:ssh.close()
if __name__=='__main__':main()
