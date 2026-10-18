import json
from snapshot_web_multiserver_20260906 import connect, run
JS=r"""const fs=require('fs'),{MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017');await c.connect();const d=c.db('lhs_s1005');const x={at:new Date().toISOString(),directPlayerWrites:0,settlements:await d.collection('arenasettlements').find({}).toArray(),mails:await d.collection('mails').find({$or:[{eventKey:/^arena_/i},{eventKey:/^cross:/i},{title:/Võ Đạo Hội|Đỉnh Phong/i}]}).toArray()};fs.mkdirSync('/linhhoasu/_ai_workbench/backups/competition_auto_pool_20260925',{recursive:true});const p='/linhhoasu/_ai_workbench/backups/competition_auto_pool_20260925/s5_arena_backfill_before.json';if(fs.existsSync(p)){const old=JSON.parse(fs.readFileSync(p,'utf8'));if(JSON.stringify(old.settlements)!==JSON.stringify(x.settlements)||JSON.stringify(old.mails)!==JSON.stringify(x.mails))throw Error('BACKUP_DRIFT');}else fs.writeFileSync(p,JSON.stringify(x),{mode:0o600});console.log(JSON.stringify({settlements:x.settlements.length,mails:x.mails.length}));await c.close()})().catch(e=>{console.error(e.stack);process.exit(1)});"""
def main():
 s=connect()
 try: print(run(s,'node -',JS))
 finally:s.close()
if __name__=='__main__':main()
