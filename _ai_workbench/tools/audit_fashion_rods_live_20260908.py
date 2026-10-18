"""Read-only source hashes and narrow ownership aggregates. No gameplay calls."""
import hashlib, json
from datetime import datetime, timezone
from snapshot_web_multiserver_20260906 import WB, connect, run
from release_huyenvu_daily_20260906 import hashes, ready, pm2

OUT = WB / 'temp/fashion_rods_audit_20260908'
FILES = ['linhhoasu/lhs/newServer/src/' + p for p in [
    'handlers/fashion.js', 'handlers/fish.js', 'handlers/playerPayload.js', 'handlers/item.js',
    'services/RoleAppearanceService.js', 'services/RewardGrantService.js', 'services/FashionBoxService.js',
    'services/FishingIntegrityService.js', 'services/RechargeRewardResolver.js',
]] + ['linhhoasu/webgame/game/' + p for p in [
    'js/main.min_a6195824.js', 'index.html', 'update/resource/assets/cfg/gameEui_18e11b8e.bin',
    'update/resource/assets/excel/config_e5ac72c2.bin', 'update/resource/default.res_main_c669f2c0.bin',
    'update/resource/default.res_cn_main_f70d4753.bin', 'update/resource/default.res_tw_main_2ff8859f.bin',
]]

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    s = connect()
    try:
        processes = pm2(s)
        remote = hashes(s, ['/' + p for p in FILES])
        files = [{'file': p, 'local': hashlib.sha256((WB.parent/p).read_bytes()).hexdigest(), 'remote': remote['/'+p]} for p in FILES]
        query = r"""const {MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
(async()=>{const db=new MongoClient('mongodb://127.0.0.1:27017',{serverSelectionTimeoutMS:10000});await db.connect();const out=[];
try{for(const sid of [1001,1002]){const col=db.db('lhs_s'+sid).collection('players');
const players=await col.find({name:'nicky',isBot:{$ne:true}},{projection:{_id:0,name:1,roleInfo:1,fashionInfo:1,
 'fishInfo.rodId':1,'items.5901':1,'items.5902':1,'items.5903':1,'items.5904':1,'items.5905':1,'items.5906':1,'items.5907':1,'items.5908':1,
 'rechargeInfo.records':1,'rechargeInfo.monthCards.11000009':1,'items.29040':1}}).limit(2).toArray();
const samples=players.map(p=>({name:p.name,role:{kungfuId:p.roleInfo?.kungfuId,subJob:p.roleInfo?.subJob},rodId:p.fishInfo?.rodId,
 gearItems:p.items,rodPurchases:(p.rechargeInfo?.records||[]).filter(r=>[5902,3000001,11000009,11000101,11000102,11000106,11000107].includes(r.id)),
 card11000009Active:Number(p.rechargeInfo?.monthCards?.[11000009]||0)>Date.now(),
 currentFashion:p.fashionInfo?.curFashion,sets:p.fashionInfo?.sets,suits:p.fashionInfo?.suits,
 ownedFashion:(p.fashionInfo?.activateFashion||[]).filter(id=>id>=20000),selectedSet:p.fashionInfo?.setId}));
const aggregate=[];for(const [id,pay]of [[5904,3000001],[5905,11000101],[5906,11000102],[5907,11000106],[5908,11000107]]){
const owned=await col.countDocuments({isBot:{$ne:true},['items.'+id]:{$gt:0}},{maxTimeMS:10000});
const paidMissing=await col.countDocuments({isBot:{$ne:true},'rechargeInfo.records':{$elemMatch:{id:pay,count:{$gt:0}}},['items.'+id]:{$not:{$gt:0}}},{maxTimeMS:10000});aggregate.push({rodId:id,payId:pay,owned,paidMissing});}
out.push({serverId:sid,samples,rodOwnership:aggregate});}}finally{await db.close();}console.log(JSON.stringify(out));})().catch(e=>{console.error(e.name);process.exitCode=1;});"""
        ownership = json.loads(run(s, 'node -', query))
        # Read only the tables required to replay local client gates; do not print account/connection secrets.
        js = "const c=require('/linhhoasu/lhs/newServer/src/services/ConfigService'); console.log(JSON.stringify(Object.fromEntries(['FishRodConfig','AssetsConfig','FashionConfig','AppearanceConfig','FashionColorConfig','FashionDressConfig','FashionBaseConfig','RoleGenderConfig'].map(n=>[n,require('crypto').createHash('sha256').update(JSON.stringify(c.get(n))).digest('hex')]))));"
        config_hashes = json.loads(run(s,'node -',js).strip().splitlines()[-1])
        assert processes == pm2(s), 'PROCESS_STATE_CHANGED'
        result = {'at': datetime.now(timezone.utc).isoformat(), 'readOnly':True, 'files':files,
                  'configTableHashes':config_hashes, 'ownership':ownership, 'ready':ready(s), 'pm2Unchanged':True}
        (OUT/'live.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        print(json.dumps({'matched':sum(r['local']==r['remote'] for r in files),'totalFiles':len(files),
              'drift':[r['file'] for r in files if r['local']!=r['remote']], 'ownership':ownership,'ready':result['ready']}))
    finally:
        s.close()

if __name__=='__main__':
    main()
