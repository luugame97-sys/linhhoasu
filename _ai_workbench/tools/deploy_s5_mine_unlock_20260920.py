import hashlib
import json
import posixpath
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from snapshot_web_multiserver_20260906 import connect, run

REMOTE_PATH = '/linhhoasu/lhs/newServer/src/handlers/upgrade.js'
EXPECTED_SHA = '5dee26cbdbeb3a138712c06f1911427ea87dbc2943ca0e454c18859c66f07cb3'

def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def apply_patch(content: str) -> str:
    content = content.replace('\r\n', '\n')
    # 1. Add getIgnoreDayGateSystemIds after getDisabledSystemIds
    anchor1 = """function getDisabledSystemIds() {
  return normalizeIdList(String(process.env.DISABLED_SYSTEM_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean));
}"""

    addition1 = """function getDisabledSystemIds() {
  return normalizeIdList(String(process.env.DISABLED_SYSTEM_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean));
}

function getIgnoreDayGateSystemIds() {
  const env = process.env.IGNORE_DAY_GATE_SYSTEM_IDS;
  if (env !== undefined) {
    return new Set(normalizeIdList(String(env).split(',').map((v) => v.trim()).filter(Boolean)));
  }
  // Default: System 311 (Thần Đình Thái Cổ) ignores serverRunDay gate
  // so players reaching level >= 75 can access it early.
  return new Set([311]);
}"""

    if anchor1 not in content:
        raise RuntimeError("ANCHOR1_NOT_FOUND")
    content = content.replace(anchor1, addition1, 1)

    # 2. In isSystemConditionMet, handle case 5 with ignoreDayGate check
    anchor2 = """    case 5:
      return compareConditionProgress(Math.max(1, toSafeInt(context.serverRunDay, 1)), value, cond);"""

    addition2 = """    case 5:
      if (context && context.systemId && getIgnoreDayGateSystemIds().has(toSafeInt(context.systemId, 0))) {
        return true;
      }
      return compareConditionProgress(Math.max(1, toSafeInt(context.serverRunDay, 1)), value, cond);"""

    if anchor2 not in content:
        raise RuntimeError("ANCHOR2_NOT_FOUND")
    content = content.replace(anchor2, addition2, 1)

    # 3. In isSystemConditionMet case 7, pass systemId down in context
    anchor3 = """      for (const item of conditions) {
        if (!await isSystemConditionMet(player, item, unlockedSet, depth + 1, context)) return false;
      }"""

    addition3 = """      const depContext = { ...context, systemId: value };
      for (const item of conditions) {
        if (!await isSystemConditionMet(player, item, unlockedSet, depth + 1, depContext)) return false;
      }"""

    if anchor3 not in content:
        raise RuntimeError("ANCHOR3_NOT_FOUND")
    content = content.replace(anchor3, addition3, 1)

    # 4. In refreshSystemUnlockInfo evaluate loop, pass systemId in evalContext
    anchor4 = """      for (const key of Object.keys(systemCfg)) {
        const systemId = Math.max(0, toSafeInt(key, 0));
        const row = systemCfg[key];
        const conditions = getSystemConditions(systemId, row);
        if (systemId <= 0 || !row || conditions.length <= 0) continue;
        if (disabledSet.has(systemId)) continue;
        if (unlockedSet.has(systemId)) continue;
        let passed = true;
        for (const condition of conditions) {
          if (!await isSystemConditionMet(player, condition, unlockedSet, 0, context)) {
            passed = false;
            break;
          }
        }"""

    addition4 = """      for (const key of Object.keys(systemCfg)) {
        const systemId = Math.max(0, toSafeInt(key, 0));
        const row = systemCfg[key];
        const conditions = getSystemConditions(systemId, row);
        if (systemId <= 0 || !row || conditions.length <= 0) continue;
        if (disabledSet.has(systemId)) continue;
        if (unlockedSet.has(systemId)) continue;
        let passed = true;
        const evalContext = { ...context, systemId };
        for (const condition of conditions) {
          if (!await isSystemConditionMet(player, condition, unlockedSet, 0, evalContext)) {
            passed = false;
            break;
          }
        }"""

    if anchor4 not in content:
        raise RuntimeError("ANCHOR4_NOT_FOUND")
    content = content.replace(anchor4, addition4, 1)

    return content


