import getpass
import json

import paramiko


HOST = "103.116.105.154"
USER_ID = "u_Wk_1001_7a948e_1788008560635"


REMOTE_AUDIT = r"""
const config = require('/linhhoasu/lhs/newServer/src/services/ConfigService');
const mongo = require('/linhhoasu/lhs/newServer/src/db/mongo');
const Player = require('/linhhoasu/lhs/newServer/src/db/models/Player');
const { refreshSystemUnlockInfo } = require('/linhhoasu/lhs/newServer/src/handlers/upgrade');
(async () => {
  config.loadAllTables();
  await mongo.connect();
  const userId = process.argv[2];
  const player = await Player.findOne({ userId }).lean();
  if (!player) throw new Error('PLAYER_NOT_FOUND');
  const before = Array.isArray(player.systemUnlockInfo && player.systemUnlockInfo.unlockedSystem)
    ? player.systemUnlockInfo.unlockedSystem.map(Number)
    : [];
  const clone = structuredClone(player);
  const refreshChanged = await refreshSystemUnlockInfo(clone);
  const after = Array.isArray(clone.systemUnlockInfo && clone.systemUnlockInfo.unlockedSystem)
    ? clone.systemUnlockInfo.unlockedSystem.map(Number)
    : [];
  const all = await Player.find(
    { isBot: { $ne: true } },
    { userId: 1, name: 1, level: 1, items: 1, systemUnlockInfo: 1, changeName: 1, _id: 0 },
  ).lean();
  const summary = {
    totalHumans: all.length,
    withRenameItem: 0,
    withRenameItemAnd10010: 0,
    withRenameItemWithout10010: 0,
    renamedBefore: 0,
    renamedBeforeWithout10010: 0,
  };
  const affectedSamples = [];
  for (const row of all) {
    const unlocked = Array.isArray(row.systemUnlockInfo && row.systemUnlockInfo.unlockedSystem)
      ? row.systemUnlockInfo.unlockedSystem.map(Number)
      : [];
    const has10010 = unlocked.includes(10010);
    const item22 = Number(row.items && row.items['22'] || 0);
    const changedName = Number(row.changeName || 0);
    if (item22 > 0) {
      summary.withRenameItem += 1;
      if (has10010) summary.withRenameItemAnd10010 += 1;
      else {
        summary.withRenameItemWithout10010 += 1;
        if (affectedSamples.length < 12) affectedSamples.push({ userId: row.userId, name: row.name, level: row.level, item22, changeName: changedName });
      }
    }
    if (changedName > 0) {
      summary.renamedBefore += 1;
      if (!has10010) summary.renamedBeforeWithout10010 += 1;
    }
  }
  const sys = config.get('SystemConfig') || {};
  const cost = (config.get('ConstConfig') || {}).changeNameCost || {};
  console.log(JSON.stringify({
    target: {
      userId: player.userId,
      name: player.name,
      level: player.level,
      stage: player.roleInfo && (player.roleInfo.stageId != null ? player.roleInfo.stageId : player.roleInfo.stage),
      boxLevel: player.boxInfo && player.boxInfo.level,
      mainTaskId: player.taskInfo && player.taskInfo.main && player.taskInfo.main.id,
      item22: Number(player.items && player.items['22'] || 0),
      changeName: Number(player.changeName || 0),
      has10010Before: before.includes(10010),
      has10010AfterDryRefresh: after.includes(10010),
      refreshChanged,
      unlockedCountBefore: before.length,
      unlockedCountAfterDryRefresh: after.length,
    },
    config: { renameCost: cost, system10010: sys['10010'] || sys[10010] || null },
    summary,
    affectedSamples,
  }));
})().finally(() => mongo.disconnect());
"""


REMOTE_WRAPPER = r"""
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


def run(ssh, command):
    _stdin, stdout, stderr = ssh.exec_command(command)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(error[-3000:] or output[-3000:])
    return output


def main():
    password = getpass.getpass("VPS password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False, timeout=15)
    audit_path = "/linhhoasu/_ai_workbench/temp/audit_rename_account_conditions.js"
    wrapper_path = "/linhhoasu/_ai_workbench/temp/audit_rename_account_wrapper.js"
    try:
        sftp = ssh.open_sftp()
        try:
            with sftp.file(audit_path, "w") as handle:
                handle.write(REMOTE_AUDIT)
            with sftp.file(wrapper_path, "w") as handle:
                handle.write(REMOTE_WRAPPER)
        finally:
            sftp.close()
        raw = run(ssh, f"node {wrapper_path} {audit_path} {USER_ID}")
        for line in raw.splitlines():
            if line.strip().startswith("{"):
                print(json.dumps(json.loads(line), ensure_ascii=False, indent=2))
    finally:
        try:
            run(ssh, f"rm -f -- {audit_path} {wrapper_path}")
        except Exception:
            pass
        ssh.close()


if __name__ == "__main__":
    main()
