import base64
import getpass
import json
import shlex
import sys

import paramiko


HOST = "103.116.105.154"
CATALOG = "/linhhoasu/webgame/gm/assets/item/webshop_catalog.json"


def run(ssh, command):
    _stdin, stdout, stderr = ssh.exec_command(command, timeout=60)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code != 0:
        raise RuntimeError(f"remote command failed ({code}): {err.strip()}")
    return out


def run_encoded(ssh, runtime, source, cwd=None):
    encoded = base64.b64encode(source.encode("utf-8")).decode("ascii")
    if runtime == "php":
        command = f"php -r {shlex.quote(f'eval(base64_decode(\"{encoded}\"));')}"
    elif runtime == "node":
        script = f'eval(Buffer.from("{encoded}","base64").toString("utf8"))'
        command = f"node -e {shlex.quote(script)}"
    else:
        raise ValueError(runtime)
    if cwd:
        command = f"cd {shlex.quote(cwd)} && {command}"
    return run(ssh, command)


def main():
    mongo_only = "--mongo-only" in sys.argv
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(
        HOST,
        username="root",
        password=getpass.getpass("VPS password (not logged): "),
        look_for_keys=False,
        allow_agent=False,
        timeout=15,
    )
    try:
        sftp = ssh.open_sftp()
        try:
            with sftp.open(CATALOG, "rb") as stream:
                catalog = json.loads(stream.read().decode("utf-8"))
        finally:
            sftp.close()

        rows = catalog.get("items", [])
        targets = [row for row in rows if row.get("category") in {"gem", "rare"}]
        target_ids = sorted({int(row["item_id"]) for row in targets})
        if not mongo_only:
            print("### TARGET_CATALOG")
            print(json.dumps(targets, ensure_ascii=False, indent=2))

        ids_csv = ",".join(str(value) for value in target_ids)
        php_source = f'''
require '/linhhoasu/webgame/gm/config.php';
$ids = array({ids_csv});
$marks = implode(',', array_fill(0, count($ids), '?'));
$items = $conn_web->prepare("SELECT id,item_id,item_name,price,item_amount,sort_order,is_active,created_at FROM webshop_items WHERE CAST(item_id AS UNSIGNED) IN ($marks) ORDER BY sort_order,id");
$items->execute($ids);
$orders = $conn_web->prepare("SELECT id,account_name,server_id,role_id,shop_item_id,item_id,quantity,unit_price,total_price,status,created_at FROM webshop_orders WHERE CAST(item_id AS UNSIGNED) IN ($marks) ORDER BY created_at,id");
$orders->execute($ids);
$summary = $conn_web->prepare("SELECT item_id,status,COUNT(*) AS order_count,SUM(quantity) AS quantity_sum,SUM(total_price) AS price_sum,MIN(created_at) AS first_order,MAX(created_at) AS last_order FROM webshop_orders WHERE CAST(item_id AS UNSIGNED) IN ($marks) GROUP BY item_id,status ORDER BY CAST(item_id AS UNSIGNED),status");
$summary->execute($ids);
echo json_encode(array('items'=>$items->fetchAll(PDO::FETCH_ASSOC),'orders'=>$orders->fetchAll(PDO::FETCH_ASSOC),'summary'=>$summary->fetchAll(PDO::FETCH_ASSOC)), JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
'''
        if not mongo_only:
            mysql_data = json.loads(run_encoded(ssh, "php", php_source))
            print("### MYSQL")
            print(json.dumps(mysql_data, ensure_ascii=False, indent=2))

        node_source = f'''
const mongoose = require('mongoose');
(async () => {{
  await mongoose.connect('mongodb://127.0.0.1:27017/lhs_s1001', {{ serverSelectionTimeoutMS: 5000 }});
  const targetIds = [{ids_csv}];
  const mails = await mongoose.connection.collection('mails').find(
    {{ 'attachments.id': {{ $in: targetIds }} }},
    {{ projection: {{ _id: 1, userId: 1, title: 1, content: 1, sender: 1, attachments: 1, read: 1, claimed: 1, createdAt: 1, updatedAt: 1, batchId: 1, createdBy: 1, eventKey: 1 }} }}
  ).sort({{ createdAt: 1, _id: 1 }}).toArray();
  const agg = await mongoose.connection.collection('mails').aggregate([
    {{ $unwind: '$attachments' }},
    {{ $match: {{ 'attachments.id': {{ $in: targetIds }} }} }},
    {{ $group: {{ _id: {{ itemId: '$attachments.id', claimed: '$claimed' }}, mailCount: {{ $sum: 1 }}, itemCount: {{ $sum: '$attachments.count' }}, firstMail: {{ $min: '$createdAt' }}, lastMail: {{ $max: '$createdAt' }} }} }},
    {{ $sort: {{ '_id.itemId': 1, '_id.claimed': 1 }} }}
  ]).toArray();
  console.log(JSON.stringify({{ mails, agg }}));
  await mongoose.disconnect();
}})().catch(async (error) => {{ console.error(error.stack || error.message); try {{ await mongoose.disconnect(); }} catch (_) {{}} process.exit(1); }});
'''
        mongo_data = json.loads(run_encoded(ssh, "node", node_source, "/linhhoasu/lhs/newServer"))
        print("### MONGO")
        print(json.dumps(mongo_data, ensure_ascii=False, indent=2, default=str))

        print("### HASHES")
        print(run(ssh, "sha256sum /linhhoasu/lhs/newServer/src/handlers/mail.js /linhhoasu/lhs/newServer/src/net/HTTPServer.js /linhhoasu/webgame/gm/config.php /linhhoasu/webgame/gm/api/user_api.php /linhhoasu/webgame/gm/assets/item/webshop_catalog.json"))
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
