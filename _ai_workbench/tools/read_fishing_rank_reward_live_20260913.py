import json
from snapshot_web_multiserver_20260906 import connect,run
JS=r'''const fs=require('fs'),c=require('/linhhoasu/lhs/newServer/src/services/ConfigService');const out=[];for(const p of ['/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin','/linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin','/linhhoasu/webgame/game/update/resource/assets/excel/config_fashion_20260909.bin']){const t=c.decodeTables(fs.readFileSync(p)),r=t.Activity6RankConfig[6006];out.push({file:p,hash:require('crypto').createHash('sha256').update(fs.readFileSync(p)).digest('hex'),rewards:Object.fromEntries(Object.entries(r).map(([k,v])=>[k,(v.rewards||[]).filter(x=>x.id===99002)])),item:!!t.AssetsConfig?.[99002]});}const live=c.loadAllTables();out.push({effectiveServer:live.AssetsConfig?.[99002],effectiveUse:live.AssetsUseConfig?.[99002],effectiveRank:Object.fromEntries(Object.entries(live.Activity6RankConfig[6006]).map(([k,v])=>[k,(v.rewards||[]).filter(x=>x.id===99002)]))});console.log(JSON.stringify(out));'''
if __name__=='__main__':
 s=connect()
 try: print(run(s,'node',JS))
 finally:s.close()
