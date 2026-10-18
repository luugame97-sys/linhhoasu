"""Read-only post-release routing, schema, claim history and HTTP proof."""
import hashlib
import json
import shlex
from datetime import datetime, timezone
from snapshot_web_multiserver_20260906 import OUT, WB, REMOTE, connect, run

import sys
sys.stdout.reconfigure(encoding='utf-8')
ssh=connect()
try:
    state=json.loads((OUT/'release.json').read_text())
    code='''<?php
$_SERVER['REQUEST_METHOD']='GET';
session_save_path('''+json.dumps(state['backup'])+''');session_id('qawebms'.bin2hex(random_bytes(8)));session_start();
require '/linhhoasu/webgame/gm/config.php';
$result=array('schemaBootstrap'=>true,'routes'=>array());
foreach(array('1001','1002')as$s){$result['routes'][$s]=lhs_api_base($s);$result['emptyRole'][$s]=count(lhs_roles_for_account('qa_missing_webms',$s))===0;}
try{lhs_api_base('99999');$result['unknownServerRejected']=false;}catch(RuntimeException$e){$result['unknownServerRejected']=true;}
$row=$conn_web->query('SELECT account_name,claim_date FROM daily_checkins ORDER BY id DESC LIMIT 1')->fetch();
$status=lhs_daily_checkin_status($conn_web,$row['account_name'],$row['claim_date']);$result['legacyAlreadyClaimed']=$status['claimed'];
$result['dailyRows']=$conn_web->query('SELECT COUNT(*) FROM daily_checkins')->fetchColumn();
$result['canonicalRows']=$conn_web->query('SELECT COUNT(*) FROM daily_checkin_account_claims')->fetchColumn();
$result['canonicalMissing']=$conn_web->query('SELECT COUNT(*) FROM daily_checkins d LEFT JOIN daily_checkin_account_claims c ON c.account_name=d.account_name AND c.claim_date=d.claim_date WHERE c.account_name IS NULL')->fetchColumn();
$result['newDeliveries']=$conn_web->query('SELECT status,COUNT(*) n FROM web_reward_deliveries GROUP BY status')->fetchAll();
$result['dailyReward']=daily_checkin_reward_xu();
$result['dateTimezone']='Asia/Ho_Chi_Minh';$result['claimDate']=lhs_daily_checkin_date();
session_destroy();echo json_encode($result,JSON_UNESCAPED_UNICODE);
'''
    result=json.loads(run(ssh,'php',code))
    if not result['schemaBootstrap'] or not result['unknownServerRejected'] or not result['legacyAlreadyClaimed'] or int(result['canonicalMissing'])!=0:
        raise RuntimeError('LIVE_CONTRACT_FAILED')
    result['http']={}
    for path in ['login.php','index.php','admin/index.php','assets/js/web-context.js','api/sepay_webhook.php']:
        response=run(ssh,'curl -sS --max-time 10 -o /dev/null -w "%{http_code}" '+shlex.quote('http://127.0.0.1:88/'+path)).strip()
        result['http'][path]=response
    result['userApiWithoutCsrf']=json.loads(run(ssh,"curl -sS --max-time 10 -X POST -d 'action=claim_daily_checkin' http://127.0.0.1:88/api/user_api.php"))
    if result['userApiWithoutCsrf'].get('status')!='error' or result['userApiWithoutCsrf'].get('reload_required')!=1: raise RuntimeError('CSRF_HTTP_GUARD_FAILED')
    result['webContextServedHash']=run(ssh,'curl -fsS --max-time 10 http://127.0.0.1:88/assets/js/web-context.js | sha256sum').split()[0]
    if result['webContextServedHash']!=state['hashes']['assets/js/web-context.js']:raise RuntimeError('SERVED_JS_HASH_FAILED')
    result['verifiedAt']=datetime.now(timezone.utc).isoformat()
    result['noPlayerWalletMutation']=True
    (OUT/'live_verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(result,ensure_ascii=False))
finally:ssh.close()
