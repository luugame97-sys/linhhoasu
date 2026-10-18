import base64
import getpass
import json
import pathlib
import shlex

import paramiko


HOST = "103.116.105.154"
CATALOG = pathlib.Path(r"F:\WebSite\gm\Linhhoasu\assets\item\webshop_catalog.json")


def run(ssh, command):
    _stdin, stdout, stderr = ssh.exec_command(command, timeout=60)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code != 0:
        raise RuntimeError(f"remote command failed ({code}): {err.strip()}")
    return out


def run_node(ssh, source):
    encoded = base64.b64encode(source.encode("utf-8")).decode("ascii")
    script = f'eval(Buffer.from("{encoded}","base64").toString("utf8"))'
    return run(ssh, f"cd /linhhoasu/lhs/newServer && node -e {shlex.quote(script)}")


def main():
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    targets = [row for row in catalog["items"] if row.get("category") in {"gem", "rare"}]
    target_ids = sorted({int(row["item_id"]) for row in targets})
    ids_csv = ",".join(str(value) for value in target_ids)

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=getpass.getpass("VPS password (not logged): "), look_for_keys=False, allow_agent=False, timeout=15)
    try:
        source = f'''
const mongoose = require('mongoose');
(async () => {{
  await mongoose.connect('mongodb://127.0.0.1:27017/lhs_s1001', {{ serverSelectionTimeoutMS: 5000 }});
  const targetIds = [{ids_csv}];
  const mailRows = await mongoose.connection.collection('mails').find(
    {{ 'attachments.id': {{ $in: targetIds }} }},
    {{ projection: {{ _id: 1, userId: 1, attachments: 1, claimed: 1, createdAt: 1, updatedAt: 1 }} }}
  ).sort({{ createdAt: 1, _id: 1 }}).toArray();
  const users = Array.from(new Set(mailRows.map((row) => row.userId)));
  const players = await mongoose.connection.collection('players').find(
    {{ userId: {{ $in: users }} }},
    {{ projection: {{ _id: 0, userId: 1, items: 1, mailClaimLedger: 1, other_attr_info: 1 }} }}
  ).toArray();
  const playerMap = new Map(players.map((player) => [player.userId, player]));
  const rows = mailRows.map((mail) => {{
    const player = playerMap.get(mail.userId) || {{}};
    const ledger = Array.isArray(player.mailClaimLedger) ? player.mailClaimLedger.map(String) : [];
    const itemMap = player.items && typeof player.items === 'object' ? player.items : {{}};
    const gemRows = player.other_attr_info && player.other_attr_info.gemInfo && Array.isArray(player.other_attr_info.gemInfo.gems)
      ? player.other_attr_info.gemInfo.gems : [];
    return {{
      mailId: String(mail._id),
      userId: mail.userId,
      claimed: !!mail.claimed,
      ledgerHasMail: ledger.includes(String(mail._id)),
      createdAt: mail.createdAt,
      updatedAt: mail.updatedAt,
      attachments: (mail.attachments || []).filter((a) => targetIds.includes(Number(a && a.id))).map((a) => ({{
        id: Number(a.id),
        count: Number(a.count),
        bagCountNow: Number(itemMap[String(a.id)] || itemMap[Number(a.id)] || 0),
        nativeGemCountNow: gemRows.filter((g) => Number(g && g.id) === Number(a.id)).length,
      }})),
    }};
  }});
  const summary = new Map();
  for (const row of rows) for (const a of row.attachments) {{
    const key = String(a.id);
    if (!summary.has(key)) summary.set(key, {{ itemId: a.id, mailCount: 0, claimedMailCount: 0, ledgerMailCount: 0, attachmentCount: 0, users: new Set(), usersWithBagNow: new Set(), usersWithNativeGemNow: new Set() }});
    const s = summary.get(key); s.mailCount += 1; s.claimedMailCount += row.claimed ? 1 : 0; s.ledgerMailCount += row.ledgerHasMail ? 1 : 0; s.attachmentCount += a.count; s.users.add(row.userId); if (a.bagCountNow > 0) s.usersWithBagNow.add(row.userId); if (a.nativeGemCountNow > 0) s.usersWithNativeGemNow.add(row.userId);
  }}
  console.log(JSON.stringify({{
    rows,
    summary: Array.from(summary.values()).sort((a,b) => a.itemId-b.itemId).map((s) => ({{...s, users: Array.from(s.users), usersWithBagNow: Array.from(s.usersWithBagNow), usersWithNativeGemNow: Array.from(s.usersWithNativeGemNow)}}))
  }}));
  await mongoose.disconnect();
}})().catch(async (error) => {{ console.error(error.stack || error.message); try {{ await mongoose.disconnect(); }} catch (_) {{}} process.exit(1); }});
'''
        data = json.loads(run_node(ssh, source))
        print(json.dumps(data, ensure_ascii=False, indent=2, default=str))
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
