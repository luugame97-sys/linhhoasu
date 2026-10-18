import getpass
import json
from datetime import datetime, timezone
from pathlib import Path

import paramiko


HOST = "103.116.105.154"
APP_ROOT = "/linhhoasu/lhs/newServer"
TARGET_USER = "u_Wk_1001_7a948e_1788008560635"
TARGET_NAME = "tuan12"
LOCAL_UPGRADE = Path(
    r"I:\Linhhoasu\server\server\_ai_workbench\temp\rename_hotfix\current_remote\src\handlers\upgrade.js"
)


ACTION_SCRIPT = r"""
const fs = require('fs');
const config = require('/linhhoasu/lhs/newServer/src/services/ConfigService');
const mongo = require('/linhhoasu/lhs/newServer/src/db/mongo');
const Player = require('/linhhoasu/lhs/newServer/src/db/models/Player');
const Account = require('/linhhoasu/lhs/newServer/src/db/models/Account');
const task = require('/linhhoasu/lhs/newServer/src/handlers/task');
(async () => {
  config.loadAllTables();
  await mongo.connect();
  const userId = process.argv[2];
  const targetName = process.argv[3];
  const backupPath = process.argv[4];
  const playerDoc = await Player.findOne({ userId });
  if (!playerDoc) throw new Error('PLAYER_NOT_FOUND');
  const accountDoc = await Account.findOne({ 'roles.userId': userId });
  if (backupPath) {
    fs.writeFileSync(backupPath, JSON.stringify({
      player: playerDoc.toObject ? playerDoc.toObject() : playerDoc,
      account: accountDoc && (accountDoc.toObject ? accountDoc.toObject() : accountDoc),
    }, null, 2), { mode: 0o600 });
  }
  const collision = await Player.findOne({ name: targetName, userId: { $ne: userId } }, { userId: 1, name: 1, _id: 0 }).lean();
  if (collision) throw new Error('TARGET_NAME_TAKEN');
  const player = playerDoc.toObject ? playerDoc.toObject() : playerDoc;
  const session = { userId, player, _isBot: false };
  const result = await task.handleRename({ name: targetName }, session, 900001);
  const after = await Player.findOne({ userId }, { userId: 1, name: 1, items: 1, changeName: 1, _id: 0 }).lean();
  const afterAccount = await Account.findOne({ 'roles.userId': userId }, { roles: 1, _id: 0 }).lean();
  const role = afterAccount && Array.isArray(afterAccount.roles)
    ? afterAccount.roles.find((entry) => String(entry.userId || '') === userId)
    : null;
  const packets = Array.isArray(result) ? result : [result];
  const renamePacket = packets.find((packet) => Number(packet && packet.tag) === 21) || null;
  const ok = !!renamePacket
    && Number(renamePacket.data && renamePacket.data.result) === 0
    && after && String(after.name || '') === targetName
    && Number(after.items && after.items['22'] || 0) === 0
    && role && String(role.name || '') === targetName;
  console.log(JSON.stringify({
    ok,
    response: renamePacket && renamePacket.data,
    after: after && { userId: after.userId, name: after.name, item22: Number(after.items && after.items['22'] || 0), changeName: Number(after.changeName || 0) },
    accountRoleName: role ? String(role.name || '') : '',
  }));
  if (!ok) process.exitCode = 2;
})().finally(() => mongo.disconnect());
"""

WRAPPER_SCRIPT = r"""
const cp = require('child_process');
const pm2 = JSON.parse(cp.execFileSync('pm2', ['jlist'], { encoding: 'utf8' }));
const processInfo = pm2.find((entry) => entry.name === 'lhs-s1001');
const configured = processInfo && processInfo.pm2_env && processInfo.pm2_env.env || {};
const env = { ...process.env };
for (const key of ['MONGO_URI', 'CONFIG_BIN_PATH', 'SERVER_ID']) {
  if (configured[key] != null) env[key] = configured[key];
}
const result = cp.spawnSync(process.execPath, process.argv.slice(2), { env, encoding: 'utf8' });
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
process.exit(result.status == null ? 1 : result.status);
"""


def run(ssh, command, timeout=120, check=True):
    _stdin, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if check and code:
        raise RuntimeError(error[-4000:] or output[-4000:] or f"remote command failed: {code}")
    return output


