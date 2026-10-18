"""Read-only, scoped config/runtime inventory for contest6006 rank multiplier."""
import hashlib,json,sys,shutil
from datetime import datetime,timezone
from pathlib import Path
from snapshot_web_multiserver_20260906 import WB,connect,run
from release_huyenvu_daily_20260906 import hashes,pm2,ready

ROOT=WB/'temp/fishing_rank_x10_20260907'
APP='/linhhoasu/lhs/newServer'
GAME='/linhhoasu/webgame/game'
SERVER='/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin'
CLIENT=GAME+'/update/resource/assets/excel/config_e5ac72c2.bin'
GUARD=[APP+'/src/services/'+n for n in ['ConfigService.js','FishingEventService.js','FishingEventSchedule.js','FishingIntegrityService.js','FishingBalanceService.js','FishingEconomyService.js']]+[
    APP+'/src/handlers/item.js',APP+'/src/handlers/fish.js',APP+'/src/config/fishingGameplayBalance.json',GAME+'/js/lhs-item-quantity-v1.js',GAME+'/js/main.min_a6195824.js',GAME+'/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin']

def main():
    if len(sys.argv)>1 and sys.argv[1]=='add-currency':
        assert not (ROOT/'release.json').exists(),'RELEASE_ALREADY_STARTED'
        pre=json.loads((ROOT/'preflight.json').read_text(encoding='utf-8'));s=connect()
        try:
            assert hashes(s,list(pre['baseline']))==pre['baseline'],'DRIFT_BEFORE_CURRENCY_ADD'
            economy=APP+'/src/config/fishingEconomy.json';lang=GAME+'/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin'
            extra=hashes(s,[economy]);assert extra[economy]
            with s.open_sftp() as f:
                f.get(economy,str(ROOT/'economy.before.json'));f.get(lang,str(ROOT/'lang.before.bin'))
            assert hashlib.sha256((ROOT/'economy.before.json').read_bytes()).hexdigest()==extra[economy]
            assert hashlib.sha256((ROOT/'lang.before.bin').read_bytes()).hexdigest()==pre['baseline'][lang]
            assert json.loads((ROOT/'economy.before.json').read_text())['currency']['saleChanceBps']==2000
            assert not (ROOT/'preflight.rank-only.json').exists(),'CURRENCY_ALREADY_ADDED'
            shutil.copy2(ROOT/'preflight.json',ROOT/'preflight.rank-only.json')
            pre['baseline'].update(extra);pre['currencyAddedAt']=datetime.now(timezone.utc).isoformat()
            (ROOT/'preflight.json').write_text(json.dumps(pre,indent=2)+'\n')
            print(json.dumps({'currencyPreflight':True,'chanceBpsBefore':2000,'targetChanceBps':200,'totalGuardedFiles':len(pre['baseline'])}))
        finally:s.close()
        return
    assert not (ROOT/'preflight.json').exists(),'PREFLIGHT_EXISTS_CHECK_DRIFT'
    ROOT.mkdir(exist_ok=True);s=connect()
    try:
        script=r'''const fs=require('fs'),path=require('path'),cp=require('child_process'),dotenv=require('/linhhoasu/lhs/newServer/node_modules/dotenv');const root='/linhhoasu/lhs/newServer';const all=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'}));const result=[];for(const name of['lhs-s1001','lhs-s1002']){const p=all.find(x=>x.name===name);if(!p||p.pm2_env.status!=='online')throw Error('PROCESS_NOT_ONLINE');const raw=Object.fromEntries(fs.readFileSync('/proc/'+p.pid+'/environ','utf8').split('\0').filter(Boolean).map(s=>{const i=s.indexOf('=');return[s.slice(0,i),s.slice(i+1)];}));const env={...dotenv.parse(fs.readFileSync(root+'/.env')),...raw};const candidates=[env.CONFIG_BIN_PATH,root+'/../LHS-re/update/resource/assets/excel/config_e5ac72c2.bin',root+'/../update/resource/assets/excel/config_e5ac72c2.bin'].filter(Boolean);result.push({name,pid:p.pid,cwd:p.pm2_env.pm_cwd,config:fs.realpathSync(candidates.find(x=>fs.existsSync(x))),errorLog:p.pm2_env.pm_err_log_path,errorLogSize:fs.existsSync(p.pm2_env.pm_err_log_path)?fs.statSync(p.pm2_env.pm_err_log_path).size:0});}console.log(JSON.stringify({runtime:result,serverUtc:new Date().toISOString()}));'''
        inventory=json.loads(run(s,'node -',script))
        assert all(r['config']==SERVER and r['cwd']==APP for r in inventory['runtime']),'CONFIG_OWNER_PATH'
        baseline=hashes(s,[SERVER,CLIENT,GAME+'/index.html']+GUARD)
        assert all(baseline.values()),'MISSING_FILES'
        before=pm2(s);health=ready(s);assert health=={'8080':200,'8083':200}
        with s.open_sftp() as f:
            for name,remote in [('server.before.bin',SERVER),('client.before.bin',CLIENT),('index.before.html',GAME+'/index.html')]:
                f.get(remote,str(ROOT/name));assert hashlib.sha256((ROOT/name).read_bytes()).hexdigest()==baseline[remote]
        state={'at':datetime.now(timezone.utc).isoformat(),'baseline':baseline,'pm2':before,'ready':health,**inventory}
        (ROOT/'preflight.json').write_text(json.dumps(state,indent=2)+'\n')
        print(json.dumps({'readOnly':True,'files':len(baseline),'runtime':inventory['runtime'],'ready':health,'serverUtc':inventory['serverUtc']}))
    finally:s.close()

if __name__=='__main__':main()
