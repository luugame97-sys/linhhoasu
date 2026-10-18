#!/usr/bin/env python3
"""Resume the level-unlock rollout after a transient ready-poll failure."""
from __future__ import annotations

import json
import shlex
import time
from pathlib import Path
from datetime import datetime, timezone

import paramiko

ROOT = Path(__file__).resolve().parents[2]
CREDENTIALS = ROOT / "_ai_workbench" / "VPS103.116.104.165.txt"
RELEASE = ROOT / "_ai_workbench" / "temp" / "level_unlock_20261009" / "release.json"
REMOTE_TEMP = "/linhhoasu/_ai_workbench/temp/level_unlock_20261009"
REMOTE_SOURCE = "/linhhoasu/lhs/newServer/src/handlers/upgrade.js"
CANDIDATE_HASH = "da90e3ac54e9c28d429b3815edc01220a5bab24752c5f4a3e92d051cb0b15f54"
EXPECTED_PREIMAGE = "48798f66479633a5dedfac552e3e6d905e8003fc328eabe02455e3ebbc144e41"
NODES = [
    ("lhs-s1001", 8080), ("lhs-s1002", 8083), ("lhs-s1003", 8084),
    ("lhs-s1004", 8085), ("lhs-s1005", 8086), ("lhs-s1006", 8087),
    ("lhs-s1007", 8088), ("lhs-s1008", 8089),
]
CONTRACT = r"""
'use strict';
const assert = require('assert/strict');
const Module = require('module');
const originalLoad = Module._load;
const loggerStub = { debug() {}, info() {}, warn() {}, error() {} };
class SchemaStub { constructor() { this.statics = {}; this.methods = {}; } index() {} pre() {} }
SchemaStub.Types = { Mixed: class MixedStub {} };
Module._load = function(request, parent, isMain) {
  if (request === 'mongoose') return { Schema: SchemaStub, model: () => ({}) };
  if (request === 'ioredis') return class RedisStub {};
  if (request === '../logger' || request === './logger' || /[\\/]logger(?:\\.js)?$/.test(request)) return loggerStub;
  if (request === '../services/ServerConfigService') return { findServerConfig: async () => ({ openTime: Date.now() }) };
  return originalLoad.call(this, request, parent, isMain);
};
const config = require('/linhhoasu/lhs/newServer/src/services/ConfigService');
const upgrade = require('/linhhoasu/lhs/newServer/src/handlers/upgrade');
const makePlayer = (level, unlockedSystem = [], tasks = {}) => ({
  level, roleInfo: { stage: 1, stageId: 1 },
  systemUnlockInfo: { unlockedSystem, rewardedSystem: [] },
  taskInfo: { tasks, tasksMap: {} },
});
(async() => {
  process.env.LEVEL_UNLOCK_SYSTEM_IDS = '209,216';
  process.env.LEVEL_UNLOCK_SYSTEM_MIN_LEVEL = '100';
  process.env.FORCE_UNLOCK_SYSTEM_IDS = '10010,209,216,219';
  process.env.DISABLED_SYSTEM_IDS = '';
  process.env.FEATURE_SIDE_TASKS_ENABLED = '0';
  const cfg = config.get('SystemConfig');
  assert.deepEqual(cfg[209].conditions, [{ type: 2, value: 90021, cond: 4 }]);
  assert.deepEqual(cfg[216].conditions, [{ type: 2, value: 90003, cond: 4 }]);
  const under = makePlayer(99, [], {
    90021: { id: 90021, type: 9, status: 30 },
    90003: { id: 90003, type: 9, status: 30 },
  });
  await upgrade.refreshSystemUnlockInfo(under);
  assert(!under.systemUnlockInfo.unlockedSystem.includes(209));
  assert(!under.systemUnlockInfo.unlockedSystem.includes(216));
  const eligible = makePlayer(100);
  await upgrade.refreshSystemUnlockInfo(eligible);
  assert(eligible.systemUnlockInfo.unlockedSystem.includes(209));
  assert(eligible.systemUnlockInfo.unlockedSystem.includes(216));
  console.log(JSON.stringify({
    result: 'PASS', productionWrites: 0, networkAttempts: 0,
    level99Has209: under.systemUnlockInfo.unlockedSystem.includes(209),
    level99Has216: under.systemUnlockInfo.unlockedSystem.includes(216),
    level100Has209: eligible.systemUnlockInfo.unlockedSystem.includes(209),
    level100Has216: eligible.systemUnlockInfo.unlockedSystem.includes(216),
  }));
})().catch((error) => { console.error(error.stack || String(error)); process.exitCode = 1; });
"""


