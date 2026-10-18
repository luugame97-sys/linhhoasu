"""Bounded recovery runner; pure plan first, then one authorized frozen cutoff."""
import argparse, json, shlex, sys
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect, run
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'_ai_workbench/temp/competition_auto_pool_20260925'

INSPECT=r"""
const fs=require('fs'),cp=require('child_process'),{MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017',{serverSelectionTimeoutMS:5000});await c.connect();try{
const out={at:new Date().toISOString(),gameservers:await c.db('lhs_s1001').collection('gameservers').find({},{projection:{_id:0,serverId:1,pageId:1,openTime:1,running:1,status:1}}).sort({serverId:1}).toArray(),servers:[]};
for(const sid of [1004,1005]){const db=c.db('lhs_s'+sid),p=db.collection('players'),a=db.collection('arenasettlements');
out.servers.push({sid,arena:await a.aggregate([{$project:{_id:1,state:1,lastError:1,period:1,cutoffAt:1,activationAt:1,cursorAt:1,n:{$size:{$ifNull:['$recipients',[]]}},sent:{$size:{$ifNull:['$delivered',[]]}}}}]).toArray(),
crossFields:await p.aggregate([{$match:{crossArenaInfo:{$exists:true}}},{$project:{_id:0,userId:1,keys:{$map:{input:{$objectToArray:'$crossArenaInfo'},as:'x',in:'$$x.k'}},version:'$crossArenaInfo.version',score:'$crossArenaInfo.score',cycleKey:'$crossArenaInfo.cycleKey',joinedAt:'$crossArenaInfo.joinedAt',logCount:{$size:{$ifNull:['$crossArenaInfo.loglist',[]]}}}},{$limit:20}]).toArray(),
topCombat:await p.countDocuments({'topCombatInfo.score':{$gt:0}}),crossEntry:await c.db('lhs_s1001').collection('crossevententries').countDocuments({event:'crossArena',serverId:sid}),crossActions:await c.db('lhs_s1001').collection('crossarenaactions').countDocuments({serverId:sid}),arenaLogCount:await db.collection('arenafightlogs').countDocuments({serverId:sid})});}
out.jobs=[];for(const dir of ['/linhhoasu/_ai_workbench/temp/competition_auto_pool_20260925'])if(fs.existsSync(dir))for(const name of fs.readdirSync(dir).filter(x=>/job_.*\.(out|done)$/.test(x))){const b=fs.readFileSync(dir+'/'+name,'utf8');out.jobs.push({name,tail:b.slice(-1800)});}
const pm=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'}));out.processes=pm.filter(p=>/^lhs-s100[1-5]$/.test(p.name)).map(p=>({name:p.name,status:p.pm2_env.status,enabled:p.pm2_env.ARENA_SETTLEMENT_ENABLED,approved:p.pm2_env.ARENA_SETTLEMENT_APPROVED,activation:p.pm2_env.ARENA_SETTLEMENT_ACTIVATION_AT,override:p.pm2_env.COMPETITION_REWARD_ACTIVATION_AT}));
console.log('RECOVERY_JSON='+JSON.stringify(out));}finally{await c.close()}})().catch(e=>{console.error(e.stack);process.exit(1)});
"""

def main():
    p=argparse.ArgumentParser();p.add_argument('mode',choices=['inspect','plan']);args=p.parse_args()
    ssh=connect()
    try:
        source=INSPECT if args.mode=='inspect' else (ROOT/'_ai_workbench/tools/competition_backfill_plan_20260925.js').read_text(encoding='utf8')
        raw=run(ssh,'cd /linhhoasu/lhs/newServer && timeout 45s node -',source)
        data=json.loads(raw.split('RECOVERY_JSON=')[-1]);OUT.mkdir(parents=True,exist_ok=True)
        (OUT/(args.mode+'.json')).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
        print(json.dumps(data,ensure_ascii=False,indent=2),flush=True)
    finally:ssh.close()
if __name__=='__main__':main()
