"""Guarded admin identity deployment. No rewards, player mutations or game restarts."""
import hashlib
import json
import os
import posixpath
import shlex
from datetime import datetime, timezone
from pathlib import Path
import paramiko

ROOT = Path(__file__).resolve().parents[1]
CANDIDATE = ROOT / 'temp/webgm_admin_identity_candidate_20260904'
BASELINE = ROOT / 'temp/server2_bots_webgm_snapshot_20260904_033416/webgm'
FILES = ['config.php','api/user_api.php','admin/admin_api.php','admin/index.php','assets/js/admin.js']
REMOTE = '/linhhoasu/webgame/gm'

def main():
    c=Path(os.environ['LHS_PROD_CREDENTIAL_FILE']).read_text(encoding='utf-8-sig').splitlines()
    if c[0].strip()!='103.116.105.154' or c[1].strip()!='root': raise RuntimeError('TARGET_MISMATCH')
    ssh=paramiko.SSHClient(); ssh.load_system_host_keys(); ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    ssh.connect(c[0].strip(),username=c[1].strip(),password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
    stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    stage='/linhhoasu/_ai_workbench/temp/admin_identity_'+stamp
    backup='/linhhoasu/_ai_workbench/backups/admin_identity_'+stamp
    installed=[]
    evidence={'backup':backup,'stage':stage,'checks':[],'schemaColumnRetainedOnRollback':True}
    def run(cmd,stdin='',timeout=60):
        i,o,e=ssh.exec_command(cmd,timeout=timeout)
        if stdin: i.write(stdin); i.flush(); i.channel.shutdown_write()
        out=o.read().decode('utf-8','replace'); err=e.read().decode('utf-8','replace')
        if o.channel.recv_exit_status(): raise RuntimeError((err+out)[-1500:])
        return out
    def probe(root,mode,data):
        out=run('php '+shlex.quote(stage+'/qa_admin_identity.php')+' '+shlex.quote(root)+' '+mode,json.dumps(data),120)
        return json.loads(out)
    def snapshot_pm2():
        script='let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify(JSON.parse(s).map(p=>({name:p.name,pid:p.pid,restarts:p.pm2_env.restart_time,status:p.pm2_env.status})))))'
        return json.loads(run('pm2 jlist | node -e '+shlex.quote(script)))
    try:
        evidence['beforePm2']=snapshot_pm2()
        for rel in FILES:
            actual=run('sha256sum '+shlex.quote(REMOTE+'/'+rel)).split()[0]
            if actual!=hashlib.sha256((BASELINE/rel).read_bytes()).hexdigest(): raise RuntimeError('PRODUCTION_DRIFT:'+rel)
        run('install -d -m 700 '+stage+' '+backup+' '+stage+'/sessions')
        sftp=ssh.open_sftp()
        try:
            for rel in FILES:
                run('install -d -m 700 '+shlex.quote(posixpath.dirname(stage+'/'+rel))+' '+shlex.quote(posixpath.dirname(backup+'/'+rel)))
                run('cp -a '+shlex.quote(REMOTE+'/'+rel)+' '+shlex.quote(backup+'/'+rel))
                sftp.put(str(CANDIDATE/rel),stage+'/'+rel)
            sftp.put(str(ROOT/'tools/qa_admin_identity.php'),stage+'/qa_admin_identity.php')
        finally: sftp.close()
        run('ln -s '+REMOTE+'/.env '+stage+'/.env')
        for rel in FILES:
            run(('node --check ' if rel.endswith('.js') else 'php -l ')+shlex.quote(stage+'/'+rel))
        run('php -l '+stage+'/qa_admin_identity.php')
        evidence['schema']=probe(REMOTE,'migrate',{})
        # Read a real dual-server account, only retain comparison results in evidence.
        expr="JSON.stringify(db.players.find({isBot:{$ne:true},accountId:{$exists:true,$ne:''}},{_id:0,userId:1,accountId:1,name:1,serverId:1}).limit(1).toArray())"
        roles=json.loads(run('mongosh --quiet mongodb://127.0.0.1:27017/lhs_s1002 --eval '+shlex.quote(expr)))
        if not roles: raise RuntimeError('NO_S2_IDENTITY_FIXTURE')
        account=roles[0]['accountId']
        expr='JSON.stringify(db.players.find({accountId:'+json.dumps(account)+'},{_id:0,userId:1,accountId:1,name:1,serverId:1}).limit(10).toArray())'
        roles+=json.loads(run('mongosh --quiet mongodb://127.0.0.1:27017/lhs_s1001 --eval '+shlex.quote(expr)))
        fixture={'account':account,'roles':roles}
        def verify(root,phase):
            evidence['checks'].append({'phase':phase,'identity':probe(root,'identity',fixture)})
            for sid in ['1001','1002']:
                r=probe(root,'action',{'action':'get_users_list','search':account,'server_filter':sid})
                if r.get('status')!='success' or not r.get('data'): raise RuntimeError('USERS_FAILED:'+sid)
                expected=[v for v in roles if str(v['serverId'])==sid]
                for u in r['data']:
                    if u['server_id']!=sid: raise RuntimeError('USERS_SERVER_MISMATCH')
                    if u['AccountName']==account and expected:
                        if not any(v['userId']==u['role_id'] and v['name']==u['role_name'] for v in expected): raise RuntimeError('USER_IDENTITY_MISMATCH')
                if r.get('can_manage')!=(sid=='1001'): raise RuntimeError('READ_ONLY_CONTEXT_FAILED')
                for action in ['get_audit_logs','get_monitor_logs']:
                    r=probe(root,'action',{'action':action,'server_filter':sid,'period':'all'})
                    if r.get('status')!='success': raise RuntimeError('LOG_API_FAILED:'+action+':'+r.get('message',''))
                    if any(str(v['server_id'])!=sid for v in r['data']): raise RuntimeError('LOG_FILTER_LEAK')
                    for v in r['data']:
                        if 'server_name' not in v or 'identity_label' not in v: raise RuntimeError('LOG_FIELDS_MISSING')
                    evidence['checks'].append({'phase':phase,'action':action,'server':sid,'rows':len(r['data'])})
            for mode in ['unauthorized','bad_csrf']:
                r=probe(root,mode,{'action':'get_users_list'})
                if r.get('status')!='error': raise RuntimeError('AUTH_GUARD_FAILED')
            r=probe(root,'action',{'action':'get_monitor_logs','server_filter':'999999'})
            if r.get('status')!='error': raise RuntimeError('INVALID_SERVER_ALLOWED')
            r=probe(root,'action',{'action':'get_monitor_logs','period':'today'})
            if r.get('status')!='success': raise RuntimeError('ALL_LOGS_FAILED')
        verify(stage,'staging')
        for rel in FILES:
            installed.append(rel)
            run('install -m 644 '+shlex.quote(stage+'/'+rel)+' '+shlex.quote(REMOTE+'/'+rel))
            if run('sha256sum '+shlex.quote(REMOTE+'/'+rel)).split()[0]!=hashlib.sha256((CANDIDATE/rel).read_bytes()).hexdigest(): raise RuntimeError('DEPLOY_HASH_MISMATCH')
        verify(REMOTE,'production')
        evidence['afterPm2']=snapshot_pm2()
        if evidence['beforePm2']!=evidence['afterPm2']: raise RuntimeError('PROCESS_STATE_CHANGED')
        evidence['publicUnauth']=json.loads(run("curl -sS --max-time 10 -X POST -d action=get_users_list http://127.0.0.1:88/admin/admin_api.php"))['status']
        if evidence['publicUnauth']!='error': raise RuntimeError('PUBLIC_AUTH_BYPASS')
        evidence['result']='PASS'; evidence['generatedAt']=datetime.now(timezone.utc).isoformat()
        out=ROOT/('temp/admin_identity_deploy_'+stamp+'.json'); out.write_text(json.dumps(evidence,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps({'result':'PASS','checks':len(evidence['checks']),'backup':backup,'evidence':str(out),'sha256':hashlib.sha256(out.read_bytes()).hexdigest()}))
    except Exception:
        for rel in reversed(installed): run('cp -a '+shlex.quote(backup+'/'+rel)+' '+shlex.quote(REMOTE+'/'+rel))
        raise
    finally:
        ssh.close()

if __name__=='__main__': main()