def wait_ready(ssh):
    return run(
        ssh,
        "for i in $(seq 1 45); do "
        "code=$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ready || true); "
        "if [ \"$code\" = 200 ] && ss -lnt | grep -q ':9200 '; then echo READY; exit 0; fi; "
        "sleep 1; done; exit 1",
        timeout=60,
    ).strip()


def main():
    password = getpass.getpass("VPS password (not logged): ")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/rename_unlock_10010_test_{stamp}"
    remote_upgrade = f"{APP_ROOT}/src/handlers/upgrade.js"
    upgrade_stage = f"{remote_upgrade}.rename-unlock-{stamp}.js"
    action_path = f"/linhhoasu/_ai_workbench/temp/rename_action_{stamp}.js"
    wrapper_path = f"/linhhoasu/_ai_workbench/temp/rename_action_wrapper_{stamp}.js"
    backup_doc = f"{backup}/target_before.ejson"
    source_installed = False
    worker_present = False

    if not LOCAL_UPGRADE.is_file():
        raise FileNotFoundError(LOCAL_UPGRADE)

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False, timeout=15)
    try:
        run(ssh, f"set -eu; mkdir -p {backup}; cp -p {remote_upgrade} {backup}/upgrade.js")
        worker_present = run(ssh, "pm2 describe lhs-real-bots >/dev/null 2>&1 && echo yes || echo no").strip() == "yes"

        sftp = ssh.open_sftp()
        try:
            sftp.put(str(LOCAL_UPGRADE), upgrade_stage)
            with sftp.file(action_path, "w") as handle:
                handle.write(ACTION_SCRIPT)
            with sftp.file(wrapper_path, "w") as handle:
                handle.write(WRAPPER_SCRIPT)
        finally:
            sftp.close()

        run(ssh, f"node --check {upgrade_stage}; node --check {action_path}; node --check {wrapper_path}")
        run(ssh, f"mv {upgrade_stage} {remote_upgrade}; chmod 644 {remote_upgrade}")
        source_installed = True

        if worker_present:
            run(ssh, "pm2 stop lhs-real-bots")
        run(ssh, "pm2 restart lhs-s1001 --update-env")
        print("GAME_READY=" + wait_ready(ssh))

        action_output = run(ssh, f"node {wrapper_path} {action_path} {TARGET_USER} {TARGET_NAME} {backup_doc}", timeout=120)
        result = None
        for line in action_output.splitlines():
            line = line.strip()
            if line.startswith("{") and line.endswith("}"):
                result = json.loads(line)
        if result is None or not result.get("ok"):
            raise RuntimeError("rename action did not verify: " + action_output[-3000:])
        print(json.dumps(result, ensure_ascii=False))

        if worker_present:
            run(ssh, "pm2 restart lhs-real-bots --update-env")
        run(ssh, "pm2 save")
        print("BACKUP=" + backup)
        print("TARGET_BACKUP=" + backup_doc)
        print(run(ssh, "pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s)){if([\"lhs-s1001\",\"lhs-real-bots\",\"lhs-dist\",\"lhs-admin\"].includes(p.name))console.log(p.name+\"=\"+p.pm2_env.status+\",pid=\"+p.pid+\",restarts=\"+p.pm2_env.restart_time)}})' ").strip())
        print("READY_HTTP=" + run(ssh, "curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ready").strip())
        print("WS_9200=" + run(ssh, "ss -lnt | grep -q ':9200 ' && echo listening").strip())
        print(run(ssh, "tail -n 160 /root/.pm2/logs/lhs-s1001-out.log | grep -E 'Rename|handlers registered' | tail -n 20 || true").strip())
    except Exception:
        if source_installed:
            try:
                run(ssh, f"cp -p {backup}/upgrade.js {remote_upgrade}; pm2 restart lhs-s1001 --update-env")
                wait_ready(ssh)
            except Exception as rollback_error:
                print(f"ROLLBACK_ERROR={rollback_error}")
        if worker_present:
            try:
                run(ssh, "pm2 restart lhs-real-bots --update-env; pm2 save")
            except Exception as worker_error:
                print(f"WORKER_RECOVERY_ERROR={worker_error}")
        raise
    finally:
        for path in (upgrade_stage, action_path, wrapper_path):
            try:
                run(ssh, f"rm -f -- {path}")
            except Exception:
                pass
        ssh.close()


if __name__ == "__main__":
    main()
