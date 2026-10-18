import base64
import getpass
import json
import shlex

import paramiko


HOST = "103.116.105.154"


def main():
    source = r'''
const mongoose = require('mongoose');
(async () => {
  await mongoose.connect('mongodb://127.0.0.1:27017/lhs_s1001', { serverSelectionTimeoutMS: 5000 });
  const ids = ['u_Wk_1001_0e9258_1788043345820','u_Wk_1001_038564_1788003398152','u_Wk_1001_ed9347_1788009359657'];
  const rows = await mongoose.connection.collection('players').find({ userId: { $in: ids } }).toArray();
  const slim = rows.map((row) => ({ userId: row.userId, keys: Object.keys(row).sort(), mailClaimLedger: row.mailClaimLedger, items: row.items, other_attr_info: row.other_attr_info, fashionInfo: row.fashionInfo, swordInfo: row.swordInfo, petInfo: row.petInfo }));
  console.log(JSON.stringify(slim));
  await mongoose.disconnect();
})().catch(async (error) => { console.error(error.stack || error.message); try { await mongoose.disconnect(); } catch (_) {} process.exit(1); });
'''
    encoded = base64.b64encode(source.encode()).decode()
    cmd = f"cd /linhhoasu/lhs/newServer && node -e {shlex.quote(f'eval(Buffer.from(\"{encoded}\",\"base64\").toString(\"utf8\"))')}"
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=getpass.getpass("VPS password (not logged): "), look_for_keys=False, allow_agent=False, timeout=15)
    try:
        _, out, err = ssh.exec_command(cmd)
        print(out.read().decode("utf-8", "replace"))
        print(err.read().decode("utf-8", "replace"))
        _, out, err = ssh.exec_command("grep -nE 'Mail|mail|1103|webshop|90043|2505[234]' /root/.pm2/logs/lhs-s1001-out.log | tail -300")
        print("### LOGS")
        print(out.read().decode("utf-8", "replace"))
        print(err.read().decode("utf-8", "replace"))
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
