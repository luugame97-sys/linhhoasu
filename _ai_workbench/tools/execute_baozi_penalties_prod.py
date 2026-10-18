"""Apply approved Baozi remediation with scoped backups and rollback."""
from __future__ import annotations

import base64
import getpass
import hashlib
import json
import os
import shlex
from datetime import datetime, timezone
from pathlib import Path

import paramiko

HOST = "103.116.105.154"
ROOT = Path(__file__).resolve().parents[1]
PLAN = ROOT / "temp" / "baozi_penalty_execute_plan_20260901.json"
ITEM_SHA = "6176b6ea089ee5b3609318edf24d81ee4906dc86c62d99063477d4481a89c922"
ACTIVITY_SHA = "d4d01c76bad282f7baa0cf98f207c3fcf1e42aa80c5de01762c64e9a30a859f6"


def run(ssh, command, timeout=180):
    _, out, err = ssh.exec_command(command, timeout=timeout)
    text = out.read().decode("utf-8", "replace")
    error = err.read().decode("utf-8", "replace")
    code = out.channel.recv_exit_status()
    if code:
        raise RuntimeError(error[-8000:] or text[-8000:] or f"remote exit={code}")
    return text


def put_text(sftp, path, text):
    with sftp.open(path, "w") as handle:
        handle.write(text)


def b64(text):
    return base64.b64encode(text.encode("utf-8")).decode("ascii")


