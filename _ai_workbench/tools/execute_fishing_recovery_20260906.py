"""Execute approved fishing Baozi recovery and timed discipline, with rollback gates."""
from __future__ import annotations
import json, shlex, sys, time
from datetime import datetime, timezone
from pathlib import Path
import paramiko
from release_huyenvu_daily_20260906 import run, hashes, pm2, ready, wait_ready

WB=Path(__file__).resolve().parents[1]; ROOT=WB/'temp/fishing_recovery_20260906'; APP='/linhhoasu/lhs/newServer'; GAME='/linhhoasu/webgame/game'
NODE='fishing_recovery_game_20260906.js'; PHP='fishing_recovery_web_20260906.php'

def q(v): return shlex.quote(str(v))
def write(name,data): (ROOT/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def node_cmd(action,remote_root,remote_plan,backup): return f'cd {APP} && node {q(remote_root+"/"+NODE)} {action} {q(remote_plan)} {q(backup)}'
def parsed(raw):
    try:return json.loads(raw)
    except json.JSONDecodeError:
        for line in reversed(raw.splitlines()):
            try:return json.loads(line)
            except json.JSONDecodeError:continue
        raise

def main():
    raise RuntimeError('WITHDRAWN: unsafe out-of-process recovery; partial web state restored. Use in-process incident endpoint with confirmed saves.')
    sys.stdout.reconfigure(encoding='utf-8')
    plan=json.loads((ROOT/'plan.json').read_text(encoding='utf-8'));assert len(plan['rows'])==19 and 'vanduc97' in plan['excludeBans']
    assert sum(int(r['amount']) for r in plan['rows'])==231860
    stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');remote_root=f'/linhhoasu/_ai_workbench/temp/fishing_recovery_{stamp}';backup=f'/linhhoasu/_ai_workbench/backups/fishing_recovery_{stamp}'
    creds=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();ssh=paramiko.SSHClient();ssh.load_system_host_keys();ssh.set_missing_host_key_policy(paramiko.RejectPolicy());ssh.connect(creds[0].strip(),username='root',password=creds[2],look_for_keys=False,allow_agent=False,timeout=20)
    web_applied=False;game_banned=False;players_recovered=False;mails_sent=False;report={'incident':plan['incident'],'startedAt':datetime.now(timezone.utc).isoformat(),'remoteRoot':remote_root,'backup':backup,'excluded':['vanduc97']}
    try:
        deployed=json.loads((WB/'temp/fishing_contest_shop_20260906/deploy.json').read_text());expected=deployed['expected'];before=pm2(ssh);assert hashes(ssh,list(expected))==expected,'PRODUCTION_DRIFT';assert ready(ssh)=={'8080':200,'8083':200}
        run(ssh,f'install -d -m 700 {q(remote_root)} {q(backup)}')
        remote_plan=remote_root+'/plan.json';sftp=ssh.open_sftp()
        try:
            sftp.put(str(ROOT/'plan.json'),remote_plan);sftp.put(str(WB/'tools'/NODE),remote_root+'/'+NODE);sftp.put(str(WB/'tools'/PHP),remote_root+'/'+PHP)
        finally:sftp.close()
        # Immutable preflight snapshots; no game/web mutation in this step.
        game_pre=parsed(run(ssh,node_cmd('preflight',remote_root,remote_plan,backup),timeout=60));assert game_pre['result']=='PASS'
        web_pre=parsed(run(ssh,f'php {q(remote_root+"/"+PHP)} preflight {q(remote_plan)} {q(backup)}',timeout=45));assert web_pre['result']=='PASS';assert not web_pre['activeUnrelated']
        report['preflight']={'game':game_pre,'web':web_pre};write('preflight-execution.json',report)
        # Apply WebGM state first. Missing WebGM accounts are recorded as not-applicable; no fake account is created.
        web_apply=parsed(run(ssh,f'php {q(remote_root+"/"+PHP)} apply {q(remote_plan)} {q(backup)}',timeout=90));assert web_apply['result']=='PASS';web_applied=True;report['webApply']=web_apply;write('progress.json',report)
        # Account ban endpoint performs server-authoritative ban, auth-token revocation, and active-session notice/kick.
        game_ban=parsed(run(ssh,node_cmd('ban',remote_root,remote_plan,backup),timeout=240));assert game_ban['result']=='PASS';game_banned=True;report['gameBan']=game_ban;write('progress.json',report)
        time.sleep(3)
        recovered=parsed(run(ssh,node_cmd('recover',remote_root,remote_plan,backup),timeout=240));assert recovered['result']=='PASS';players_recovered=True;report['playerRecovery']=recovered;write('progress.json',report)
        mails=parsed(run(ssh,node_cmd('mail',remote_root,remote_plan,backup),timeout=240));assert mails['result']=='PASS';mails_sent=True;report['notices']=mails;write('progress.json',report)
        game_verify=parsed(run(ssh,node_cmd('verify',remote_root,remote_plan,backup),timeout=90));assert game_verify['result']=='PASS';web_verify=parsed(run(ssh,f'php {q(remote_root+"/"+PHP)} verify {q(remote_plan)} {q(backup)}',timeout=90));assert web_verify['result']=='PASS';
        after=pm2(ssh);assert after==before,'UNEXPECTED_PROCESS_CHANGE';assert ready(ssh)=={'8080':200,'8083':200}
        report.update(result='PASS',finishedAt=datetime.now(timezone.utc).isoformat(),gameVerify=game_verify,webVerify=web_verify,afterPm2=after,ready=ready(ssh),productionWrites='approved recovery, account discipline, WebGM notices')
        write('execute-result.json',report);print(json.dumps({'result':'PASS','backup':backup,'targets':19,'recoveredBaozi':231860,'bannedAccounts':18,'excludedBan':'vanduc97','webMissingAccounts':web_apply.get('missingWebAccounts',[]),'ready':report['ready']},ensure_ascii=False))
    except Exception as error:
        report.update(result='FAIL',error=str(error),rollbackStartedAt=datetime.now(timezone.utc).isoformat())
        # Roll back only our incident marker; never overwrite unrelated account bans or player changes.
        try:
            if mails_sent: report['rollbackMails']=parsed(run(ssh,node_cmd('delete-mails',remote_root,remote_plan,backup),timeout=90))
            if players_recovered: report['rollbackPlayers']=parsed(run(ssh,node_cmd('rollback',remote_root,remote_plan,backup),timeout=240))
            if game_banned: report['rollbackGameBans']=parsed(run(ssh,node_cmd('unban',remote_root,remote_plan,backup),timeout=240))
            if web_applied: report['rollbackWeb']=parsed(run(ssh,f'php {q(remote_root+"/"+PHP)} rollback {q(remote_plan)} {q(backup)}',timeout=120))
            report['rollbackReady']=ready(ssh);write('execute-error.json',report)
        finally: raise
    finally:
        ssh.close()

if __name__=='__main__':main()
