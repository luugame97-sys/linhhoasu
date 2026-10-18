"""Deploy the full VUSA client asset tree to the isolated test VPS.

The local hybrid index/login routes stay authoritative. Only files captured in
the immutable VUSA manifest are compared and installed. Production is never a
valid target for this tool.
"""
from __future__ import annotations

import getpass
import hashlib
import json
import posixpath
import shlex
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

import paramiko


HOST = "192.168.200.151"
ROOT = Path(__file__).resolve().parents[2]
REFERENCE = ROOT / "_ai_workbench/temp/tutien_vusa_reference_20260831_214348"
REFERENCE_RAW = REFERENCE / "raw"
REFERENCE_MANIFEST = REFERENCE / "manifest.json"
LOCAL_GAME_FALLBACK = ROOT / "linhhoasu/webgame/game"
HYBRID = ROOT / "_ai_workbench/temp/vusa_hybrid_test_candidate_20260831_164048/linhhoasu/webgame/game"
REMOTE_ROOT = "/linhhoasu/webgame/game"
REMOTE_WORK = "/linhhoasu/_ai_workbench/temp"
REMOTE_BACKUPS = "/linhhoasu/_ai_workbench/backups"
EXCLUDED = {"favicon.ico", "index.html", "register.html"}


def q(value: str) -> str:
    return shlex.quote(value)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def run(
    ssh: paramiko.SSHClient,
    command: str,
    *,
    timeout: int = 120,
    check: bool = True,
) -> str:
    _, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if check and code:
        raise RuntimeError(err[-6000:] or out[-6000:] or f"remote exit {code}")
    return out


def validate_relative(value: str) -> str:
    path = PurePosixPath(value)
    if not value or path.is_absolute() or ".." in path.parts or "\n" in value or "\r" in value:
        raise ValueError(f"unsafe manifest path: {value!r}")
    return path.as_posix()


def load_reference() -> list[dict]:
    payload = json.loads(REFERENCE_MANIFEST.read_text(encoding="utf-8"))
    rows: list[dict] = []
    seen: set[str] = set()
    for raw in payload.get("files") or []:
        if raw.get("status") != 200 or not raw.get("sha256"):
            continue
        relative = validate_relative(str(raw.get("path") or ""))
        if relative in EXCLUDED:
            continue
        if relative in seen:
            raise RuntimeError(f"duplicate reference path: {relative}")
        size = int(raw.get("bytes") or 0)
        local = REFERENCE_RAW / Path(*PurePosixPath(relative).parts)
        if not local.is_file():
            fallback = LOCAL_GAME_FALLBACK / Path(*PurePosixPath(relative).parts)
            if (
                fallback.is_file()
                and fallback.stat().st_size == size
                and sha256_file(fallback) == str(raw["sha256"]).lower()
            ):
                local = fallback
            else:
                raise FileNotFoundError(local)
        if local.stat().st_size != size:
            raise RuntimeError(f"reference size mismatch: {relative}")
        rows.append({
            "path": relative,
            "sha256": str(raw["sha256"]).lower(),
            "bytes": size,
            "local": str(local),
        })
        seen.add(relative)
    if len(rows) < 44000:
        raise RuntimeError(f"reference inventory unexpectedly small: {len(rows)}")
    return rows


def write_remote_text(sftp: paramiko.SFTPClient, path: str, content: str) -> None:
    with sftp.open(path, "wb") as handle:
        handle.write(content.encode("utf-8"))


def remote_sha(ssh: paramiko.SSHClient, path: str) -> str | None:
    output = run(
        ssh,
        f"if [ -f {q(path)} ]; then sha256sum -- {q(path)} | awk '{{print $1}}'; else echo MISSING; fi",
    ).strip()
    return None if output == "MISSING" else output.lower()