NODE_SCRIPT = r'''
'use strict';
const fs=require('fs');
try{require('/linhhoasu/lhs/newServer/node_modules/dotenv').config({path:'/linhhoasu/lhs/newServer/.env'});}catch(_){ }
const mongoose=require('/linhhoasu/lhs/newServer/node_modules/mongoose');
const Account=require('/linhhoasu/lhs/newServer/src/db/models/Account');
const Player=require('/linhhoasu/lhs/newServer/src/db/models/Player');
const mode=String(process.argv[2]||''), planPath=String(process.argv[3]||''), backupPath=String(process.argv[4]||''), rid=String(process.argv[5]||'');
const plan=JSON.parse(fs.readFileSync(planPath,'utf8')), rows=Array.isArray(plan.rows)?plan.rows:[];
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{}; const num=v=>Number.isFinite(Number(v))?Math.floor(Number(v)):0; const str=v=>String(v||'');
const marker=p=>obj(obj(p.moderation).baoziPenaltyV1);
async function conn(){await mongoose.connect(process.env.MONGO_URI||'mongodb://127.0.0.1:27017/lhs_s1001',{serverSelectionTimeoutMS:7000});}
function slim(p){return {_id:p._id,userId:str(p.userId),playerId:str(p.playerId),name:str(p.name),items:obj(p.items),currencies:obj(p.currencies),moderation:obj(p.moderation),updatedAt:p.updatedAt||null};}
async function preflight(){await conn();const ids=rows.map(r=>str(r.accountId)),uids=rows.map(r=>str(r.userId));const ac=await Account.find({accountId:{$in:ids}}).select({accountId:1,status:1,banUntil:1,banCode:1,roles:1}).lean();const ps=await Player.find({userId:{$in:uids}}).select({userId:1,playerId:1,name:1,items:1,currencies:1,moderation:1,updatedAt:1}).lean();const am=new Map(ac.map(a=>[str(a.accountId),a])),pm=new Map(ps.map(p=>[str(p.userId),p])),problems=[],backup={remediationId:rid,createdAt:new Date().toISOString(),accounts:[],players:[]};for(const row of rows){const a=am.get(str(row.accountId)),p=pm.get(str(row.userId));if(!a){problems.push(str(row.accountId)+':ACCOUNT_NOT_FOUND');continue}if(!p){problems.push(str(row.accountId)+':PLAYER_NOT_FOUND');continue}if(num(a.status)<=0)problems.push(str(row.accountId)+':ACCOUNT_ALREADY_BANNED');if(a.banUntil&&new Date(a.banUntil).getTime()>Date.now())problems.push(str(row.accountId)+':ACTIVE_BAN_EXISTS');if(Object.keys(marker(p)).length)problems.push(str(row.accountId)+':PENALTY_MARKER_EXISTS');if(!Array.isArray(a.roles)||!a.roles.some(x=>str(x&&x.userId)===str(row.userId)))problems.push(str(row.accountId)+':ROLE_MAPPING_MISMATCH');backup.accounts.push({_id:a._id,accountId:str(a.accountId),status:num(a.status),authVersion:num(a.authVersion),banUntil:a.banUntil||null,banReason:str(a.banReason),banCode:str(a.banCode),bannedAt:a.bannedAt||null,bannedBy:str(a.bannedBy),banMeta:obj(a.banMeta),banHistory:Array.isArray(a.banHistory)?a.banHistory:[]});backup.players.push(slim(p));}fs.writeFileSync(backupPath,JSON.stringify(backup,null,2));if(problems.length)throw new Error('PREFLIGHT_FAILED '+problems.join(','));console.log(JSON.stringify({mode:'preflight',ok:true,targets:rows.length,backup:backupPath}));}
async function applyPlayers(){await conn();const backup=JSON.parse(fs.readFileSync(backupPath,'utf8')),out=[];try{for(const row of rows){const p=await Player.findOne({userId:str(row.userId)}).select({userId:1,playerId:1,name:1,items:1,currencies:1,moderation:1,updatedAt:1});if(!p)throw new Error('PLAYER_NOT_FOUND '+row.accountId);if(Object.keys(marker(p)).length)throw new Error('PENALTY_MARKER_EXISTS '+row.accountId);const items=obj(p.items),cur=obj(p.currencies),beforeItem=Math.max(0,num(items['4'])),beforeDiamond=Math.max(0,num(cur.diamond)),bug=Math.max(0,num(row.bugBaozi)),itemDeduct=Math.min(bug,beforeItem),diamondNeed=Math.max(0,bug-itemDeduct),diamondDeduct=Math.min(diamondNeed,beforeDiamond),uncompensated=Math.max(0,diamondNeed-diamondDeduct),moderation=obj(p.moderation);moderation.baoziPenaltyV1={remediationId:rid,shopId:11018000,activityId:43001,bugBaozi:bug,itemDeduct,diamondDeduct,uncompensatedBaozi:uncompensated,penaltySeconds:Math.max(1,num(row.penaltySeconds)),appliedAt:new Date().toISOString()};const write=await Player.collection.updateOne({_id:p._id,'items.4':beforeItem,'currencies.diamond':beforeDiamond,'moderation.baoziPenaltyV1':{$exists:false}},{$set:{'items.4':beforeItem-itemDeduct,'currencies.diamond':beforeDiamond-diamondDeduct,moderation,updatedAt:new Date()}});if(write.matchedCount!==1)throw new Error('PLAYER_STALE_OR_ALREADY_CHANGED '+row.accountId);out.push({accountId:str(row.accountId),userId:str(row.userId),bugBaozi:bug,itemBefore:beforeItem,itemAfter:beforeItem-itemDeduct,itemDeduct,diamondBefore:beforeDiamond,diamondAfter:beforeDiamond-diamondDeduct,diamondDeduct,uncompensatedBaozi:uncompensated});}}catch(e){for(const old of backup.players||[]){try{await Player.collection.updateOne({_id:old._id,'moderation.baoziPenaltyV1.remediationId':rid},{$set:{items:old.items,currencies:old.currencies,moderation:old.moderation,updatedAt:new Date()}});}catch(_){}}throw e;}console.log(JSON.stringify({mode:'applyPlayers',ok:true,targets:out.length,results:out},null,2));}
async function rollbackPlayers(){await conn();const backup=JSON.parse(fs.readFileSync(backupPath,'utf8'));let restored=0;for(const old of backup.players||[]){const r=await Player.collection.updateOne({_id:old._id,'moderation.baoziPenaltyV1.remediationId':rid},{$set:{items:old.items,currencies:old.currencies,moderation:old.moderation,updatedAt:new Date()}});restored+=r.matchedCount||0;}console.log(JSON.stringify({mode:'rollbackPlayers',ok:true,restored}));}
async function verify(){await conn();const ids=rows.map(r=>str(r.accountId)),uids=rows.map(r=>str(r.userId)),ac=await Account.find({accountId:{$in:ids}}).select({accountId:1,status:1,banUntil:1,banCode:1}).lean(),ps=await Player.find({userId:{$in:uids}}).select({userId:1,items:1,currencies:1,moderation:1}).lean(),am=new Map(ac.map(a=>[str(a.accountId),a])),pm=new Map(ps.map(p=>[str(p.userId),p])),bad=[],out=[];for(const row of rows){const a=am.get(str(row.accountId)),p=pm.get(str(row.userId));if(!a||!p){bad.push(str(row.accountId)+':MISSING');continue}if(num(a.status)>0)bad.push(str(row.accountId)+':ACCOUNT_NOT_BANNED');if(str(marker(p).remediationId)!==rid)bad.push(str(row.accountId)+':MARKER_MISSING');out.push({accountId:str(row.accountId),status:num(a.status),banUntil:a.banUntil||null,banCode:str(a.banCode),item4:num(obj(p.items)['4']),diamond:num(obj(p.currencies).diamond)});}if(bad.length)throw new Error('VERIFY_FAILED '+bad.join(','));console.log(JSON.stringify({mode:'verify',ok:true,targets:out.length,results:out},null,2));}
(async()=>{try{if(mode==='preflight')await preflight();else if(mode==='applyPlayers')await applyPlayers();else if(mode==='rollbackPlayers')await rollbackPlayers();else if(mode==='verify')await verify();else throw new Error('UNKNOWN_MODE');}finally{try{await mongoose.disconnect();}catch(_){}}})().catch(e=>{console.error(e.stack||String(e));process.exit(1);});
'''

