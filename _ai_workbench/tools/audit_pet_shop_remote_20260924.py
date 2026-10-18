"""Read-only remote audit of the purchase/egg path across all five PM2 nodes."""
import argparse, hashlib, json, shlex
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect, run

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--snapshot', choices=['before','after','compose-before','compose-after'])
    args=parser.parse_args()
    ssh=connect()
    try:
        if args.snapshot:
            js=r"""const {MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
            (async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017',{maxPoolSize:1,serverSelectionTimeoutMS:5000});await c.connect();try{
            const p=await c.db('lhs_s1005').collection('players').findOne({userId:'u_Wk_1005_dfa62f_1790093829720'},{projection:{_id:0,userId:1,name:1,'currencies.diamond':1,'items.24':1,'items.25':1,'items.36':1,'shopInfo.buyRecords.25':1,'shopInfo.lastBuyTime':1,'petInfo.field':1,'petInfo.pets.uid':1,'petInfo.pets.id':1,'petInfo.pets.slot':1,updatedAt:1}});
            console.log(JSON.stringify({at:new Date().toISOString(),directPlayerWrites:0,player:p}));}finally{await c.close()}})().catch(e=>{console.error(e.message);process.exitCode=1;});"""
            if args.snapshot.startswith('compose-'):
                js=js.replace("'petInfo.field':1,'petInfo.pets.uid':1,'petInfo.pets.id':1,'petInfo.pets.slot':1", "petInfo:1,'other_attr_info.petSoulInfo':1")
            data=json.loads(run(ssh,'node -',js))
            name=('compose_'+args.snapshot.removeprefix('compose-')+'.json') if args.snapshot.startswith('compose-') else ('buy_ui_'+args.snapshot+'.json')
            out=Path(__file__).resolve().parents[1]/'temp/pet_incident_20260924'/name
            if args.snapshot == 'compose-before':
                backup=Path(__file__).resolve().parents[1]/'backups/pet_compose_ui_20260924'
                backup.mkdir(parents=True,exist_ok=True)
                with (backup/'tuanpkt_s5_pet_before.json').open('x',encoding='utf-8') as handle:
                    json.dump(data,handle,ensure_ascii=False,indent=2)
            out.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
            p=data.get('player') or {}
            summary={'at':data.get('at'),'userId':p.get('userId'),'currencies':p.get('currencies'),'items':p.get('items'),'field':p.get('petInfo',{}).get('field'),'pets':[{k:x.get(k) for k in ['uid','id','slot','level','locked']} for x in p.get('petInfo',{}).get('pets',[])]}
            print(json.dumps(summary,ensure_ascii=True,indent=2))
            return
        js="""const fs=require('fs'),c=require('crypto');const h=p=>c.createHash('sha256').update(fs.readFileSync(p)).digest('hex');const cp=require('child_process');const pm=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'}));console.log(JSON.stringify({files:Object.fromEntries(['src/handlers/item.js','src/handlers/pet.js','src/net/WSServer.js','src/handlers/index.js'].map(r=>['/linhhoasu/lhs/newServer/'+r,h('/linhhoasu/lhs/newServer/'+r)])),nodes:pm.filter(p=>/^lhs-s100[1-5]$/.test(p.name)).map(p=>({name:p.name,status:p.pm2_env.status,pid:p.pid,out:p.pm2_env.pm_out_log_path,err:p.pm2_env.pm_err_log_path}))}));"""
        data=json.loads(run(ssh,'node -e '+shlex.quote(js)))
        print(json.dumps(data,ensure_ascii=True,indent=2))
    finally: ssh.close()
if __name__=='__main__': main()
