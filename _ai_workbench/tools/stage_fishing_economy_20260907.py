"""Exact current source staging and runtime config path inventory. No production edits."""
import hashlib,json,shlex,sys
from snapshot_web_multiserver_20260906 import WB,connect,run
from release_huyenvu_daily_20260906 import pm2,ready
ROOT=WB/'temp/fishing_economy_20260907';BASE=WB/'temp/fishing_audit_20260906T212212Z';APP='/linhhoasu/lhs/newServer';GAME='/linhhoasu/webgame/game'
STAGE='/linhhoasu/_ai_workbench/temp/fishing_economy_20260907'
FILES=['src/config/fishingEconomy.json','src/services/FishingEconomyService.js','src/services/FishingGameplayService.js','src/services/FishingEventService.js','src/handlers/fish.js','src/handlers/item.js','src/handlers/raid.js','src/handlers/mail.js','src/handlers/playerPayload.js']
def main():
 sys.stdout.reconfigure(encoding='utf-8');s=connect()
 try:
  run(s,'install -d -m 700 '+STAGE+'/app '+STAGE+'/tools; cp -a '+APP+'/src '+STAGE+'/app/src; cp -a '+APP+'/scripts '+STAGE+'/app/scripts')
  with s.open_sftp()as f:
   for rel in FILES:f.put(str(ROOT/'app'/rel),STAGE+'/app/'+rel)
   for file in ['server.bin','client.bin','lang.bin']:f.put(str(ROOT/file),STAGE+'/'+file)
   for name in ['test_fishing_economy_20260907.js','test_fishing_gameplay_events_20260906.js']:f.put(str(WB/'tools'/name),STAGE+'/tools/'+name)
  # Use installed dependency tree with isolated stage source, tests forbid network.
  run(s,'test -e '+STAGE+'/app/node_modules || ln -s '+APP+'/node_modules '+STAGE+'/app/node_modules')
  for rel in FILES:
   if rel.endswith('.js'):run(s,'node --check '+STAGE+'/app/'+rel)
  tests=json.loads(run(s,'NODE_PATH='+APP+'/node_modules node '+STAGE+'/tools/test_fishing_economy_20260907.js '+STAGE));assert tests['result']=='PASS'
  core=run(s,'cd '+STAGE+'/app && NODE_PATH='+APP+'/node_modules NODE_ENV=test LOG_DIR= CONFIG_BIN_PATH='+STAGE+'/server.bin node scripts/test-core-gameplay-contract.js')
  assert '"result": "ok"' in core or '"result":"ok"' in core
  script=r'''const fs=require('fs'),cp=require('child_process'),dotenv=require('/linhhoasu/lhs/newServer/node_modules/dotenv');let all=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'}));const root='/linhhoasu/lhs/newServer';const result=[];for(const name of['lhs-s1001','lhs-s1002']){const p=all.find(p=>p.name===name);const raw=Object.fromEntries(fs.readFileSync('/proc/'+p.pid+'/environ','utf8').split('\0').filter(Boolean).map(s=>{const i=s.indexOf('=');return[s.slice(0,i),s.slice(i+1)];}));const env={...dotenv.parse(fs.readFileSync(root+'/.env')),...raw};result.push({name,config:env.CONFIG_BIN_PATH||null,cwd:p.pm2_env.pm_cwd});}console.log(JSON.stringify(result));'''
  runtime=json.loads(run(s,'node -',script))
  (ROOT/'stage.json').write_text(json.dumps({'stage':STAGE,'tests':tests,'core':core,'pm2':pm2(s),'ready':ready(s),'runtime':runtime,'files':FILES},indent=2)+'\n')
  print(json.dumps({'stage':STAGE,'tests':tests['count'],'core':'ok','runtime':runtime}))
 finally:s.close()
if __name__=='__main__':main()