PHP_APPLY = r'''<?php
define('LHS_API_REQUEST', true);
require '/linhhoasu/webgame/gm/config.php';
$plan=json_decode(file_get_contents($argv[1]),true);$backup=(string)$argv[2];$rid=(string)$argv[3];$rows=$plan['rows']??array();
if(count($rows)!==35)throw new RuntimeException('EXECUTE_PLAN_TARGET_COUNT_MISMATCH');
$ids=array();foreach($rows as $r)$ids[]=strtolower((string)$r['accountId']);$marks=implode(',',array_fill(0,count($ids),'?'));
$s=$conn_web->prepare("SELECT * FROM web_account_bans WHERE account_name IN ($marks)");$s->execute($ids);$old=$s->fetchAll(PDO::FETCH_ASSOC);foreach($old as $r)if((int)$r['active']===1&&(int)$r['ban_until']>(int)round(microtime(true)*1000))throw new RuntimeException('WEB_ACTIVE_BAN_EXISTS_'.$r['account_name']);
if(!is_dir($backup)&&!@mkdir($backup,0750,true))throw new RuntimeException('BACKUP_DIR_CREATE_FAILED');file_put_contents($backup.'/web_bans_before.json',json_encode(array('remediationId'=>$rid,'rows'=>$old),JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT));
$done=array();try{foreach($rows as $r){$account=strtolower((string)$r['accountId']);$meta=array('source'=>'baozi_remediation','eventId'=>43001,'shopId'=>11018000,'exploitCount'=>(int)$r['bugClaims'],'exploitBaozi'=>(int)$r['bugBaozi'],'evidenceId'=>(string)$plan['sourceGeneratedAt'],'title'=>'Thiên Đạo Ban Lệnh','remediationId'=>$rid);$payload=array('accountId'=>$account,'durationSeconds'=>max(1,(int)$r['penaltySeconds']),'reason'=>'Lợi dụng bug Bánh bao sự kiện.','code'=>'FORTUNE_BAOZI_EXPLOIT','meta'=>$meta,'dryRun'=>false,'confirm'=>true);$result=lhs_internal_account_ban('/api/internal/account/ban',$payload);if(empty($result['success']))throw new RuntimeException('GAME_BAN_FAILED_'.$account);$done[]=$account;}
$now=(int)round(microtime(true)*1000);$conn_web->beginTransaction();$up=$conn_web->prepare('INSERT INTO web_account_bans(account_name,active,ban_until,reason,ban_code,banned_at,banned_by,metadata_json,updated_at) VALUES(?,?,?,?,?,?,?, ?, NOW()) ON DUPLICATE KEY UPDATE active=1,ban_until=VALUES(ban_until),reason=VALUES(reason),ban_code=VALUES(ban_code),banned_at=VALUES(banned_at),banned_by=VALUES(banned_by),metadata_json=VALUES(metadata_json),updated_at=NOW()');$hist=$conn_web->prepare('INSERT INTO web_account_ban_history(account_name,action,ban_until,reason,ban_code,operator_name,metadata_json) VALUES(?,?,?,?,?,?,?)');
foreach($rows as $r){$account=strtolower((string)$r['accountId']);$until=$now+max(1,(int)$r['penaltySeconds'])*1000;$meta=array('source'=>'baozi_remediation','eventId'=>43001,'shopId'=>11018000,'exploitCount'=>(int)$r['bugClaims'],'exploitBaozi'=>(int)$r['bugBaozi'],'evidenceId'=>(string)$plan['sourceGeneratedAt'],'title'=>'Thiên Đạo Ban Lệnh','remediationId'=>$rid);$mj=json_encode($meta,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);$up->execute(array($account,1,$until,'Lợi dụng bug Bánh bao sự kiện.','FORTUNE_BAOZI_EXPLOIT',date('Y-m-d H:i:s',(int)floor($now/1000)),'baozi-remediation',$mj));$hist->execute(array($account,'ban',$until,'Lợi dụng bug Bánh bao sự kiện.','FORTUNE_BAOZI_EXPLOIT','baozi-remediation',$mj));}$conn_web->commit();file_put_contents($backup.'/game_web_apply.json',json_encode(array('remediationId'=>$rid,'gameDone'=>$done,'rows'=>$rows,'appliedAt'=>date('c')),JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT));echo json_encode(array('ok'=>true,'targets'=>count($rows),'gameBanned'=>count($done),'backup'=>$backup),JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT);
}catch(Exception $e){if($conn_web->inTransaction())$conn_web->rollBack();foreach(array_reverse($done) as $account){try{lhs_internal_account_ban('/api/internal/account/unban',array('accountId'=>$account,'reason'=>'Rollback xử lý Bánh bao','dryRun'=>false,'confirm'=>true));}catch(Exception $ignore){}}throw $e;}?>'''

