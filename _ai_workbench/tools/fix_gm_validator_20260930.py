from __future__ import annotations

import ast
import datetime as dt
import hashlib
import posixpath
import shlex
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[2]
REMOTE = "/linhhoasu/webgame/gm/config.php"
EXPECTED_SHA = "649a073049c9449a12e2878f2773e569c17fe86d4f163a5e67ac5da559399c4a"


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def connection():
    tree = ast.parse((ROOT / "_ai_workbench/tools/vps_exec.py").read_text(encoding="utf-8-sig"))
    call = next(n for n in ast.walk(tree) if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) and n.func.attr == "connect")
    args = [ast.literal_eval(n) for n in call.args]
    kwargs = {n.arg: ast.literal_eval(n.value) for n in call.keywords}
    kwargs.update(timeout=20, banner_timeout=20, auth_timeout=20)
    return args, kwargs


def main():
    args, kwargs = connection()
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(*args, **kwargs)
    sftp = client.open_sftp()
    stamp = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_dir = f"/linhhoasu/_ai_workbench/backups/gm_large_amount_validator_{stamp}"

    def read(path):
        with sftp.open(path, "rb") as f:
            return f.read()

    def run(command):
        _, out, err = client.exec_command(command, timeout=60)
        stdout = out.read().decode("utf-8", "replace")
        stderr = err.read().decode("utf-8", "replace")
        return out.channel.recv_exit_status(), stdout, stderr

    try:
        original = read(REMOTE)
        if sha(original) != EXPECTED_SHA:
            raise RuntimeError(f"CAS_PRECONDITION_FAILED expected={EXPECTED_SHA} actual={sha(original)}")
        text = original.decode("utf-8-sig")
        old = "        if (!hk_reward_exists($id) || !gift_reward_amount_valid($id,$amount) || count($normalized) >= 20) { $error = 'Danh sách vật phẩm hoặc số lượng không hợp lệ.'; return false; }"
        new = "        if (!hk_reward_exists($id) || !gm_reward_amount_valid($id,$amount) || count($normalized) >= 20) { $error = 'Danh sách vật phẩm hoặc số lượng không hợp lệ.'; return false; }"
        if text.count(old) != 1:
            raise RuntimeError("GM_NORMALIZER_VALIDATOR_ANCHOR_DRIFT")
        candidate = text.replace(old, new, 1).encode("utf-8")
        run(f"install -d -m 700 -- {shlex.quote(backup_dir)}")
        backup = posixpath.join(backup_dir, "config.php")
        code, _, err = run(f"cp -p -- {shlex.quote(REMOTE)} {shlex.quote(backup)}")
        if code != 0 or sha(read(backup)) != sha(original):
            raise RuntimeError(f"BACKUP_VERIFY_FAILED {err[:500]}")
        temp = f"{REMOTE}.gm_validator_{stamp}.tmp"
        with sftp.open(temp, "wb") as f:
            f.write(candidate)
        sftp.chmod(temp, 0o640)
        if sha(read(temp)) != sha(candidate):
            raise RuntimeError("TEMP_VERIFY_FAILED")
        code, _, err = run(f"mv -f -- {shlex.quote(temp)} {shlex.quote(REMOTE)}")
        if code != 0:
            raise RuntimeError(f"REPLACE_FAILED {err[:500]}")
        if sha(read(REMOTE)) != sha(candidate):
            raise RuntimeError("POST_HASH_FAILED")
        code, out, err = run(f"php -l {shlex.quote(REMOTE)}")
        if code != 0:
            raise RuntimeError(f"PHP_LINT_FAILED {out} {err}")
        print(f"backup_dir={backup_dir}")
        print(f"pre_sha={sha(original)}")
        print(f"post_sha={sha(candidate)}")
        print("php_lint=PASS")
        print("gm_normalizer=gm_reward_amount_valid")
    finally:
        sftp.close()
        client.close()


if __name__ == "__main__":
    main()