def main() -> None:
    rows = load_reference()
    by_path = {row["path"]: row for row in rows}
    hybrid_index = HYBRID / "index.html"
    if not hybrid_index.is_file():
        raise FileNotFoundError(hybrid_index)
    expected_index = sha256_file(hybrid_index)

    password = getpass.getpass("Test VPS password (not logged): ")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    work = f"{REMOTE_WORK}/vusa_full_client_{stamp}"
    stage = f"{work}/stage"
    paths_file = f"{work}/paths.txt"
    inventory_file = f"{work}/inventory.tsv"
    mismatch_file = f"{work}/mismatch.txt"
    existing_file = f"{work}/existing.txt"
    missing_file = f"{work}/missing.txt"
    backup = f"{REMOTE_BACKUPS}/vusa_full_client_pre_{stamp}"
    installed = False

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(
        HOST,
        username="root",
        password=password,
        look_for_keys=False,
        allow_agent=False,
        timeout=20,
        banner_timeout=20,
        auth_timeout=20,
    )
    try:
        if remote_sha(ssh, f"{REMOTE_ROOT}/index.html") != expected_index:
            raise RuntimeError("test hybrid index precondition changed")
        run(ssh, f"set -eu; mkdir -p {q(work)} {q(stage)} {q(backup)}")

        sftp = ssh.open_sftp()
        try:
            write_remote_text(sftp, paths_file, "\n".join(by_path) + "\n")
        finally:
            sftp.close()

        print(f"[1/6] Hashing {len(rows)} files on test VPS...", flush=True)
        inventory_command = f"""set -eu
cd {q(REMOTE_ROOT)}
: > {q(inventory_file)}
while IFS= read -r rel; do
  if [ -f \"$rel\" ]; then
    hash=$(sha256sum -- \"$rel\" | awk '{{print $1}}')
    size=$(stat -c '%s' -- \"$rel\")
    printf '%s|%s|%s\\n' \"$hash\" \"$size\" \"$rel\" >> {q(inventory_file)}
  else
    printf 'MISSING|0|%s\\n' \"$rel\" >> {q(inventory_file)}
  fi
done < {q(paths_file)}
wc -l < {q(inventory_file)}
"""
        count = int(run(ssh, inventory_command, timeout=1800).strip())
        if count != len(rows):
            raise RuntimeError(f"remote inventory incomplete: {count}/{len(rows)}")

        sftp = ssh.open_sftp()
        try:
            with sftp.open(inventory_file, "rb") as handle:
                inventory_text = handle.read().decode("utf-8", "strict")
        finally:
            sftp.close()

        remote: dict[str, tuple[str, int]] = {}
        for line in inventory_text.splitlines():
            digest, size_text, relative = line.split("|", 2)
            remote[validate_relative(relative)] = (digest.lower(), int(size_text))
        if set(remote) != set(by_path):
            raise RuntimeError("remote inventory path set mismatch")

        mismatch = [
            relative
            for relative, expected in by_path.items()
            if remote[relative][0] != expected["sha256"] or remote[relative][1] != expected["bytes"]
        ]
        existing = [relative for relative in mismatch if remote[relative][0] != "missing"]
        missing = [relative for relative in mismatch if remote[relative][0] == "missing"]
        delta_bytes = sum(by_path[relative]["bytes"] for relative in mismatch)
        backup_bytes = sum(remote[relative][1] for relative in existing)
        print(
            f"[2/6] Delta: {len(mismatch)} files, {delta_bytes} bytes; "
            f"overwrite={len(existing)}, new={len(missing)}",
            flush=True,
        )

        if not mismatch:
            print(json.dumps({
                "result": "already_current",
                "host": HOST,
                "referenceFiles": len(rows),
                "indexPreserved": True,
                "indexSha256": expected_index,
            }, ensure_ascii=False, indent=2))
            return

        free_bytes = int(run(ssh, f"df -PB1 {q(REMOTE_ROOT)} | awk 'NR==2 {{print $4}}'").strip())
        required = delta_bytes + backup_bytes + 512 * 1024 * 1024
        if free_bytes < required:
            raise RuntimeError(f"insufficient test VPS disk: free={free_bytes}, required={required}")

        print("[3/6] Validating local VUSA delta hashes...", flush=True)
        for index, relative in enumerate(mismatch, 1):
            local = Path(by_path[relative]["local"])
            if sha256_file(local) != by_path[relative]["sha256"]:
                raise RuntimeError(f"local reference hash mismatch: {relative}")
            if index % 500 == 0:
                print(f"  validated {index}/{len(mismatch)}", flush=True)

        sftp = ssh.open_sftp()
        try:
            write_remote_text(sftp, mismatch_file, "\n".join(mismatch) + "\n")
            write_remote_text(sftp, existing_file, ("\n".join(existing) + "\n") if existing else "")
            write_remote_text(sftp, missing_file, ("\n".join(missing) + "\n") if missing else "")
        finally:
            sftp.close()

        run(
            ssh,
            f"set -eu; if [ -s {q(existing_file)} ]; then "
            f"tar -C {q(REMOTE_ROOT)} -cf {q(backup + '/overwritten.tar')} -T {q(existing_file)}; "
            f"else tar -cf {q(backup + '/overwritten.tar')} --files-from /dev/null; fi; "
            f"cp -p {q(existing_file)} {q(missing_file)} {q(mismatch_file)} {q(backup + '/')} ; "
            f"sha256sum {q(backup + '/overwritten.tar')} > {q(backup + '/overwritten.tar.sha256')}",
            timeout=1200,
        )

        print("[4/6] Uploading VUSA delta to isolated stage...", flush=True)
        sftp = ssh.open_sftp()
        try:
            uploaded = 0
            for index, relative in enumerate(mismatch, 1):
                local = Path(by_path[relative]["local"])
                target = posixpath.join(stage, relative)
                run(ssh, f"mkdir -p {q(posixpath.dirname(target))}")
                sftp.put(str(local), target)
                uploaded += local.stat().st_size
                if index % 250 == 0 or index == len(mismatch):
                    print(f"  uploaded {index}/{len(mismatch)} files ({uploaded} bytes)", flush=True)
        finally:
            sftp.close()

        verify_stage = f"""set -eu
while IFS= read -r rel; do
  sha256sum -- {q(stage)}/\"$rel\"
done < {q(mismatch_file)}
"""
        stage_hashes = run(ssh, verify_stage, timeout=1800).splitlines()
        if len(stage_hashes) != len(mismatch):
            raise RuntimeError("staged hash list incomplete")
        for relative, line in zip(mismatch, stage_hashes):
            if line.split(None, 1)[0].lower() != by_path[relative]["sha256"]:
                raise RuntimeError(f"staged hash mismatch: {relative}")

        print("[5/6] Installing verified delta (index/login preserved)...", flush=True)
        run(ssh, f"set -eu; cp -a {q(stage + '/.')} {q(REMOTE_ROOT + '/')}", timeout=1800)
        installed = True

        verify_live = f"""set -eu
cd {q(REMOTE_ROOT)}
while IFS= read -r rel; do
  sha256sum -- \"$rel\"
done < {q(mismatch_file)}
"""
        live_hashes = run(ssh, verify_live, timeout=1800).splitlines()
        if len(live_hashes) != len(mismatch):
            raise RuntimeError("installed hash list incomplete")
        for relative, line in zip(mismatch, live_hashes):
            if line.split(None, 1)[0].lower() != by_path[relative]["sha256"]:
                raise RuntimeError(f"installed hash mismatch: {relative}")
        if remote_sha(ssh, f"{REMOTE_ROOT}/index.html") != expected_index:
            raise RuntimeError("hybrid index changed during full overlay")

        ready = run(
            ssh,
            "curl -sS -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:8080/ready",
        ).strip()
        sample_urls = [
            "/js/egret.min_vi_45030898.js",
            "/js/main.min_vi_1e47377c.js",
            "/update/resource/default.res_326514c1.bin",
            "/update/resource/assets/cfg/gameEui_18e11b8e.bin",
            "/update/resource/assets/excel/config_e5ac72c2.bin",
        ]
        http_rows = []
        for url in sample_urls:
            result = run(
                ssh,
                "curl -sS -o /dev/null -w '%{http_code}|%{size_download}' --max-time 30 "
                + q("http://127.0.0.1:81" + url),
            ).strip()
            http_rows.append({"url": url, "result": result})
        print("[6/6] Full VUSA overlay verified on test VPS.", flush=True)
        print(json.dumps({
            "result": "ok",
            "host": HOST,
            "referenceFiles": len(rows),
            "changedFiles": len(mismatch),
            "changedBytes": delta_bytes,
            "overwrittenFiles": len(existing),
            "newFiles": len(missing),
            "backup": backup,
            "indexPreserved": True,
            "indexSha256": expected_index,
            "ready": ready,
            "http": http_rows,
        }, ensure_ascii=False, indent=2))
    except Exception:
        if installed:
            try:
                rollback = f"""set -eu
if [ -s {q(missing_file)} ]; then
  cd {q(REMOTE_ROOT)}
  while IFS= read -r rel; do rm -f -- \"$rel\"; done < {q(missing_file)}
fi
tar -C {q(REMOTE_ROOT)} -xf {q(backup + '/overwritten.tar')}
"""
                run(ssh, rollback, timeout=1800)
                print("ROLLBACK=completed", flush=True)
            except Exception as rollback_error:
                print(f"ROLLBACK_ERROR={rollback_error}", flush=True)
        raise
    finally:
        try:
            if ssh.get_transport() and ssh.get_transport().is_active():
                run(ssh, f"rm -rf -- {q(work)}", timeout=300, check=False)
        finally:
            ssh.close()


if __name__ == "__main__":
    main()