PHP_ROLLBACK = r'''<?php
define('LHS_API_REQUEST', true);require '/linhhoasu/webgame/gm/config.php';$plan=json_decode(file_get_contents($argv[1]),true);$backup=(string)$argv[2];$rid=(string)$argv[3];$before=json_decode(@file_get_contents($backup.'/web_bans_before.json'),true);$old=$before['rows']??array();$rows=$plan['rows']??array();$conn_web->beginTransaction();try{foreach($rows as $r){$account=strtolower((string)$r['accountId']);$previous=null;foreach($old as $candidate)if(strtolower((string)$candidate['account_name'])===$account){$previous=$candidate;break;}$q=$conn_web->prepare('SELECT metadata_json FROM web_account_bans WHERE account_name=? LIMIT 1');$q->execute(array($account));$cur=$q->fetch(PDO::FETCH_ASSOC);$meta=json_decode((string)($cur['metadata_json']??''),true);if(is_array($meta)&&(string)($meta['remediationId']??'')===$rid){if($previous){$u=$conn_web->prepare('UPDATE web_account_bans SET active=?,ban_until=?,reason=?,ban_code=?,banned_at=?,banned_by=?,metadata_json=?,updated_at=NOW() WHERE account_name=?');$u->execute(array($previous['active'],$previous['ban_until'],$previous['reason'],$previous['ban_code'],$previous['banned_at'],$previous['banned_by'],$previous['metadata_json'],$account));}else$conn_web->prepare('DELETE FROM web_account_bans WHERE account_name=?')->execute(array($account));}$h=$conn_web->prepare('INSERT INTO web_account_ban_history(account_name,action,ban_until,reason,ban_code,operator_name,metadata_json) VALUES(?,?,?,?,?,?,?)');$h->execute(array($account,'rollback',0,'Rollback xử lý Bánh bao','FORTUNE_BAOZI_EXPLOIT','baozi-remediation',json_encode(array('remediationId'=>$rid,'source'=>'baozi_remediation'))));}$conn_web->commit();}catch(Exception $e){if($conn_web->inTransaction())$conn_web->rollBack();throw $e;}$game=array();foreach($rows as $r){$account=strtolower((string)$r['accountId']);try{$x=lhs_internal_account_ban('/api/internal/account/unban',array('accountId'=>$account,'reason'=>'Rollback xử lý Bánh bao','dryRun'=>false,'confirm'=>true));$game[]=array('accountId'=>$account,'ok'=>!empty($x['success']));}catch(Exception $e){$game[]=array('accountId'=>$account,'ok'=>false,'error'=>$e->getMessage());}}echo json_encode(array('ok'=>true,'game'=>$game),JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT);?>'''