def connect() -> paramiko.SSHClient:
    host, user, password = CREDENTIALS.read_text(encoding="utf-8-sig").splitlines()
    client = paramiko.SSHClient()
    client.load_system_host_keys()
    client.set_missing_host_key_policy(paramiko.RejectPolicy())
    client.connect(host, username=user, password=password, look_for_keys=False, allow_agent=False, timeout=20)
    return client


def run(ssh: paramiko.SSHClient, command: str, input_text: str | None = None, timeout: int = 120) -> str:
    stdin, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    if input_text is not None:
        stdin.write(input_text)
        stdin.channel.shutdown_write()
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code != 0:
        raise RuntimeError(f"REMOTE_COMMAND_FAILED:{code}:{err[-2000:]}:{out[-1000:]}")
    return out


def ready(ssh: paramiko.SSHClient, port: int) -> str:
    try:
        return run(ssh, f"curl -sS -o /dev/null -w '%{{http_code}}' --max-time 10 http://127.0.0.1:{port}/ready", timeout=20).strip()
    except RuntimeError:
        return "000"


def main() -> None:
    evidence = json.loads(RELEASE.read_text(encoding="utf-8"))
    backup = evidence.get("backup")
    if not backup:
        raise RuntimeError("MISSING_BACKUP_FROM_INITIAL_RELEASE")
    ssh = connect()
    try:
        source_hash = run(ssh, f"sha256sum -- {shlex.quote(REMOTE_SOURCE)} | awk '{{print $1}}'").strip()
        backup_hash = run(ssh, f"sha256sum -- {shlex.quote(backup + '/upgrade.js')} | awk '{{print $1}}'").strip()
        if source_hash != CANDIDATE_HASH:
            raise RuntimeError(f"INSTALLED_SOURCE_MISMATCH:{source_hash}")
        if backup_hash != EXPECTED_PREIMAGE:
            raise RuntimeError(f"BACKUP_PREIMAGE_MISMATCH:{backup_hash}")
        pre_ready = {str(port): ready(ssh, port) for _, port in NODES}
        if any(code != "200" for code in pre_ready.values()):
            raise RuntimeError(f"PRE_READY_FAILED:{pre_ready}")
        restarts = []
        for name, port in NODES:
            run(ssh, f"pm2 restart {shlex.quote(name)}", timeout=120)
            deadline = time.time() + 90
            code = "000"
            while time.time() < deadline:
                code = ready(ssh, port)
                if code == "200":
                    break
                time.sleep(1)
            if code != "200":
                raise RuntimeError(f"READY_FAILED:{name}:{port}:{code}")
            restarts.append({"name": name, "port": port, "ready": code})
        run(ssh, f"install -d -m 700 -- {shlex.quote(REMOTE_TEMP)}")
        with ssh.open_sftp() as sftp:
            with sftp.open(REMOTE_TEMP + "/contract.js", "wb") as handle:
                handle.write(CONTRACT.encode("utf-8"))
        contract_raw = run(ssh, f"node {shlex.quote(REMOTE_TEMP + '/contract.js')}", timeout=120)
        contract_lines = [line.strip() for line in contract_raw.splitlines() if line.strip()]
        contract = json.loads(contract_lines[-1])
        post_pm2 = json.loads(run(ssh, "pm2 jlist"))
        wanted = {name for name, _ in NODES}
        processes = []
        for row in post_pm2:
            if row.get("name") not in wanted:
                continue
            env = (row.get("pm2_env") or {}).get("env") or {}
            processes.append({
                "name": row.get("name"), "pid": row.get("pid"),
                "status": (row.get("pm2_env") or {}).get("status"),
                "restartCount": (row.get("pm2_env") or {}).get("restart_time"),
                "forceUnlock": env.get("FORCE_UNLOCK_SYSTEM_IDS"),
            })
        evidence.update({
            "result": "PASS",
            "resumedAt": datetime.now(timezone.utc).isoformat(),
            "initialReadyPollFailure": True,
            "remoteSourceHash": source_hash,
            "backupHash": backup_hash,
            "preReadyAfterInitialRestart": pre_ready,
            "restarted": restarts,
            "postReady": {str(port): ready(ssh, port) for _, port in NODES},
            "postProcesses": processes,
            "contract": contract,
            "productionWrites": 0,
            "playerWrites": 0,
        })
        RELEASE.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({
            "result": "PASS", "backup": backup, "sourceHash": source_hash,
            "restarted": restarts, "contract": contract,
            "productionWrites": 0, "playerWrites": 0,
        }, ensure_ascii=False))
    finally:
        try:
            run(ssh, f"rm -f -- {shlex.quote(REMOTE_TEMP + '/contract.js')}", timeout=30)
        except Exception:
            pass
        ssh.close()


if __name__ == "__main__":
    main()