def main():
    ssh = connect()
    try:
        # 1. Fetch remote content and check SHA
        remote_bytes = run(ssh, f"cat {REMOTE_PATH}").encode('utf-8')
        actual_sha = sha256(remote_bytes)
        print(f"Remote SHA: {actual_sha}")
        if actual_sha != EXPECTED_SHA:
            raise RuntimeError(f"REMOTE_CAS_DRIFT: expected {EXPECTED_SHA}, got {actual_sha}")

        # 2. Apply patch
        remote_text = remote_bytes.decode('utf-8')
        patched_text = apply_patch(remote_text)
        patched_bytes = patched_text.encode('utf-8')
        new_sha = sha256(patched_bytes)
        print(f"Patched SHA: {new_sha}")

        # 3. Create backup on remote
        stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
        backup_dir = f"/linhhoasu/_ai_workbench/backups/s5_mine_unlock_{stamp}"
        run(ssh, f"mkdir -p {backup_dir}")
        with ssh.open_sftp() as sftp:
            with sftp.open(f"{backup_dir}/upgrade.js", 'wb') as f:
                f.write(remote_bytes)
            tmp_remote = f"{REMOTE_PATH}.deploy-{stamp}.js"
            with sftp.open(tmp_remote, 'wb') as f:
                f.write(patched_bytes)

        # 4. Syntax check on remote
        run(ssh, f"node --check {tmp_remote}")
        print("Syntax check PASS")

        # 5. Move file into place
        run(ssh, f"mv {tmp_remote} {REMOTE_PATH} && chmod 644 {REMOTE_PATH}")
        print("Moved patched upgrade.js to production")

        # 6. Rolling restart S1..S5
        nodes = ['lhs-s1001', 'lhs-s1002', 'lhs-s1003', 'lhs-s1004', 'lhs-s1005']
        for node in nodes:
            run(ssh, f"pm2 restart {node}")
            print(f"Restarted {node}")

        # 7. Check readiness on all ports
        ports = [8080, 8083, 8084, 8085, 8086]
        for port in ports:
            code = run(ssh, f"curl -s -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{port}/ready").strip()
            if code != '200':
                raise RuntimeError(f"NODE_PORT_{port}_NOT_READY: {code}")
            print(f"Port {port} ready: 200")

        # 8. Verification: trigger refresh on S5 for players >= 75
        verify_code = """
const { MongoClient } = require('/linhhoasu/lhs/newServer/node_modules/mongodb');
const { refreshSystemUnlockInfo } = require('/linhhoasu/lhs/newServer/src/handlers/upgrade');
const config = require('/linhhoasu/lhs/newServer/src/services/ConfigService');

(async () => {
  config.loadAllTables();
  const client = new MongoClient('mongodb://127.0.0.1:27017');
  await client.connect();
  const db = client.db('lhs_s1005');

  const p75List = await db.collection('players').find(
    { level: { $gte: 75 }, userId: { $not: /^lhs_real_bot/ } }
  ).toArray();

  console.log('Verifying S5 players >= 75: count = ' + p75List.length);
  for (const p of p75List) {
    const changed = await refreshSystemUnlockInfo(p);
    const unlocked = p.systemUnlockInfo ? p.systemUnlockInfo.unlockedSystem : [];
    const has311 = unlocked.includes(311);
    console.log(`Player [${p.name}] lvl=${p.level}: has311=${has311} changed=${changed}`);
    if (changed) {
      await db.collection('players').updateOne(
        { userId: p.userId },
        { $set: { systemUnlockInfo: p.systemUnlockInfo } }
      );
      console.log(`Persisted 311 unlock for [${p.name}]`);
    }
  }

  // Also check a player < 75 (should NOT have 311)
  const pUnder75 = await db.collection('players').findOne(
    { level: { $lt: 75 }, userId: { $not: /^lhs_real_bot/ } }
  );
  if (pUnder75) {
    await refreshSystemUnlockInfo(pUnder75);
    const unlocked = pUnder75.systemUnlockInfo ? pUnder75.systemUnlockInfo.unlockedSystem : [];
    const has311 = unlocked.includes(311);
    console.log(`Player < 75 [${pUnder75.name}] lvl=${pUnder75.level}: has311=${has311} (MUST be false)`);
    if (has311) throw new Error('PLAYER_UNDER_75_UNLOCKED_311_VIOLATION');
  }

  await client.close();
  console.log('VERIFICATION_COMPLETE_PASS');
})();
"""
        ver_out = run(ssh, "node", input_text=verify_code)
        print("Verification output:")
        print(ver_out)

        # 9. Also update local file
        local_target = Path(__file__).resolve().parents[2] / 'linhhoasu/lhs/newServer/src/handlers/upgrade.js'
        local_target.write_text(patched_text, encoding='utf-8')
        print(f"Updated local file: {local_target}")

        report = {
            'status': 'DEPLOYED_AND_VERIFIED',
            'timestamp': stamp,
            'backup': backup_dir,
            'beforeSha': actual_sha,
            'afterSha': new_sha,
        }
        print(json.dumps(report, indent=2))

    finally:
        ssh.close()

if __name__ == '__main__':
    main()
