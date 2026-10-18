"""Read-only source guard and narrow anonymous inventory counts. No player mutation."""
import hashlib,json
from datetime import datetime,timezone
from snapshot_web_multiserver_20260906 import WB,connect,run
from release_huyenvu_daily_20260906 import hashes,ready

ROOT=WB/'temp/player_power_fashion_audit_20260907'
FILES=['linhhoasu/webgame/game/js/main.min_a6195824.js','linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin','linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin']+['linhhoasu/lhs/newServer/src/'+r for r in ['handlers/account.js','handlers/playerPayload.js','handlers/fish.js','handlers/item.js','handlers/fashion.js','handlers/raid.js','services/BattleService.js','services/FishingIntegrityService.js','services/FishingEconomyService.js','services/RewardGrantService.js','services/RoleAppearanceService.js','config/fishingEconomy.json']]

def main():
    ROOT.mkdir(exist_ok=True);s=connect()
    try:
        live=hashes(s,['/'+p for p in FILES]);rows=[]
        for rel in FILES:
            local=hashlib.sha256((WB.parent/rel).read_bytes()).hexdigest()
            rows.append({'file':rel,'local':local,'remote':live['/'+rel],'match':local==live['/'+rel]})
        # Raw MongoDB driver: do not load player service/models or create indexes.
        query=r'''const {MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017',{serverSelectionTimeoutMS:10000});await c.connect();const results=[];try{for(const sid of[1001,1002]){const full={$and:[29041,29042,29043,29049].map(id=>({$or:[{$in:[id,{$ifNull:['$fashionInfo.activateFashion',[]]}]},{$gt:[{$ifNull:['$fashionInfo.fashions.'+id,0]},0]}]}))};const rows=await c.db('lhs_s'+sid).collection('players').aggregate([{$match:{isBot:{$ne:true},'items.29040':{$gt:0}}},{$project:{_id:0,boxCount:'$items.29040',full}},{$group:{_id:null,matchingPlayers:{$sum:1},hiddenBoxes:{$sum:'$boxCount'},withoutFullOwnership:{$sum:{$cond:['$full',0,1]}},alreadyOwnedButBoxRemains:{$sum:{$cond:['$full',1,0]}}}}],{maxTimeMS:10000}).toArray();results.push({serverId:sid,...(rows[0]||{matchingPlayers:0,hiddenBoxes:0,withoutFullOwnership:0,alreadyOwnedButBoxRemains:0})});}}finally{await c.close();}console.log(JSON.stringify(results));})().catch(e=>{console.error(e.name+': read-only inventory query failed');process.exitCode=1;});'''
        inventory=json.loads(run(s,'node -',query))
        config_query=r'''process.env.LOG_DIR='';process.env.CONFIG_BIN_PATH='/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin';const cfg=require('/linhhoasu/lhs/newServer/src/services/ConfigService').loadAllTables();console.log(JSON.stringify({asset29040:cfg.AssetsConfig[29040],use29040:cfg.AssetsUseConfig[29040],componentIds:cfg.FashionColorConfig[29040][0].fashionIds,shop11012001:cfg.ShopConfig[11012001].rewards,gem25051:cfg.GemLevelConfig[25051],gemShape103:cfg.GemShapeConfig[103]}));'''
        remote_config=json.loads(run(s,'node -',config_query).strip().splitlines()[-1])
        result={'at':datetime.now(timezone.utc).isoformat(),'readOnly':True,'files':rows,'anonymousInventory':inventory,'remoteConfig':remote_config,'ready':ready(s)}
        (ROOT/'live.json').write_text(json.dumps(result,indent=2)+'\n')
        print(json.dumps({'at':result['at'],'files':len(rows),'matched':sum(x['match'] for x in rows),'mismatches':[x['file'] for x in rows if not x['match']],'anonymousInventory':inventory,'remoteConfig':remote_config,'ready':result['ready']}))
    finally:s.close()

if __name__=='__main__':main()
