"""Read-only live WebGM routing and feature audit; prints no credentials."""
import json
import re
from snapshot_web_multiserver_20260906 import connect, run

PHP = r'''<?php
require '/linhhoasu/webgame/gm/config.php';
$servers=array();foreach($quarr as $key=>$s){$servers[(string)$key]=array('id'=>$s['game_id'],'name'=>$s['name'],'api'=>lhs_api_base((string)$key));}
$features=array();foreach(array('webshop_enabled','recharge_rewards_enabled','daily_checkin_enabled') as $k)$features[$k]=web_setting_enabled($k);
$counts=array();foreach(array('giftcodes','recharge_milestones') as $t){try{$counts[$t]=$conn_web->query('SELECT COUNT(*) FROM '.$t.' WHERE is_active=1')->fetchColumn();}catch(Exception $e){$counts[$t]='unavailable';}}
$giftColumns=$conn_web->query('SHOW COLUMNS FROM giftcodes')->fetchAll(PDO::FETCH_COLUMN);
$routing=array('s3Configured'=>isset($servers['1003']),'s3ApiExpected'=>isset($servers['1003'])&&$servers['1003']['api']==='http://127.0.0.1:8084');
try{lhs_api_base('999999');$routing['unknownFailClosed']=false;}catch(Exception $e){$routing['unknownFailClosed']=true;}
if($routing['s3ApiExpected']){
 $lookup=lhs_internal_read('/api/internal/player/lookup',array('accountId'=>'qa_s3_absent_20260913','limit'=>1),'POST','1003');
 $routing['lookupSuccess']=!empty($lookup['success']);
 $routing['lookupExpectedNotFound']=isset($lookup['data']['error'])&&$lookup['data']['error']==='PLAYER_NOT_FOUND';
 $routing['lookupRoleCount']=isset($lookup['data']['roles'])?count($lookup['data']['roles']):null;
 $routing['roleHelperCount']=count(lhs_roles_for_account('qa_s3_absent_20260913','1003'));
 $routing['idMapped']=lhs_game_server_id('1003');
}
$envPaths=array();foreach($vht6ur_env_paths as $p){$envPaths[]=array('path'=>$p,'readable'=>lhs_env_path_allowed($p)&&is_readable($p));}
echo json_encode(array('servers'=>$servers,'features'=>$features,'activeCounts'=>$counts,'giftcodeColumns'=>$giftColumns,'routing'=>$routing,'envPaths'=>$envPaths,'sendFunctionsPresent'=>function_exists('lhs_mail_items')&&function_exists('vht6ur_sdk_web_send_items')),JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
'''

def main():
    ssh=connect()
    try:
        print(run(ssh,'php',PHP))
        with ssh.open_sftp() as sftp:
            for rel in ['config.php','web_context.php','reward_delivery.php','api/user_api.php','api/sepay_webhook.php','index.php','login.php','web_experience.php','assets/js/index.js','assets/js/login.js','assets/js/admin.js']:
                try:
                    with sftp.open('/linhhoasu/webgame/gm/'+rel) as f: src=f.read().decode('utf-8-sig')
                except FileNotFoundError: continue
                matches=[]
                for n,line in enumerate(src.splitlines(),1):
                    if rel=='api/user_api.php' and 872<=n<=900:
                        matches.append({'line':n,'text':line[:800]});continue
                    if re.search(r'100[123]|LHS_SERVER_COUNT|LHS_SERVER_|function lhs_api_base|function lhs_reward_reserve|giftcode|case .(claim_recharge|redeem|gift)|openTime|open_time|server_ids',line) and not re.search(r'password|secret|API_KEY|HMAC',line,re.I):
                        matches.append({'line':n,'text':line[:800]})
                print(json.dumps({'file':rel,'matches':matches},ensure_ascii=False))
    finally: ssh.close()

if __name__=='__main__': main()
