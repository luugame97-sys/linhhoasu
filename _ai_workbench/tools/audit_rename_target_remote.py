import getpass
import json

import paramiko


HOST = "103.116.105.154"
USER_ID = "u_Wk_1001_7a948e_1788008560635"
TARGET_NAME = "tuan12"


REMOTE_SCRIPT = r"""
const path = require('path');
require('/linhhoasu/lhs/newServer/node_modules/dotenv').config({
  path: '/linhhoasu/lhs/newServer/.env',
  quiet: true,
});
const mongo = require('/linhhoasu/lhs/newServer/src/db/mongo');
const Player = require('/linhhoasu/lhs/newServer/src/db/models/Player');
const Account = require('/linhhoasu/lhs/newServer/src/db/models/Account');
(async () => {
  await mongo.connect();
  const userId = process.argv[2];
  const targetName = process.argv[3];
  const [player, collision, account] = await Promise.all([
    Player.findOne({ userId }, { userId: 1, name: 1, items: 1, changeName: 1, _id: 0 }).lean(),
    Player.findOne({ name: targetName, userId: { $ne: userId } }, { userId: 1, name: 1, _id: 0 }).lean(),
    Account.findOne({ 'roles.userId': userId }, { account: 1, roles: 1, _id: 0 }).lean(),
  ]);
  const playerCount = await Player.countDocuments();
  const nameSamples = await Player.find(
    { $or: [{ name: /tuanchoc928/i }, { name: /duytuan12/i }] },
    { userId: 1, name: 1, serverId: 1, _id: 0 },
  ).limit(20).lean();
  const role = account && Array.isArray(account.roles)
    ? account.roles.find((entry) => String(entry.userId || '') === userId)
    : null;
  console.log(JSON.stringify({
    mongoDatabase: mongo.mongoose.connection.name,
    mongoUri: String(process.env.MONGO_URI || '').replace(/:\/\/([^@/]+)@/, '://[REDACTED_SECRET]@'),
    playerCount,
    nameSamples,
    playerFound: !!player,
    currentName: player ? String(player.name || '') : '',
    renameItem22: player && player.items ? Number(player.items['22'] || 0) : 0,
    changeNameCount: player ? Number(player.changeName || 0) : 0,
    targetNameTaken: !!collision,
    accountRoleName: role ? String(role.name || '') : '',
  }));
})().finally(() => mongo.disconnect());
"""

REMOTE_WRAPPER = r"""
const cp = require('child_process');
const pm2 = JSON.parse(cp.execFileSync('pm2', ['jlist'], { encoding: 'utf8' }));
const processInfo = pm2.find((entry) => entry.name === 'lhs-s1001');
const env = { ...process.env };
if (processInfo && processInfo.pm2_env && processInfo.pm2_env.env) {
  const configured = processInfo.pm2_env.env;
  if (configured.MONGO_URI) env.MONGO_URI = configured.MONGO_URI;
}
const result = cp.spawnSync(process.execPath, process.argv.slice(2), {
  env,
  encoding: 'utf8',
});
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
process.exit(result.status == null ? 1 : result.status);
"""


def run(ssh, command):
    _stdin, stdout, stderr = ssh.exec_command(command)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(error[-2000:] or output[-2000:])
    return output


def main():
    password = getpass.getpass("VPS password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(
        HOST,
        username="root",
        password=password,
        look_for_keys=False,
        allow_agent=False,
        timeout=15,
    )
    remote_path = "/linhhoasu/_ai_workbench/temp/audit_rename_target_remote.js"
    wrapper_path = "/linhhoasu/_ai_workbench/temp/audit_rename_wrapper_remote.js"
    try:
        sftp = ssh.open_sftp()
        try:
            with sftp.file(remote_path, "w") as handle:
                handle.write(REMOTE_SCRIPT)
            with sftp.file(wrapper_path, "w") as handle:
                handle.write(REMOTE_WRAPPER)
        finally:
            sftp.close()
        raw = run(ssh, f"node {wrapper_path} {remote_path} {USER_ID} {TARGET_NAME}")
        result = None
        for line in raw.splitlines():
            line = line.strip()
            if line.startswith("{") and line.endswith("}"):
                result = json.loads(line)
        if result is None:
            raise RuntimeError("No audit JSON returned")
        print(json.dumps(result, ensure_ascii=False))
        raw_pm2 = run(ssh, "pm2 jlist")
        pm2 = json.loads(raw_pm2)
        for process in pm2:
            if process.get("name") != "lhs-s1001":
                continue
            env = process.get("pm2_env", {}).get("env", {})
            selected = {}
            for key, value in env.items():
                if any(token in key.upper() for token in ("MONGO", "REDIS", "DB_")):
                    text = str(value)
                    selected[key] = text.replace(text, "[REDACTED_SECRET]") if any(token in key.upper() for token in ("PASSWORD", "PASS", "SECRET", "TOKEN", "URI")) else text
            print(json.dumps({"pm2Cwd": process.get("pm2_env", {}).get("pm_cwd"), "pm2Exec": process.get("pm2_env", {}).get("pm_exec_path"), "selectedEnv": selected}, ensure_ascii=False))
            break
    finally:
        try:
            run(ssh, f"rm -f -- {remote_path}")
        except Exception:
            pass
        try:
            run(ssh, f"rm -f -- {wrapper_path}")
        except Exception:
            pass
        ssh.close()


if __name__ == "__main__":
    main()
