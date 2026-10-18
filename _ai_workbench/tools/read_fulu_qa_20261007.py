"""Read only the authorized role and Fulu economy/receipt projection."""
from pathlib import Path
import json,sys,shlex
from release_petsoul_day1_20261007 import connect,run
ROOT=Path(__file__).resolve().parents[2]
G=ROOT/'_ai_workbench/temp/event_goal_20261007'
qa=json.loads((G/'baseline.json').read_text(encoding='utf-8-sig'))['qa']
label=sys.argv[1] if len(sys.argv)>1 else 'qa_before'
if not label.replace('_','').isalnum():raise RuntimeError('LABEL_INVALID')
query=json.dumps(dict(userId=qa['userId'],playerId=qa['playerId'],serverId=1001))
source="""(async()=>{const app='/linhhoasu/lhs/newServer',c=require(app+'/src/services/ConfigService'),t=c.loadAllTables(),ids=new Set([19,232,233]);const walk=n=>{if(!n||typeof n!=='object')return;if(Array.isArray(n.rewards))n.rewards.forEach(x=>ids.add(x.id));Object.values(n).forEach(x=>{if(x&&typeof x==='object')walk(x);});};walk(t.Activity52ArrangeConfig[52001]);walk(t.Activity52Config[52001]);const{MongoClient}=require(app+'/node_modules/mongodb'),m=new MongoClient('mongodb://127.0.0.1:27017',{serverSelectionTimeoutMS:5000});await m.connect();try{const p=await m.db('lhs_s1001').collection('players').findOne(QUERY,{projection:{_id:0,name:1,serverId:1,level:1,items:1,currencies:1,taskInfo:1,activityInfo:1,other_attr_info:1,shopInfo:1,rechargeInfo:1,updatedAt:1}});if(!p)throw Error('QA_ROLE_NOT_FOUND');const tasks=p.taskInfo?.tasks||{},out={at:new Date().toISOString(),name:p.name,serverId:p.serverId,level:p.level,updatedAt:p.updatedAt,items:Object.fromEntries([...ids].map(id=>[id,Number(p.items?.[id])||0])),currencies:p.currencies,shopInfo:p.shopInfo,rechargeInfo:p.rechargeInfo,activity:(p.activityInfo?.datas||[]).find(x=>x.id===52001),tasks:Object.fromEntries([75001,75002,75003,75004,75005].map(id=>[id,tasks[id]||null])),taskLedger:p.other_attr_info?.fuluTaskLedger?.[52001]||null,receipts:(p.other_attr_info?.featureReceipts?.rows||[]).filter(r=>r.data?.ack?.id===52001||r.data?.cycle?.startsWith('52001:')).map(r=>({key:r.key,time:r.time,data:r.data}))};console.log(JSON.stringify(out));}finally{await m.close();}})().catch(e=>{console.error(e.message);process.exit(1);});""".replace('QUERY',query)
s=connect()
try:
    out=json.loads(run(s,'node -e '+shlex.quote(source),60).strip().splitlines()[-1])
    dest=G/'fulu/qa';dest.mkdir(parents=True,exist_ok=True)
    (dest/(label+'.json')).write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(dict(label=label,name=out['name'],serverId=out['serverId'],level=out['level'],items={str(i):out['items'][str(i)] for i in [232,233]},tasks={k:(v.get('status') if v else None) for k,v in out['tasks'].items()},receipts=len(out['receipts'])),ensure_ascii=False))
finally:s.close()