def main():
    if not PLAN.is_file():
        raise SystemExit(f"missing approved plan: {PLAN}")
    plan = json.loads(PLAN.read_text(encoding="utf-8"))
    if plan.get("approvedExecutionPlan") is not True or len(plan.get("rows", [])) != 35:
        raise SystemExit("approved execution plan must contain exactly 35 targets")
    password = os.environ.get("LHS_PROD_PASSWORD") or getpass.getpass("Production password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False,
                timeout=20, banner_timeout=20, auth_timeout=20)
    rid = "baozi_penalty_" + datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    remote_root = f"/linhhoasu/_ai_workbench/temp/{rid}"
    backup = f"/linhhoasu/_ai_workbench/backups/{rid}"
    remote_plan = remote_root + "/plan.json"
    remote_node = remote_root + "/execute.js"
    remote_apply = remote_root + "/apply.php"
    remote_rollback = remote_root + "/rollback.php"
    try:
        pre = run(ssh, "printf 'ready='; curl -sS -o /dev/null -w '%{http_code}' --max-time 15 http://127.0.0.1:8080/ready; printf '\\nitem='; sha256sum /linhhoasu/lhs/newServer/src/handlers/item.js; printf 'activity='; sha256sum /linhhoasu/lhs/newServer/src/handlers/activity.js")
        if "ready=200" not in pre or ITEM_SHA not in pre or ACTIVITY_SHA not in pre:
            raise RuntimeError("production precondition failed: " + pre)
        run(ssh, f"mkdir -p -- {shlex.quote(remote_root)} {shlex.quote(backup)}")
        sftp = ssh.open_sftp()
        try:
            put_text(sftp, remote_plan, PLAN.read_text(encoding="utf-8"))
            put_text(sftp, remote_node, NODE_SCRIPT)
            put_text(sftp, remote_apply, PHP_APPLY)
            put_text(sftp, remote_rollback, PHP_ROLLBACK)
        finally:
            sftp.close()
        run(ssh, f"cp -a -- {shlex.quote(remote_plan)} {shlex.quote(backup + '/plan.json')}")
        qplan, qbackup, qrid = map(shlex.quote, (remote_plan, backup, rid))
        preflight = run(ssh, f"cd /linhhoasu/lhs/newServer && node {shlex.quote(remote_node)} preflight {qplan} {shlex.quote(backup + '/mongo_before.json')} {qrid}", 240)
        apply = run(ssh, f"php {shlex.quote(remote_apply)} {qplan} {qbackup} {qrid}", 360)
        try:
            players = run(ssh, f"cd /linhhoasu/lhs/newServer && node {shlex.quote(remote_node)} applyPlayers {qplan} {shlex.quote(backup + '/mongo_before.json')} {qrid}", 360)
        except Exception:
            try:
                run(ssh, f"php {shlex.quote(remote_rollback)} {qplan} {qbackup} {qrid}", 360)
            finally:
                try:
                    run(ssh, f"cd /linhhoasu/lhs/newServer && node {shlex.quote(remote_node)} rollbackPlayers {qplan} {shlex.quote(backup + '/mongo_before.json')} {qrid}", 300)
                except Exception:
                    pass
            raise
        verify = run(ssh, f"cd /linhhoasu/lhs/newServer && node {shlex.quote(remote_node)} verify {qplan} {shlex.quote(backup + '/mongo_before.json')} {qrid}", 300)
        result = {"result":"PASS","remediationId":rid,"backup":backup,"remoteWork":remote_root,"precondition":pre,"preflight":preflight,"gameWebApply":apply,"playerApply":players,"verify":verify,"restart":False}
        local = ROOT / "temp" / f"{rid}_result.json"
        local.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps({"result":"PASS","remediationId":rid,"backup":backup,"targets":35,"gameWebApply":apply,"playerApply":players,"verify":verify}, ensure_ascii=False, indent=2))
        print(f"RESULT={local}")
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
