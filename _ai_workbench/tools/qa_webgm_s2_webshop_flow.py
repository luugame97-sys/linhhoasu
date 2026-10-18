"""E2E one S2 WebShop order with exact wallet/mail/order rollback."""
from __future__ import annotations

import hashlib
import json
import os
import shlex
from datetime import datetime, timezone
from pathlib import Path

import paramiko


HOST = "103.116.105.154"
ROOT = Path(__file__).resolve().parents[1]


def run(ssh, command, timeout=120):
    _, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    return stdout.channel.recv_exit_status(), output, error


def require_ok(ssh, command, timeout=120):
    code, output, error = run(ssh, command, timeout)
    if code:
        raise RuntimeError((error + "\n" + output)[-12000:])
    return output


def marker_json(output, marker):
    if marker not in output:
        raise RuntimeError("MARKER_MISSING:" + marker + ":" + output[-2000:])
    return json.loads(output.split(marker, 1)[1].splitlines()[0])


def mongo_json(ssh, db_name, expression):
    return json.loads(require_ok(ssh, f"mongosh --quiet mongodb://127.0.0.1:27017/{db_name} --eval {shlex.quote('JSON.stringify(' + expression + ')')}").strip())


def main():
    credentials = [line.strip() for line in Path(os.environ["LHS_PROD_CREDENTIAL_FILE"]).read_text(encoding="utf-8-sig").splitlines() if line.strip()]
    if len(credentials) != 3 or credentials[0] != HOST or credentials[1] != "root":
        raise RuntimeError("CREDENTIAL_FILE_TARGET_MISMATCH")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    marker = "qa_s2_shop_" + stamp
    remote_dir = "/linhhoasu/_ai_workbench/temp/webgm_s2_shop_qa_" + stamp
    state_file = remote_dir + "/state.json"
    evidence = ROOT / "temp" / f"webgm_s2_webshop_qa_{stamp}.json"
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    ssh.connect(HOST, username="root", password=credentials[2], look_for_keys=False, allow_agent=False, timeout=20)
    state = None
    account = ""
    user_id = ""
    mail_query = ""
    try:
        require_ok(ssh, f"install -d -m 700 {shlex.quote(remote_dir)}")
        files = ["invoke_webgm_s2_action.php", "qa_webgm_s2_webshop_ledger.php"]
        sftp = ssh.open_sftp()
        try:
            for name in files:
                sftp.put(str(ROOT / "tools" / name), f"{remote_dir}/{name}")
        finally:
            sftp.close()
        for name in files:
            require_ok(ssh, f"php -l {shlex.quote(remote_dir + '/' + name)}")

        rows = mongo_json(ssh, "lhs_s1001", "db.accounts.aggregate([{$unwind:'$roles'},{$match:{'roles.serverId':1002}},{$project:{_id:0,accountId:1,userId:'$roles.userId'}},{$limit:20}]).toArray()")
        for row in rows:
            player = mongo_json(ssh, "lhs_s1002", "db.players.findOne({userId:" + json.dumps(row.get("userId", "")) + ",isBot:{$ne:true}},{_id:0,userId:1,accountId:1})")
            if player and str(player.get("accountId", "")).lower() == str(row.get("accountId", "")).lower():
                account = str(row["accountId"]); user_id = str(row["userId"]); break
        if not account or not user_id:
            raise RuntimeError("NO_OWNED_S2_ROLE_FOR_WEBSHOP_QA")

        setup = marker_json(require_ok(ssh, f"php {shlex.quote(remote_dir + '/qa_webgm_s2_webshop_ledger.php')} /linhhoasu/webgame/gm/config.php setup {shlex.quote(account)} {shlex.quote(marker)} {shlex.quote(state_file)}"), "WEBGM_S2_WEBSHOP_SETUP=")
        state = setup
        action_output = require_ok(ssh, f"cd /linhhoasu/webgame/gm/api && php {shlex.quote(remote_dir + '/invoke_webgm_s2_action.php')} /linhhoasu/webgame/gm/api/user_api.php {shlex.quote(account)} buy_shop_item {int(state['shop_id'])} {shlex.quote(marker)}")
        action = json.loads(action_output.strip().splitlines()[-1])
        if action.get("status") != "success":
            raise RuntimeError("WEBSHOP_ACTION_FAILED:" + action_output[-2000:])
        ledger = marker_json(require_ok(ssh, f"php {shlex.quote(remote_dir + '/qa_webgm_s2_webshop_ledger.php')} /linhhoasu/webgame/gm/config.php verify {shlex.quote(account)} {shlex.quote(marker)} {shlex.quote(state_file)}"), "WEBGM_S2_WEBSHOP_QA=")

        created = str(state["created_at"])
        mail_filter = "{userId:" + json.dumps(user_id) + ",targetServerId:1002,createdAt:{$gte:new Date(" + json.dumps(created) + ")},content:'Bạn có vật phẩm WebShop mới, vui lòng kiểm tra thư.',attachments:{$elemMatch:{id:175,count:1}}}"
        mail_query = mail_filter
        s2_mail = int(mongo_json(ssh, "lhs_s1002", "db.mails.countDocuments(" + mail_filter + ")"))
        s1_mail = int(mongo_json(ssh, "lhs_s1001", "db.mails.countDocuments({createdAt:{$gte:new Date(" + json.dumps(created) + ")},targetServerId:1002,attachments:{$elemMatch:{id:175,count:1}}})"))
        if s2_mail != 1 or s1_mail != 0:
            raise RuntimeError("WEBSHOP_MAIL_ROUTING_FAILED")
        require_ok(ssh, "mongosh --quiet mongodb://127.0.0.1:27017/lhs_s1002 --eval " + shlex.quote("db.mails.deleteMany(" + mail_filter + ")"))
        mail_query = ""

        cleanup = marker_json(require_ok(ssh, f"php {shlex.quote(remote_dir + '/qa_webgm_s2_webshop_ledger.php')} /linhhoasu/webgame/gm/config.php cleanup {shlex.quote(account)} {shlex.quote(marker)} {shlex.quote(state_file)}"), "WEBGM_S2_WEBSHOP_CLEANUP=")
        state = None
        payload = {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "serverId": 1002,
            "identity": {"accountHash": hashlib.sha256(account.encode()).hexdigest(), "roleHash": hashlib.sha256(user_id.encode()).hexdigest()},
            "action": {"status": action.get("status"), "message": action.get("message", "")},
            "order": {key: value for key, value in ledger.items() if key not in ["wallet_expected", "wallet_actual"]},
            "mailRouting": {"s2": s2_mail, "s1": s1_mail},
            "walletRestored": cleanup.get("wallet_restored") is True,
            "cleanup": cleanup,
        }
        evidence.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps({"result":"PASS","checks":10,"evidence":str(evidence),"sha256":hashlib.sha256(evidence.read_bytes()).hexdigest()}, ensure_ascii=False, indent=2))
    finally:
        if mail_query:
            run(ssh, "mongosh --quiet mongodb://127.0.0.1:27017/lhs_s1002 --eval " + shlex.quote("db.mails.deleteMany(" + mail_query + ")"))
        if state is not None and account:
            run(ssh, f"php {shlex.quote(remote_dir + '/qa_webgm_s2_webshop_ledger.php')} /linhhoasu/webgame/gm/config.php cleanup {shlex.quote(account)} {shlex.quote(marker)} {shlex.quote(state_file)}")
        run(ssh, f"rm -rf -- {shlex.quote(remote_dir)}")
        ssh.close()


if __name__ == "__main__":
    main()
