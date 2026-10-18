"""Narrow live evidence only: hashes, aggregate counts, no player identity or writes."""
import sys,json,hashlib,difflib
from datetime import datetime, timezone
from snapshot_web_multiserver_20260906 import connect,run,WB
from release_huyenvu_daily_20260906 import hashes,pm2,ready
OUT=WB/'temp/farm_alchemy_audit_20260907'
FILES=['linhhoasu/lhs/newServer/src/'+x for x in ['handlers/farm.js','handlers/alchemy.js','handlers/item.js','services/AlchemyCraftService.js','services/PlayerService.js','services/PlayerMutationService.js','net/WSServer.js']]+['linhhoasu/webgame/game/js/main.min_a6195824.js','linhhoasu/webgame/game/js/lhs-alchemy-v1.js','linhhoasu/webgame/game/index.html']
def main():
    OUT.mkdir(exist_ok=True);s=connect()
    try:
        hs=hashes(s,['/'+x for x in FILES]);files=[]
        with s.open_sftp() as f:
            for p in FILES:
                local=(WB.parent/p).read_bytes();row={'file':p,'local':hashlib.sha256(local).hexdigest(),'remote':hs['/'+p]}
                if row['local']!=row['remote']:
                    remote=f.open('/'+p,'rb').read()
                    a=local.decode('utf-8').replace('\r','');b=remote.decode('utf-8').replace('\r','')
                    row['normalizedEqual']=a==b
                    row['diff']=''.join(difflib.unified_diff(a.splitlines(True),b.splitlines(True)))[:8000]
                    # Audit-only copy for reproducing the actual live handler.
                    (OUT/('live-'+p.split('/')[-1])).write_bytes(remote)
                files.append(row)
        js=r"""const c=require('/linhhoasu/lhs/newServer/src/services/ConfigService');const names=['AssetsConfig','ShopConfig','AssetsUseConfig','AssetsExchangeConfig','PlantBaseConfig','PlantConfig','PlantMagicConfig','PlantBuildConfig','PlantLevelConfig','AlchemyFormulaConfig','AlchemyRoleConfig','AlchemyBaseConfig'];for(const p of ['/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin','/linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin']){c.reload(p);console.log(JSON.stringify({path:p,tables:Object.fromEntries(names.map(n=>[n,require('crypto').createHash('sha256').update(JSON.stringify(c.get(n))).digest('hex')]))}));}"""
        tables=[json.loads(x)for x in run(s,'node -',js).splitlines() if x.startswith('{')]
        query=r"""const {MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017',{serverSelectionTimeoutMS:10000});await c.connect();try{for(const sid of[1001,1002]){const col=c.db('lhs_s'+sid).collection('players');const meta=await col.aggregate([{$match:{isBot:{$ne:true}}},{$group:{_id:null,players:{$sum:1},alchemyOutOfRange:{$sum:{$cond:[{$gt:['$alchemyInfo.level',60]},1,0]}},boughtHerb:{$sum:{$ifNull:['$shopInfo.buyRecords.6000003',0]}},herbs2101:{$sum:{$ifNull:['$items.2101',0]}},pills110131:{$sum:{$ifNull:['$items.110131',0]}},linhthuc:{$sum:{$ifNull:['$items.34',0]}}}}],{maxTimeMS:10000}).toArray();const blocks=await col.aggregate([{$match:{isBot:{$ne:true}}},{$unwind:'$farmInfo.blockInfo'},{$match:{'farmInfo.blockInfo.rewardId':{$gt:0}}},{$group:{_id:{magic:{$gte:['$farmInfo.blockInfo.index',100]},rewardId:'$farmInfo.blockInfo.rewardId'},count:{$sum:1}}}],{maxTimeMS:10000}).toArray();console.log(JSON.stringify({serverId:sid,meta:meta[0],blocks}));}}finally{await c.close()}})().catch(e=>{console.error(e.name);process.exitCode=1})"""
        aggregates=[json.loads(x)for x in run(s,'node -',query).splitlines() if x.startswith('{')]
        result={'at':datetime.now(timezone.utc).isoformat(),'readOnly':True,'files':files,'tables':tables,'aggregates':aggregates,'pm2':pm2(s),'ready':ready(s)}
        (OUT/'live.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
        print(json.dumps({'matches':sum(x['local']==x['remote']for x in files),'files':len(files),'drift':[x for x in files if x['local']!=x['remote']],'tablesSame':tables[0]['tables']==tables[1]['tables'],'aggregates':aggregates,'ready':result['ready']}))
    finally:s.close()
if __name__=='__main__':main()
