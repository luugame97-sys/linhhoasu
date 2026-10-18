from __future__ import annotations

import ast
import datetime as dt
import hashlib
import json
import posixpath
import shlex
import sys
import time
from pathlib import Path

import paramiko

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


ROOT = Path(__file__).resolve().parents[2]
REMOTE_FILE = "/linhhoasu/webgame/gm/assets/item/gmitem.txt"
EXPECTED_PRE_SHA = "f23dbfd746ca9d075b667a921eec3f063527d447c05cf237342af5e5dc398fe1"
ENTRIES = [
    (810101, "Hỗn Độn Thánh Kỳ Lân"),
    (810201, "Hỗn Độn Bắc Minh Huyền Vũ"),
    (810301, "Hỗn Độn Hạo Thiên Thần Khuyển"),
    (810401, "Hỗn Độn Nam Minh Chu Tước"),
    (810501, "Hỗn Độn Địa Tạng Đế Thính"),
    (90018, "Rương Tinh Linh Hỗn Độn Tự Chọn"),
]


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def ssh_args() -> tuple[list[object], dict[str, object]]:
    tree = ast.parse((ROOT / "_ai_workbench/tools/vps_exec.py").read_text(encoding="utf-8-sig"))
    call = next(
        node for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr == "connect"
    )
    args = [ast.literal_eval(node) for node in call.args]
    kwargs = {node.arg: ast.literal_eval(node.value) for node in call.keywords}
    kwargs.update(timeout=20, banner_timeout=20, auth_timeout=20)
    return args, kwargs


def main() -> None:
    args, kwargs = ssh_args()
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(*args, **kwargs)
    sftp = client.open_sftp()
    backup_dir = f"/linhhoasu/_ai_workbench/backups/gmitem_chaos_20260930_{dt.datetime.now().strftime('%Y%m%d_%H%M%S')}"
    temp_path = f"{REMOTE_FILE}.chaos_{int(time.time())}.tmp"
    local_report_dir = ROOT / "_ai_workbench/temp/gmitem_chaos_deploy_20260930"
    local_report_dir.mkdir(parents=True, exist_ok=True)

    def run(command: str, check: bool = True) -> str:
        _, stdout, stderr = client.exec_command(command, timeout=45)
        out = stdout.read().decode("utf-8", "replace")
        err = stderr.read().decode("utf-8", "replace")
        code = stdout.channel.recv_exit_status()
        if check and code != 0:
            raise RuntimeError(f"remote command failed ({code}): {command}\n{err[:1000]}")
        return out

    def read_remote(path: str) -> bytes:
        with sftp.open(path, "rb") as stream:
            return stream.read()

    try:
        original = read_remote(REMOTE_FILE)
        pre_sha = sha256(original)
        if pre_sha != EXPECTED_PRE_SHA:
            raise RuntimeError(f"CAS_PRECONDITION_FAILED expected={EXPECTED_PRE_SHA} actual={pre_sha}")

        text = original.decode("utf-8-sig")
        ids = set()
        for line in text.splitlines():
            raw_id = line.split(";", 1)[0].strip()
            if raw_id.isdigit():
                ids.add(int(raw_id))
        duplicates = [item_id for item_id, _ in ENTRIES if item_id in ids]
        if duplicates:
            raise RuntimeError(f"TARGET_IDS_ALREADY_PRESENT:{duplicates}")

        newline = "\r\n" if "\r\n" in text else "\n"
        if not text.endswith(("\n", "\r")):
            text += newline
        text += newline.join(f"{item_id};{name}" for item_id, name in ENTRIES) + newline
        candidate = text.encode("utf-8")
        candidate_sha = sha256(candidate)

        run(f"install -d -m 700 -- {shlex.quote(backup_dir)}")
        backup_path = f"{backup_dir}/gmitem.txt"
        run(f"cp -p -- {shlex.quote(REMOTE_FILE)} {shlex.quote(backup_path)}")
        backup_sha = sha256(read_remote(backup_path))
        if backup_sha != pre_sha:
            raise RuntimeError(f"BACKUP_HASH_MISMATCH:{backup_sha}")

        sftp.putfo(__import__("io").BytesIO(candidate), temp_path)
        run(f"chmod 644 -- {shlex.quote(temp_path)}")
        staged_sha = sha256(read_remote(temp_path))
        if staged_sha != candidate_sha:
            raise RuntimeError(f"STAGED_HASH_MISMATCH:{staged_sha}")

        # Second CAS immediately before the atomic same-directory swap.
        current_sha = sha256(read_remote(REMOTE_FILE))
        if current_sha != pre_sha:
            raise RuntimeError(f"CAS_BEFORE_SWAP_FAILED:{current_sha}")
        run(f"mv -f -- {shlex.quote(temp_path)} {shlex.quote(REMOTE_FILE)}")

        post = read_remote(REMOTE_FILE)
        post_sha = sha256(post)
        if post_sha != candidate_sha:
            raise RuntimeError(f"POST_SWAP_HASH_MISMATCH:{post_sha}")
        post_text = post.decode("utf-8-sig")
        rows = []
        for item_id, name in ENTRIES:
            matches = [line for line in post_text.splitlines() if line.startswith(f"{item_id};")]
            rows.append({"id": item_id, "expected": name, "matches": matches})
        if any(len(row["matches"]) != 1 or row["matches"][0] != f"{row['id']};{row['expected']}" for row in rows):
            raise RuntimeError(f"READBACK_ENTRY_MISMATCH:{rows}")

        php_source = "require '/linhhoasu/webgame/gm/config.php';$m=vht6ur_item_catalog();$ids=[810101,810201,810301,810401,810501,90018];$o=[];foreach($ids as $id)$o[]=['id'=>$id,'allowed'=>isset($m[$id]),'name'=>$m[$id]??null];echo json_encode(['catalog_count'=>count($m),'rows'=>$o],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),\"\\n\";"
        import base64
        encoded = base64.b64encode(php_source.encode()).decode()
        output = run("php -r " + shlex.quote(f'eval(base64_decode("{encoded}"));'))
        php_readback = None
        for line in reversed(output.splitlines()):
            try:
                php_readback = json.loads(line)
                break
            except json.JSONDecodeError:
                continue
        if not php_readback or not all(row.get("allowed") is True for row in php_readback.get("rows", [])):
            raise RuntimeError(f"PHP_WHITELIST_READBACK_FAILED:{output[-1000:]}")

        report = {
            "result": "DEPLOYED",
            "remoteFile": REMOTE_FILE,
            "backupDir": backup_dir,
            "preSha256": pre_sha,
            "postSha256": post_sha,
            "bytesBefore": len(original),
            "bytesAfter": len(post),
            "entries": ENTRIES,
            "entryReadback": rows,
            "phpWhitelistReadback": php_readback,
            "productionWrites": 1,
            "playerWrites": 0,
            "restart": False,
            "at": dt.datetime.now(dt.timezone.utc).isoformat(),
        }
        (local_report_dir / "deployment.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(report, ensure_ascii=False, indent=2))
    except Exception:
        run(f"rm -f -- {shlex.quote(temp_path)}", check=False)
        raise
    finally:
        sftp.close()
        client.close()


if __name__ == "__main__":
    main()
