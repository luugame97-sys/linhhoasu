"""Scoped, hash-guarded WebGM release. Never restarts game/PHP services.

Phases: prepare -> gate -> publish -> verify -> open. The gate is an exact
temporary endpoint response and stays closed if any publication check fails.
Only opening restores operation; additive ledgers are never rolled back.
"""
import hashlib
import json
import posixpath
import shlex
import stat
import sys
from datetime import datetime, timezone

from snapshot_web_multiserver_20260906 import OUT, WB, REMOTE, connect, run
from web_multiserver_config_context_patch import apply_config_context_hardening

STATE = OUT/'release.json'
GATED = ['api/user_api.php','admin/admin_api.php','api/sepay_webhook.php']
HELPERS = ['daily_checkin.php','reward_delivery.php','web_context.php']
GATE = '''<?php
http_response_code(503);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('Retry-After: 120');
echo json_encode(array('status'=>'error','success'=>false,'code'=>'WEBGM_UPGRADING',
    'message'=>'WebGM đang cập nhật an toàn. Vui lòng thử lại sau ít phút; không tạo lại đơn thanh toán.'), JSON_UNESCAPED_UNICODE);
'''.encode('utf-8')


def now(): return datetime.now(timezone.utc).isoformat()
def digest(data): return hashlib.sha256(data).hexdigest()
def save(state): STATE.write_text(json.dumps(state, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')


def php_bootstrap():
    return (WB/'tools/webshop_schema_probe_20260906.php').read_text(encoding='utf-8').split('$out=array(')[0]


def pm2(ssh):
    js="let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.stringify(JSON.parse(s).filter(p=>/^lhs-/.test(p.name)).map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time})))));"
    return json.loads(run(ssh,'pm2 jlist | node -e '+shlex.quote(js)))


def remote_bytes(sftp, path):
    with sftp.open(path,'rb') as f: return f.read()


def upload_bytes(sftp, path, content, attributes=None):
    with sftp.open(path,'wb') as f: f.write(content)
    sftp.chmod(path,stat.S_IMODE(attributes.st_mode) if attributes else 0o644)
    if attributes: sftp.chown(path,attributes.st_uid,attributes.st_gid)


def install(ssh,sftp,state,rel,source=None):
    source = source or state['backup']+'/next/'+rel
    ready = state['backup']+'/ready/'+rel
    run(ssh,'install -d -m 700 '+shlex.quote(posixpath.dirname(ready)))
    run(ssh,'cp -p '+shlex.quote(source)+' '+shlex.quote(ready))
    sftp.posix_rename(ready,REMOTE+'/'+rel)


def config_next(source):
    source=apply_config_context_hardening(source)
    needle="require_once __DIR__ . '/webshop_bundle.php';"
    if source.count(needle)!=1: raise RuntimeError('CONFIG_INCLUDE_DRIFT')
    return source.replace(needle,needle+'\n'+''.join("require_once __DIR__ . '/"+name+"';\n" for name in HELPERS))


def prepare(ssh):
    if STATE.exists(): raise RuntimeError('RELEASE_ALREADY_PREPARED')
    manifest=json.loads((OUT/'manifest.json').read_text())
    files={}
    for p in (OUT/'candidate').rglob('*'):
        if not p.is_file(): continue
        rel=p.relative_to(OUT/'candidate').as_posix()
        if digest(p.read_bytes())!=manifest['files'].get(rel,{}).get('sha256'):
            if p.suffix not in ['.php','.js','.css']: raise RuntimeError('UNEXPECTED_ARTIFACT '+rel)
            files[rel]=digest(p.read_bytes())
    if not all(h in files for h in HELPERS): raise RuntimeError('HELPER_MISSING')
    state={'preparedAt':now(),'phase':'preparing','backup':'/linhhoasu/_ai_workbench/backups/web_multiserver_'+datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S'),'hashes':files,'baseline':manifest['files'],'baselineConfig':manifest['configSha256'],'beforePm2':pm2(ssh)}
    backup=state['backup']
    run(ssh,'install -d -m 700 '+shlex.quote(backup+'/before')+' '+shlex.quote(backup+'/next')+' '+shlex.quote(backup+'/ready'))
    with ssh.open_sftp() as sftp:
        for rel in list(files)+['config.php']:
            live=REMOTE+'/'+rel
            expected=manifest['configSha256'] if rel=='config.php' else manifest['files'].get(rel,{}).get('sha256')
            try:
                current=remote_bytes(sftp,live); attrs=sftp.stat(live)
            except FileNotFoundError:
                current=None;attrs=None
            if expected and (current is None or digest(current)!=expected): raise RuntimeError('LIVE_DRIFT '+rel)
            if not expected and current is not None: raise RuntimeError('NEW_FILE_ALREADY_EXISTS '+rel)
            for variant in ['before','next']:
                run(ssh,'install -d -m 700 '+shlex.quote(posixpath.dirname(backup+'/'+variant+'/'+rel)))
            if current is not None: run(ssh,'cp -p '+shlex.quote(live)+' '+shlex.quote(backup+'/before/'+rel))
            content=config_next(current.decode('utf-8')).encode('utf-8') if rel=='config.php' else (OUT/'candidate'/rel).read_bytes()
            upload_bytes(sftp,backup+'/next/'+rel,content,attrs)
            if rel=='config.php': state['hashes'][rel]=digest(content)
            run(ssh,('php -l ' if rel.endswith('.php') else 'node --check ')+shlex.quote(backup+'/next/'+rel))
        upload_bytes(sftp,backup+'/gate.php',GATE)
        for name in ['web_daily_schema_20260906.sql','web_delivery_schema_20260906.sql']:
            sftp.put(str(WB/'tools'/name),backup+'/'+name)
        sftp.put(str(WB/'tools/php_fpm_webgm_status_20260906.py'),backup+'/php_fpm_webgm_status.py')
    # All sensitive backup content stays on the owning VPS under mode 0700.
    script=php_bootstrap()+'''\n$pdo->exec('SET SESSION TRANSACTION READ ONLY');$pdo->beginTransaction();
$snapshot=array();foreach(array('daily_checkins','giftcode_logs','giftcode_delivery_batches','recharge_milestone_claims','auth_codes')as$t){$snapshot[$t]=array('schema'=>$pdo->query('SHOW CREATE TABLE `'.$t.'`')->fetch(PDO::FETCH_NUM)[1],'count'=>$pdo->query('SELECT COUNT(*) FROM `'.$t.'`')->fetchColumn());}
$snapshot['dailyRows']=$pdo->query('SELECT * FROM daily_checkins ORDER BY id')->fetchAll();
$snapshot['dailySettings']=$pdo->query("SELECT setting_key,setting_value FROM web_settings WHERE setting_key IN ('daily_checkin_enabled','daily_checkin_xu')")->fetchAll();
$snapshot['globalClaimGroups']=$pdo->query('SELECT COUNT(*) FROM (SELECT account_name,claim_date FROM daily_checkins GROUP BY account_name,claim_date) g')->fetchColumn();
$snapshot['nullDailyTimestamps']=$pdo->query('SELECT COUNT(*) FROM daily_checkins WHERE created_at IS NULL')->fetchColumn();
$pdo->rollBack();
$path='''+json.dumps(backup+'/database-before.json')+''';file_put_contents($path,json_encode($snapshot,JSON_UNESCAPED_UNICODE));chmod($path,0600);
echo json_encode(array('backupWritten'=>true,'dailyRows'=>count($snapshot['dailyRows']),'uniqueAccountDays'=>$snapshot['globalClaimGroups'],'dailySettings'=>$snapshot['dailySettings'],'nullDailyTimestamps'=>$snapshot['nullDailyTimestamps']));'''
    state['dbBefore']=json.loads(run(ssh,'php',script))
    if int(state['dbBefore']['nullDailyTimestamps'])!=0:raise RuntimeError('LEGACY_TIMESTAMP_NULL_REVIEW_REQUIRED')
    state['phase']='prepared';save(state)
    return {'phase':state['phase'],'backup':backup,'files':list(state['hashes']),'dbBefore':state['dbBefore']}


def gate(ssh,state):
    if state['phase']!='prepared': raise RuntimeError('GATE_PHASE_INVALID')
    with ssh.open_sftp() as sftp:
        for rel in GATED:
            if digest(remote_bytes(sftp,REMOTE+'/'+rel))!=state['baseline'][rel]['sha256']: raise RuntimeError('GATE_BASELINE_DRIFT '+rel)
        state['phase']='gating';save(state)
        for rel in GATED: install(ssh,sftp,state,rel,state['backup']+'/gate.php')
    # Verify FPM sees the replacement (not a cached old opcode) before the
    # 100-second FPM wall-clock request termination drain timer starts.
    for rel in GATED:
        response=run(ssh,'curl -sS --max-time 10 http://127.0.0.1:88/'+rel)
        if json.loads(response).get('code')!='WEBGM_UPGRADING':raise RuntimeError('FPM_GATE_NOT_VISIBLE '+rel)
    state['gateAt']=now();state['phase']='gated';save(state)
    return {'phase':'gated','gateAt':state['gateAt']}


def publish(ssh,state):
    if state['phase']!='gated': raise RuntimeError('PUBLISH_PHASE_INVALID')
    age=(datetime.now(timezone.utc)-datetime.fromisoformat(state['gateAt'])).total_seconds()
    if age<110: raise RuntimeError('DRAIN_NOT_FINISHED: request_terminate_timeout=100, need110 seconds after verified gate')
    state['fpmDrain']=json.loads(run(ssh,'python3 '+shlex.quote(state['backup']+'/php_fpm_webgm_status.py')))
    if state['fpmDrain'].get('result')!='PASS':raise RuntimeError('FPM_STATUS_UNVERIFIED')
    if any(row['scriptURI'].endswith(tuple('/'+rel for rel in GATED)) for row in state['fpmDrain']['active']):raise RuntimeError('OLD_FPM_REQUEST_STILL_ACTIVE')
    save(state)
    for rel in GATED:
        response=run(ssh,'curl -sS --max-time 10 http://127.0.0.1:88/'+rel)
        if json.loads(response).get('code')!='WEBGM_UPGRADING': raise RuntimeError('FPM_GATE_NOT_VISIBLE '+rel)
    # Session-scoped lock timeout prevents waiting indefinitely for user traffic.
    code=php_bootstrap()+"\n$pdo->exec('SET SESSION lock_wait_timeout=5');$pdo->exec('SET SESSION innodb_lock_wait_timeout=5');\n"
    code+='''foreach(array('daily_checkin_account_claims','web_reward_deliveries') as $t){
        $s=$pdo->prepare('SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=?');$s->execute(array($t));
        if((int)$s->fetchColumn()!==0)throw new RuntimeException('New schema target already exists; review before migration.');
    }\n'''
    for name in ['web_daily_schema_20260906.sql','web_delivery_schema_20260906.sql']:
        code+='$pdo->exec(file_get_contents('+json.dumps(state['backup']+'/'+name)+'));\n'
    code+='echo json_encode(array("canonicalRows"=>$pdo->query("SELECT COUNT(*) FROM daily_checkin_account_claims")->fetchColumn(),"legacyRows"=>$pdo->query("SELECT COUNT(*) FROM daily_checkins")->fetchColumn(),"newDeliveries"=>$pdo->query("SELECT COUNT(*) FROM web_reward_deliveries")->fetchColumn()));'
    state['migration']=json.loads(run(ssh,'php',code));save(state)
    schema_check=php_bootstrap()+'''\n$expected=array('daily_checkin_account_claims'=>array('PRIMARY'=>array('account_name','claim_date')),'web_reward_deliveries'=>array('uq_reward_claim'=>array('kind','account_name','server_id','source_id','claim_period')));$result=array();
foreach($expected as$t=>$indexes){$s=$pdo->prepare('SELECT ENGINE,TABLE_COLLATION FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=?');$s->execute(array($t));$r=$s->fetch();if($r['ENGINE']!=='InnoDB'||$r['TABLE_COLLATION']!=='utf8mb4_unicode_ci')throw new RuntimeException('Unexpected ledger engine/collation');foreach($indexes as$name=>$columns){$s=$pdo->query('SHOW INDEX FROM `'.$t.'`');$actual=array();foreach($s->fetchAll()as$i){if($i['Key_name']===$name){if((int)$i['Non_unique']!==0)throw new RuntimeException('Receipt key must be unique');$actual[]=$i['Column_name'];}}if($actual!==$columns)throw new RuntimeException('Receipt key mismatch');}$result[$t]=true;}
if((int)$pdo->query('SELECT COUNT(*) FROM daily_checkin_account_claims')->fetchColumn()!==(int)$pdo->query('SELECT COUNT(*) FROM (SELECT account_name,claim_date FROM daily_checkins GROUP BY account_name,claim_date) g')->fetchColumn())throw new RuntimeException('Backfill count mismatch');
echo json_encode($result);'''
    state['schemaVerified']=json.loads(run(ssh,'php',schema_check));save(state)
    # Keep entrypoints gated until the complete dependency graph is in place.
    with ssh.open_sftp() as sftp:
        for rel in HELPERS: install(ssh,sftp,state,rel)
        install(ssh,sftp,state,'config.php')
        for rel in state['hashes']:
            if rel in GATED or rel in HELPERS or rel=='config.php': continue
            install(ssh,sftp,state,rel)
        for rel,expected in state['hashes'].items():
            if rel not in GATED and digest(remote_bytes(sftp,REMOTE+'/'+rel))!=expected: raise RuntimeError('INSTALL_HASH '+rel)
    state['publishedAt']=now();state['phase']='published_gated';save(state)
    return {'phase':state['phase'],'migration':state['migration']}


def verify(ssh,state):
    if state['phase'] not in ['published_gated','verified_gated','open']: raise RuntimeError('VERIFY_PHASE_INVALID')
    checks={}
    with ssh.open_sftp() as sftp:
        for rel,expected in state['hashes'].items():
            actual=digest(remote_bytes(sftp,REMOTE+'/'+rel))
            checks[rel]=actual==(digest(GATE) if rel in GATED and state['phase']!='open' else expected)
            if not checks[rel]:raise RuntimeError('VERIFY_HASH '+rel)
    health={url:run(ssh,'curl -sS --max-time 10 -o /dev/null -w "%{http_code}" '+shlex.quote(url)).strip() for url in ['http://127.0.0.1:88/login.php','http://127.0.0.1:8080/ready','http://127.0.0.1:8083/ready']}
    if any(code!='200' for code in health.values()):raise RuntimeError('HEALTH_FAILED')
    after=pm2(ssh)
    if after!=state['beforePm2']:raise RuntimeError('PM2_CHANGED_EXTERNALLY_REVIEW')
    state['verification']={'at':now(),'hashes':checks,'health':health,'pm2Unchanged':True}
    if state['phase']!='open':state['phase']='verified_gated'
    save(state);return state['verification']


def reopen(ssh,state):
    if state['phase']!='verified_gated':raise RuntimeError('OPEN_BEFORE_VERIFY_REJECTED')
    with ssh.open_sftp() as sftp:
        for rel in GATED:
            if digest(remote_bytes(sftp,REMOTE+'/'+rel))!=digest(GATE):raise RuntimeError('GATE_CHANGED '+rel)
            install(ssh,sftp,state,rel)
    state['phase']='open';state['openedAt']=now();save(state)
    return verify(ssh,state)


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    mode=sys.argv[1] if len(sys.argv)>1 else 'status'
    if mode=='status':print(STATE.read_text() if STATE.exists() else '{"phase":"not_prepared"}');return
    ssh=connect()
    try:
        state=json.loads(STATE.read_text()) if STATE.exists() else None
        result=prepare(ssh) if mode=='prepare' else {'gate':gate,'publish':publish,'verify':verify,'open':reopen}[mode](ssh,state)
        print(json.dumps(result,ensure_ascii=False))
    finally:ssh.close()


if __name__=='__main__':main()
