"""Read-only post-commit verification for Baozi remediation."""
from __future__ import annotations

import base64
import getpass
import json
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
RESULT = ROOT / "temp" / "baozi_penalty_20260901_125532_result.json"
PLAN = ROOT / "temp" / "baozi_penalty_execute_plan_20260901.json"
OUT = ROOT / "temp" / "baozi_penalty_post_verify_20260901.json"


def run(ssh, command, timeout=180):
    _, out, err = ssh.exec_command(command, timeout=timeout)
    text = out.read().decode("utf-8", "replace")
    error = err.read().decode("utf-8", "replace")
    code = out.channel.recv_exit_status()
    if code:
        raise RuntimeError(error or text or f"remote exit={code}")
    return text


NODE = r'''
'use strict';
try { require('/linhhoasu/lhs/newServer/node_modules/dotenv').config({path:'/linhhoasu/lhs/newServer/.env'}); } catch (_) {}
const fs=require('fs');
const mongoose=require('/linhhoasu/lhs/newServer/node_modules/mongoose');
const Account=require('/linhhoasu/lhs/newServer/src/db/models/Account');
const Player=require('/linhhoasu/lhs/newServer/src/db/models/Player');
const plan=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const rid=String(process.argv[3]||''); const rows=plan.rows||[];
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
const n=v=>Number.isFinite(Number(v))?Math.floor(Number(v)):0;
const s=v=>String(v||'');
(async()=>{
  await mongoose.connect(process.env.MONGO_URI||'mongodb://127.0.0.1:27017/lhs_s1001',{serverSelectionTimeoutMS:7000});
  const ids=rows.map(r=>s(r.accountId)),uids=rows.map(r=>s(r.userId));
  const ac=await Account.find({accountId:{$in:ids}}).select({accountId:1,status:1,banUntil:1,banCode:1,banMeta:1}).lean();
  const ps=await Player.find({userId:{$in:uids}}).select({userId:1,items:1,currencies:1,moderation:1}).lean();
  const excluded=await Account.findOne({accountId:'vanduc97'}).select({accountId:1,status:1,authVersion:1,banUntil:1,banCode:1,banMeta:1}).lean();
  const am=new Map(ac.map(a=>[s(a.accountId),a])),pm=new Map(ps.map(p=>[s(p.userId),p])),issues=[],out=[];
  for(const r of rows){const a=am.get(s(r.accountId)),p=pm.get(s(r.userId)),m=obj(obj(p&&p.moderation).baoziPenaltyV1);if(!a||!p){issues.push(s(r.accountId)+':MISSING');continue}if(n(a.status)!==0)issues.push(s(r.accountId)+':NOT_BANNED');if(s(m.remediationId)!==rid)issues.push(s(r.accountId)+':MARKER');out.push({accountId:s(r.accountId),status:n(a.status),banUntil:a.banUntil||null,banCode:s(a.banCode),item4:n(obj(p.items)['4']),diamond:n(obj(p.currencies).diamond),marker:m});}
  console.log(JSON.stringify({ok:issues.length===0,targets:out.length,issues,rows:out,excludedVanduc97:excluded?{status:n(excluded.status),authVersion:n(excluded.authVersion),banUntil:excluded.banUntil||null,banCode:s(excluded.banCode),banMeta:obj(excluded.banMeta)}:null},null,2));
  await mongoose.disconnect();
})().catch(async e=>{console.error(e.stack||String(e));try{await mongoose.disconnect()}catch(_){}process.exit(1)});
'''


PHP = r'''<?php
define('LHS_API_REQUEST', true);
require '/linhhoasu/webgame/gm/config.php';
$plan=json_decode(file_get_contents($argv[1]),true);$rid=(string)$argv[2];$ids=array();foreach((array)$plan['rows'] as $r)$ids[]=strtolower((string)$r['accountId']);$marks=implode(',',array_fill(0,count($ids),'?'));$s=$conn_web->prepare("SELECT account_name,active,ban_until,reason,ban_code,banned_by,metadata_json FROM web_account_bans WHERE account_name IN ($marks)");$s->execute($ids);$rows=$s->fetchAll(PDO::FETCH_ASSOC);$bad=array();foreach($rows as $r){$m=json_decode((string)$r['metadata_json'],true);if((int)$r['active']!==1||((string)($m['remediationId']??'')!==$rid))$bad[]=$r['account_name'];}$v=$conn_web->prepare('SELECT account_name,active,ban_until,reason,ban_code,banned_by,metadata_json FROM web_account_bans WHERE account_name=? LIMIT 1');$v->execute(array('vanduc97'));$vanduc=$v->fetch(PDO::FETCH_ASSOC);echo json_encode(array('ok'=>count($rows)===count($ids)&&count($bad)===0,'targets'=>count($rows),'issues'=>$bad,'rows'=>$rows,'vanduc97'=>$vanduc),JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT);
?>'''


def main():
    result = json.loads(RESULT.read_text(encoding="utf-8"))
    rid = result["remediationId"]
    password = getpass.getpass("Production password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect("103.116.105.154", username="root", password=password, look_for_keys=False, allow_agent=False, timeout=20, banner_timeout=20, auth_timeout=20)
    safe_rid = "".join(ch for ch in rid if ch.isalnum() or ch == "_")
    remote = "/linhhoasu/_ai_workbench/temp/baozi_penalty_post_verify_" + safe_rid
    remote_plan = "/linhhoasu/_ai_workbench/temp/baozi_penalty_verify_plan_" + safe_rid + ".json"
    try:
        sftp = ssh.open_sftp()
        try:
            with sftp.open(remote + ".js", "w") as f: f.write(NODE)
            with sftp.open(remote + ".php", "w") as f: f.write(PHP)
            with sftp.open(remote_plan, "w") as f: f.write(PLAN.read_text(encoding="utf-8"))
        finally:
            sftp.close()
        node_raw = run(ssh, f"cd /linhhoasu/lhs/newServer && node {remote}.js {remote_plan} {shlex_quote(rid)}", 240)
        php_raw = run(ssh, f"php {remote}.php {remote_plan} {shlex_quote(rid)}; rm -f {remote}.js {remote}.php {remote_plan}", 180)
        node = json.loads(node_raw[node_raw.rfind("\n{") + 1:])
        php = json.loads(php_raw)
        data = {"readOnly": True, "remediationId": rid, "mongo": node, "webgm": php}
    finally:
        ssh.close()
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(data, ensure_ascii=False, indent=2))
    print(f"OUT={OUT}")


def shlex_quote(value):
    return "'" + str(value).replace("'", "'\\''") + "'"


if __name__ == "__main__":
    main()
