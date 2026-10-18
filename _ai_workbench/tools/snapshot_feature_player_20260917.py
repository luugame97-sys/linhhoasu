"""Read an exact scoped player projection for isolated feature regression QA."""
import json
import sys
from pathlib import Path
sys.dont_write_bytecode = True
WB=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(WB/'temp/pydeps'))
from snapshot_web_multiserver_20260906 import connect,run
source=r'''
'use strict';
const {MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
(async()=>{const mongo=new MongoClient('mongodb://127.0.0.1:27017',{serverSelectionTimeoutMS:5000});await mongo.connect();
try{const projection={userId:1,playerId:1,name:1,level:1,exp:1,createdAt:1,createTime:1,updatedAt:1,boxInfo:1,equipInfo:1,
 taskInfo:1,raidInfo:1,roleInfo:1,systemUnlockInfo:1,other_attr_info:1,artifactInfo:1,valhallaInfo:1,bloodlineInfo:1,curiosInfo:1,
 elfInfo:1,formationInfo:1,items:1,currencies:1,mineInfo:1,doubleTowerInfo:1,fishInfo:1,spiritInfo:1,petInfo:1,swordInfo:1,
 fashionInfo:1,farmInfo:1,homelandInfo:1,alchemyInfo:1,activityInfo:1};
 const player=await mongo.db('lhs_s1003').collection('players').findOne({name:'Hứa Thanh'},{projection,maxTimeMS:5000});
 if(!player||String(player._id)!=='6aa637f972731bfc02940339')throw Error('TARGET_CHANGED');
 console.log(JSON.stringify({at:new Date().toISOString(),serverId:1003,productionWrites:0,player}));
}finally{await mongo.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
'''
ssh=connect()
try:data=json.loads(run(ssh,'node -',source))
finally:ssh.close()
out=WB/'temp/feature_unlock_release_20260917/hua_thanh_snapshot.json'
out.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'at':data['at'],'name':data['player']['name'],'level':data['player']['level'],
 'exp':data['player']['exp'],'output':str(out),'productionWrites':0},ensure_ascii=True))
