"""E2E WebGM S2 role, GiftCode and recharge claim with exact cleanup."""
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
TOOLS = [
    "qa_webgm_s2_role_routing.php",
    "invoke_webgm_s2_action.php",
    "qa_webgm_s2_ledger.php",
]


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
    return json.loads(require_ok(
        ssh,
        f"mongosh --quiet mongodb://127.0.0.1:27017/{db_name} --eval {shlex.quote('JSON.stringify(' + expression + ')')}",
    ).strip())


def main():
    credentials = [line.strip() for line in Path(os.environ["LHS_PROD_CREDENTIAL_FILE"]).read_text(encoding="utf-8-sig").splitlines() if line.strip()]
    if len(credentials) != 3 or credentials[0] != HOST or credentials[1] != "root":
        raise RuntimeError("CREDENTIAL_FILE_TARGET_MISMATCH")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    marker = "qa_s2_" + stamp
    remote_dir = "/linhhoasu/_ai_workbench/temp/webgm_s2_full_qa_" + stamp
    state_file = remote_dir + "/state.json"
    evidence = ROOT / "temp" / f"webgm_s2_feature_qa_{stamp}.json"

    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    ssh.connect(HOST, username="root", password=credentials[2], look_for_keys=False, allow_agent=False, timeout=20)
    state = None
    account = ""
    user_id = ""
    item_before = None
    gift_event = ""
    recharge_event = ""
    cleanup_result = None
    try:
        require_ok(ssh, f"install -d -m 700 {shlex.quote(remote_dir)}")
        sftp = ssh.open_sftp()
        try:
            for name in TOOLS:
                sftp.put(str(ROOT / "tools" / name), f"{remote_dir}/{name}")
        finally:
            sftp.close()
        for name in TOOLS:
            require_ok(ssh, f"php -l {shlex.quote(remote_dir + '/' + name)}")

        identity = mongo_json(
            ssh,
            "lhs_s1001",
            "db.accounts.aggregate([{$unwind:'$roles'},{$match:{'roles.serverId':1002}},{$project:{_id:0,accountId:1,userId:'$roles.userId'}},{$limit:20}]).toArray()",
        )
        selected = None
        for row in identity:
            candidate = mongo_json(
                ssh,
                "lhs_s1002",
                "db.players.findOne({userId:" + json.dumps(row.get("userId", "")) + ",isBot:{$ne:true}},{_id:0,userId:1,accountId:1,items:1})",
            )
            if candidate and str(candidate.get("accountId", "")).lower() == str(row.get("accountId", "")).lower():
                selected = (row, candidate)
                break
        if not selected:
            raise RuntimeError("NO_OWNED_S2_ROLE_FOR_QA")
        account = str(selected[0]["accountId"])
        user_id = str(selected[0]["userId"])
        item_before = int((selected[1].get("items") or {}).get("6", 0) or 0)

        role_output = require_ok(
            ssh,
            f"php {shlex.quote(remote_dir + '/qa_webgm_s2_role_routing.php')} /linhhoasu/webgame/gm/config.php {shlex.quote(account)} {shlex.quote(user_id)}",
        )
        role_qa = marker_json(role_output, "WEBGM_S2_ROLE_QA=")

        setup_output = require_ok(
            ssh,
            f"php {shlex.quote(remote_dir + '/qa_webgm_s2_ledger.php')} /linhhoasu/webgame/gm/config.php setup {shlex.quote(account)} {shlex.quote(marker)} {shlex.quote(state_file)}",
        )
        state = marker_json(setup_output, "WEBGM_S2_SETUP=")
        gift_event = "webgm_gift_" + hashlib.sha256(f"{account}|1002|{state['gift_id']}|1".encode()).hexdigest()
        recharge_event = "webgm_recharge_" + hashlib.sha256(f"{account}|1002|{state['milestone_id']}|total".encode()).hexdigest()

        gift_output = require_ok(
            ssh,
            f"cd /linhhoasu/webgame/gm/api && php {shlex.quote(remote_dir + '/invoke_webgm_s2_action.php')} /linhhoasu/webgame/gm/api/user_api.php {shlex.quote(account)} submit_giftcode {shlex.quote(state['gift_code'])} {shlex.quote(marker + '_gift')}",
        )
        gift_response = json.loads(gift_output.strip().splitlines()[-1])
        if gift_response.get("status") != "success":
            raise RuntimeError("GIFTCODE_ACTION_FAILED:" + gift_output[-2000:])

        recharge_output = require_ok(
            ssh,
            f"cd /linhhoasu/webgame/gm/api && php {shlex.quote(remote_dir + '/invoke_webgm_s2_action.php')} /linhhoasu/webgame/gm/api/user_api.php {shlex.quote(account)} claim_recharge_milestone {int(state['milestone_id'])} {shlex.quote(marker + '_recharge')}",
        )
        recharge_response = json.loads(recharge_output.strip().splitlines()[-1])
        if recharge_response.get("status") != "success":
            raise RuntimeError("RECHARGE_ACTION_FAILED:" + recharge_output[-2000:])

        verify_output = require_ok(
            ssh,
            f"php {shlex.quote(remote_dir + '/qa_webgm_s2_ledger.php')} /linhhoasu/webgame/gm/config.php verify {shlex.quote(account)} {shlex.quote(marker)} {shlex.quote(state_file)}",
        )
        ledger_qa = marker_json(verify_output, "WEBGM_S2_LEDGER_QA=")

        s2_mail = mongo_json(ssh, "lhs_s1002", "({gift:db.mails.countDocuments({userId:" + json.dumps(user_id) + ",eventKey:" + json.dumps(gift_event) + ",targetServerId:1002}),recharge:db.mails.countDocuments({userId:" + json.dumps(user_id) + ",eventKey:" + json.dumps(recharge_event) + ",targetServerId:1002})})")
        s1_mail = mongo_json(ssh, "lhs_s1001", "({gift:db.mails.countDocuments({eventKey:" + json.dumps(gift_event) + "}),recharge:db.mails.countDocuments({eventKey:" + json.dumps(recharge_event) + "})})")
        if s2_mail != {"gift": 1, "recharge": 1} or s1_mail != {"gift": 0, "recharge": 0}:
            raise RuntimeError("MAIL_DATABASE_ROUTING_FAILED")

        require_ok(
            ssh,
            "mongosh --quiet mongodb://127.0.0.1:27017/lhs_s1002 --eval "
            + shlex.quote("db.mails.deleteMany({userId:" + json.dumps(user_id) + ",eventKey:{$in:[" + json.dumps(gift_event) + "," + json.dumps(recharge_event) + "]}})"),
        )
        gift_event = ""
        recharge_event = ""

        cleanup_output = require_ok(
            ssh,
            f"php {shlex.quote(remote_dir + '/qa_webgm_s2_ledger.php')} /linhhoasu/webgame/gm/config.php cleanup {shlex.quote(account)} {shlex.quote(marker)} {shlex.quote(state_file)}",
        )
        cleanup_result = marker_json(cleanup_output, "WEBGM_S2_CLEANUP=")
        state = None

        item_after = mongo_json(
            ssh,
            "lhs_s1002",
            "Number((db.players.findOne({userId:" + json.dumps(user_id) + "},{items:1})||{items:{}}).items['6']||0)",
        )
        if int(item_after) != item_before:
            raise RuntimeError("PLAYER_ITEM_CHANGED_DURING_MAIL_QA")

        payload = {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "serverId": 1002,
            "identity": {"accountHash": hashlib.sha256(account.encode()).hexdigest(), "roleHash": hashlib.sha256(user_id.encode()).hexdigest()},
            "roleRouting": role_qa,
            "giftcodeResponse": {"status": gift_response.get("status"), "message": gift_response.get("message", "")},
            "rechargeResponse": {"status": recharge_response.get("status"), "message": recharge_response.get("message", "")},
            "ledger": {key: value for key, value in ledger_qa.items() if not key.endswith("event_key")},
            "mailRouting": {"s2": s2_mail, "s1": s1_mail},
            "cleanup": cleanup_result,
            "playerItemUnchanged": True,
        }
        evidence.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps({"result":"PASS","checks":20,"evidence":str(evidence),"sha256":hashlib.sha256(evidence.read_bytes()).hexdigest()}, ensure_ascii=False, indent=2))
    finally:
        if gift_event or recharge_event:
            events = [value for value in [gift_event, recharge_event] if value]
            run(ssh, "mongosh --quiet mongodb://127.0.0.1:27017/lhs_s1002 --eval " + shlex.quote("db.mails.deleteMany({eventKey:{$in:" + json.dumps(events) + "}})"))
        if state is not None and account:
            run(ssh, f"php {shlex.quote(remote_dir + '/qa_webgm_s2_ledger.php')} /linhhoasu/webgame/gm/config.php cleanup {shlex.quote(account)} {shlex.quote(marker)} {shlex.quote(state_file)}")
        run(ssh, f"rm -rf -- {shlex.quote(remote_dir)}")
        ssh.close()


if __name__ == "__main__":
    main()
