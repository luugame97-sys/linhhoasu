from __future__ import annotations

import datetime as dt
import hashlib
import json
import shlex
from pathlib import Path

import paramiko

from rollback_role_lian_manifest_20260930 import ssh_config


ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "_ai_workbench" / "temp" / "gem10_release_20261002"
REMOTE_INDEX = "/linhhoasu/webgame/game/index.html"
REMOTE_QUICK = "/linhhoasu/webgame/game/js/lhs-gem-quick100-v1.js"
LOCAL_INDEX = ROOT / "_ai_workbench" / "temp" / "gem10_candidate_20261002" / "client" / "index.html"
LOCAL_QUICK = ROOT / "_ai_workbench" / "temp" / "gem10_candidate_20261002" / "client" / "lhs-gem-quick100-v1.js"
EXPECTED_BEFORE = {
    REMOTE_INDEX: "97521aade696fc2256743cd158f626f62076596e255eea03c511ca498b58fe34",
    REMOTE_QUICK: "f828aa08d9a87579307e711314f74db1fcee1c164bd20cb171ba3a6cebf9f1ff",
}
TOKEN = "20261002_gem_quick100_v3"


def sha_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def q(value: str) -> str:
    return shlex.quote(value)


def main() -> None:
    local = {
        REMOTE_INDEX: LOCAL_INDEX.read_bytes(),
        REMOTE_QUICK: LOCAL_QUICK.read_bytes(),
    }
    after = {path: sha_bytes(data) for path, data in local.items()}
    assert TOKEN.encode("ascii") in local[REMOTE_INDEX]
    assert "Hợp thành hết (".encode("utf-8") in local[REMOTE_QUICK]
    assert b"sendSpecialCompose(id, count, true)" in local[REMOTE_QUICK]

    args, kwargs = ssh_config()
    assert args[0] == "103.116.104.165"
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(*args, **kwargs)
    sftp = client.open_sftp()
    stamp = dt.datetime.now(dt.timezone(dt.timedelta(hours=7))).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/gem_special_batch_{stamp}"
    stages = {path: f"{path}.stage_{stamp}" for path in local}
    swapped: list[str] = []
    receipt = {
        "at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "backupDir": backup,
        "directPlayerWrites": 0,
        "pm2Restart": False,
        "files": {
            path: {"before": EXPECTED_BEFORE[path], "after": after[path]} for path in local
        },
        "result": "STARTED",
    }

    def run(command: str, timeout: int = 40) -> bytes:
        _, stdout, stderr = client.exec_command(command, timeout=timeout)
        output = stdout.read()
        error = stderr.read()
        code = stdout.channel.recv_exit_status()
        if code:
            raise RuntimeError(f"COMMAND_FAILED:{code}:{error.decode('utf-8', 'replace')[-700:]}")
        return output

    def remote_hash(path: str) -> str | None:
        try:
            with sftp.open(path, "rb") as handle:
                return sha_bytes(handle.read())
        except FileNotFoundError:
            return None

    def served(path: str) -> dict[str, str]:
        rel = "/index.html" if path == REMOTE_INDEX else "/js/lhs-gem-quick100-v1.js"
        result: dict[str, str] = {}
        for name, base in (
            ("loopback", "http://127.0.0.1:81"),
            ("public", "https://linhhoasu.lol"),
        ):
            result[name] = sha_bytes(run(f"curl --compressed --max-time 20 -fsS {q(base + rel + '?v=' + TOKEN)}", 25))
        return result

    try:
        for path, expected in EXPECTED_BEFORE.items():
            actual = remote_hash(path)
            if actual != expected:
                raise RuntimeError(f"CAS_MISMATCH:{path}:{actual}:{expected}")

        run(f"mkdir -m 700 -- {q(backup)}")
        for path in local:
            backup_path = f"{backup}/{Path(path).name}"
            run(f"cp -p -- {q(path)} {q(backup_path)}")
            if remote_hash(backup_path) != EXPECTED_BEFORE[path]:
                raise RuntimeError(f"BACKUP_VERIFY_FAILED:{path}")

        for path, data in local.items():
            with sftp.open(stages[path], "wb") as handle:
                handle.write(data)
            sftp.chmod(stages[path], 0o644)
            if remote_hash(stages[path]) != after[path]:
                raise RuntimeError(f"STAGE_VERIFY_FAILED:{path}")

        # Swap the script first and index second. If the second swap fails,
        # the rollback below restores both preimages from the verified backup.
        sftp.posix_rename(stages[REMOTE_QUICK], REMOTE_QUICK)
        swapped.append(REMOTE_QUICK)
        if remote_hash(REMOTE_QUICK) != after[REMOTE_QUICK]:
            raise RuntimeError(f"POST_SWAP_VERIFY_FAILED:{REMOTE_QUICK}")
        receipt["servedQuick"] = served(REMOTE_QUICK)
        if any(value != after[REMOTE_QUICK] for value in receipt["servedQuick"].values()):
            raise RuntimeError(f"SERVED_VERIFY_FAILED:{REMOTE_QUICK}")

        sftp.posix_rename(stages[REMOTE_INDEX], REMOTE_INDEX)
        swapped.append(REMOTE_INDEX)
        if remote_hash(REMOTE_INDEX) != after[REMOTE_INDEX]:
            raise RuntimeError(f"POST_SWAP_VERIFY_FAILED:{REMOTE_INDEX}")
        receipt["servedIndex"] = served(REMOTE_INDEX)
        if any(value != after[REMOTE_INDEX] for value in receipt["servedIndex"].values()):
            raise RuntimeError(f"SERVED_VERIFY_FAILED:{REMOTE_INDEX}")

        receipt.update(
            {
                "result": "DEPLOYED_VERIFIED",
                "completedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
                "rollback": "available",
            }
        )
    except Exception as exc:
        receipt["result"] = "FAILED"
        receipt["error"] = str(exc)
        rollback_errors: list[str] = []
        for path in reversed(swapped):
            backup_path = f"{backup}/{Path(path).name}"
            rollback_stage = f"{path}.rollback_{stamp}"
            try:
                run(f"cp -p -- {q(backup_path)} {q(rollback_stage)}")
                sftp.posix_rename(rollback_stage, path)
            except Exception:
                rollback_errors.append(path)
        receipt["rollback"] = "restored" if not rollback_errors else "needs_attention"
        if rollback_errors:
            receipt["rollbackErrors"] = rollback_errors
        raise
    finally:
        OUT.mkdir(parents=True, exist_ok=True)
        (OUT / "special_batch_deployment.json").write_text(
            json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        for stage in stages.values():
            try:
                sftp.remove(stage)
            except FileNotFoundError:
                pass
        sftp.close()
        client.close()
        print(json.dumps(receipt, ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    main()
