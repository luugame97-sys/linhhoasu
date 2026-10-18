"""Upload candidate allowlist to workbench, test in separate process/QA DB only.
Never swaps production files, never restarts PM2, never edits real players.
"""
import hashlib, json, shlex, sys
from pathlib import Path
from datetime import datetime, timezone
from snapshot_web_multiserver_20260906 import connect, run
sys.stdout.reconfigure(encoding='utf8')
ROOT=Path(__file__).resolve().parents[2]
APP=ROOT/'linhhoasu/lhs/newServer'
REMOTE='/linhhoasu/lhs/newServer'
FILES=['src/handlers/old-trek.js','src/handlers/index.js','src/services/PlayerService.js','src/app.js',
 'src/services/RechargeRewardResolver.js','src/services/RechargeBenefitService.js','src/handlers/compat.js','src/handlers/recharge.js','src/services/OldTrekPassService.js',
 'src/services/OldTrekLedgerService.js','src/services/OldTrekEventService.js','src/services/OldTrekProgressService.js',
 'src/services/OldTrekArenaService.js','src/services/OldTrekPuzzleService.js','src/services/OldTrekScheduleService.js',
 'src/services/OldTrekSettlementService.js','src/config/oldTrekGameplayPolicy.json',
 'scripts/test-oldtrek-events.js','scripts/test-oldtrek-domain.js','scripts/test-oldtrek-puzzle.js','scripts/test-oldtrek-settlement.js','scripts/test-oldtrek-mongo.js','scripts/test-oldtrek-pass.js','scripts/test-oldtrek-cas.js']
FILES += ['ecosystem.config.js']
def main():
 stamp=datetime.now().strftime('%H%M%S');stage='/linhhoasu/_ai_workbench/temp/oldtrek_v2_20260921_'+stamp
 report={'at':datetime.now(timezone.utc).isoformat(),'stage':stage,'productionFileWrites':0,'pm2Restarts':0,'realPlayerWrites':0,'files':{},'tests':{}}
 ssh=connect()
 try:
  with ssh.open_sftp() as sftp:
   for rel in FILES:
    dest=stage+'/'+rel;data=(APP/rel).read_bytes();run(ssh,'mkdir -p '+shlex.quote(str(Path(dest).parent).replace('\\','/')))
    with sftp.open(dest,'wb') as f:f.write(data)
    actual=sftp.open(dest,'rb').read();assert actual==data
    report['files'][rel]=hashlib.sha256(data).hexdigest()
  # Overlay only explicitly staged module files; unmodified dependencies and
  # node_modules resolve to production installation, without being copied.
  bootstrap=r'''
const fs=require('fs'),path=require('path'),Module=require('module');
const stage=STAGE,app=APP,original=Module._resolveFilename;
Module._resolveFilename=function(request,parent,...rest){
 if(parent?.filename && request.startsWith('.')){
  let relative=null;
  if(parent.filename.startsWith(stage+'/'))relative=path.relative(stage,parent.filename);
  else if(parent.filename.startsWith(app+'/'))relative=path.relative(app,parent.filename);
  if(relative){
   const logical=path.resolve(app,path.dirname(relative),request),over=path.resolve(stage,path.relative(app,logical));
   if(over.startsWith(stage+'/'))for(const suffix of ['', '.js','.json'])if(fs.existsSync(over+suffix)&&fs.statSync(over+suffix).isFile())return over+suffix;
   return original.call(this,logical,parent,...rest);
  }
 }
 return original.call(this,request,parent?{...parent,paths:[app+'/node_modules',...(parent.paths||[])]}:parent,...rest);
};
require(stage+'/scripts/'+TEST);
'''.replace('STAGE',json.dumps(stage)).replace('APP',json.dumps(REMOTE))
  for test in ['test-oldtrek-events.js','test-oldtrek-domain.js','test-oldtrek-puzzle.js','test-oldtrek-settlement.js','test-oldtrek-pass.js','test-oldtrek-cas.js','test-oldtrek-mongo.js']:
   script=bootstrap.replace('TEST',json.dumps(test));env='OLD_TREK_QA_DB=lhs_qa_oldtrek_20260921_'+stamp+' '
   output=run(ssh,'cd '+shlex.quote(REMOTE)+' && '+env+'node',script)
   report['tests'][test]=output;print(test+'\n'+output[-1800:],flush=True)
 finally:
  ssh.close();(ROOT/'_ai_workbench/temp/oldtrek_v2_stage_20260921.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
 print('STAGE_ONLY '+stage)
if __name__=='__main__':main()
