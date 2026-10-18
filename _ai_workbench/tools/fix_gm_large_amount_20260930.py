from __future__ import annotations

import ast
import datetime as dt
import hashlib
import posixpath
import shlex
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[2]
REMOTE_CONFIG = "/linhhoasu/webgame/gm/config.php"
REMOTE_INDEX = "/linhhoasu/webgame/gm/index.php"
REMOTE_ADMIN_INDEX = "/linhhoasu/webgame/gm/admin/index.php"
EXPECTED_CONFIG_SHA = "9099d0f09dd45d9a71a6fa68d16c4173fb43e24b98db72ac45bb422ecbb3e7c3"
EXPECTED_INDEX_SHA = "4ba1dfea9b35f48607010db1ebde855461e3d87ea8d45d0d04d06e69827f9665"
EXPECTED_ADMIN_INDEX_SHA = "80c92e7ffa14e03f108995667e5a64c2d0a9f2d9649b3e4a91804b3ecc93be5a"


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def ssh_connection() -> tuple[list[object], dict[str, object]]:
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


def patch_config(original: str) -> str:
    old_limit = "function gift_reward_amount_limit($id) { $id=(int)$id; return in_array($id,array(1,2,6,60,61),true)?1000000000:999999; }"
    new_limit = "function gift_reward_amount_limit($id) { $id=(int)$id; return in_array($id,array(1,2,6,60,61),true)?1000000000:999999; }\nfunction gm_reward_amount_limit($id) { return 1000000000; }\nfunction gm_reward_amount_valid($id,$amount) { $amount=(int)$amount; return $amount>0 && $amount<=gm_reward_amount_limit($id); }"
    if original.count(old_limit) != 1:
        raise RuntimeError("CONFIG_LIMIT_ANCHOR_DRIFT")
    text = original.replace(old_limit, new_limit, 1)
    old_validator = "        $valid_amount = $validation_scope === 'donate' ? donate_reward_amount_valid($id,$amount) : gift_reward_amount_valid($id,$amount);"
    new_validator = "        $valid_amount = $validation_scope === 'donate' ? donate_reward_amount_valid($id,$amount) : ($validation_scope === 'gm' ? gm_reward_amount_valid($id,$amount) : gift_reward_amount_valid($id,$amount));"
    if text.count(old_validator) != 1:
        raise RuntimeError("CONFIG_VALIDATOR_ANCHOR_DRIFT")
    text = text.replace(old_validator, new_validator, 1)
    old_admin_sig = "function vht6ur_sdk_admin_send_items($roleId, $worldId, $items, &$error = '') {"
    new_admin_sig = "function vht6ur_sdk_admin_send_items($roleId, $worldId, $items, &$error = '', $validation_scope = 'gift') {"
    if text.count(old_admin_sig) != 1:
        raise RuntimeError("CONFIG_ADMIN_SIG_ANCHOR_DRIFT")
    text = text.replace(old_admin_sig, new_admin_sig, 1)
    old_admin_call = "    return lhs_mail_items((string)$worldId, $roleId, 'GM Linh Họa Sư', 'Quà GM gửi qua hệ thống.', $items, $error);"
    new_admin_call = "    return lhs_mail_items((string)$worldId, $roleId, 'GM Linh Họa Sư', 'Quà GM gửi qua hệ thống.', $items, $error, '', $validation_scope);"
    if text.count(old_admin_call) != 1:
        raise RuntimeError("CONFIG_ADMIN_CALL_ANCHOR_DRIFT")
    text = text.replace(old_admin_call, new_admin_call, 1)
    old_admin_dispatch = "if (current_session_is_admin()) return vht6ur_sdk_admin_send_items((string)$role_id, (string)$server_id, $normalized, $error);"
    new_admin_dispatch = "if (current_session_is_admin()) return vht6ur_sdk_admin_send_items((string)$role_id, (string)$server_id, $normalized, $error, 'gm');"
    if text.count(old_admin_dispatch) != 1:
        raise RuntimeError("CONFIG_GM_ADMIN_DISPATCH_ANCHOR_DRIFT")
    text = text.replace(old_admin_dispatch, new_admin_dispatch, 1)
    old_web_dispatch = "return vht6ur_sdk_web_send_items((string)$role_id, gm_role_name($role), (string)$server_id, $normalized, $error);"
    new_web_dispatch = "return vht6ur_sdk_web_send_items((string)$role_id, gm_role_name($role), (string)$server_id, $normalized, $error, 'Linh Họa Sư', 'Bạn có vật phẩm mới, vui lòng kiểm tra thư.', '', 'gm');"
    if text.count(old_web_dispatch) != 1:
        raise RuntimeError("CONFIG_GM_WEB_DISPATCH_ANCHOR_DRIFT")
    text = text.replace(old_web_dispatch, new_web_dispatch, 1)
    return text


def patch_input(original: str) -> str:
    old = '<input type="number" name="amount" id="gm_item_amount" class="form-control" value="1" min="1" required>'
    new = '<input type="number" name="amount" id="gm_item_amount" class="form-control" value="1" min="1" max="1000000000" step="1" required>'
    if original.count(old) != 1:
        raise RuntimeError("GM_INPUT_ANCHOR_DRIFT")
    return original.replace(old, new, 1)


def main() -> None:
    args, kwargs = ssh_connection()
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(*args, **kwargs)
    sftp = client.open_sftp()
    stamp = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_dir = f"/linhhoasu/_ai_workbench/backups/gm_large_amount_{stamp}"
    local_report = ROOT / "_ai_workbench/temp/gm_large_amount_20260930"
    local_report.mkdir(parents=True, exist_ok=True)

    def read(path: str) -> bytes:
        with sftp.open(path, "rb") as f:
            return f.read()

    def run(command: str) -> tuple[int, str, str]:
        _, out, err = client.exec_command(command, timeout=60)
        stdout = out.read().decode("utf-8", "replace")
        stderr = err.read().decode("utf-8", "replace")
        return out.channel.recv_exit_status(), stdout, stderr

    try:
        originals = {
            REMOTE_CONFIG: read(REMOTE_CONFIG),
            REMOTE_INDEX: read(REMOTE_INDEX),
            REMOTE_ADMIN_INDEX: read(REMOTE_ADMIN_INDEX),
        }
        expected = {
            REMOTE_CONFIG: EXPECTED_CONFIG_SHA,
            REMOTE_INDEX: EXPECTED_INDEX_SHA,
            REMOTE_ADMIN_INDEX: EXPECTED_ADMIN_INDEX_SHA,
        }
        actual = {path: sha(data) for path, data in originals.items()}
        for path, expected_sha in expected.items():
            if actual[path] != expected_sha:
                raise RuntimeError(f"CAS_PRECONDITION_FAILED {path} expected={expected_sha} actual={actual[path]}")

        candidates = {
            REMOTE_CONFIG: patch_config(originals[REMOTE_CONFIG].decode("utf-8-sig" )).encode("utf-8"),
            REMOTE_INDEX: patch_input(originals[REMOTE_INDEX].decode("utf-8-sig")).encode("utf-8"),
            REMOTE_ADMIN_INDEX: patch_input(originals[REMOTE_ADMIN_INDEX].decode("utf-8-sig")).encode("utf-8"),
        }
        run(f"install -d -m 700 -- {shlex.quote(backup_dir)}")
        for path, data in originals.items():
            backup = posixpath.join(backup_dir, posixpath.basename(path))
            code, _, err = run(f"cp -p -- {shlex.quote(path)} {shlex.quote(backup)}")
            if code != 0:
                raise RuntimeError(f"BACKUP_FAILED {path}: {err[:500]}")
            if sha(read(backup)) != actual[path]:
                raise RuntimeError(f"BACKUP_VERIFY_FAILED {path}")

        temp_paths = {}
        for path, data in candidates.items():
            temp = f"{path}.gm_large_{stamp}.tmp"
            temp_paths[path] = temp
            with sftp.open(temp, "wb") as f:
                f.write(data)
            sftp.chmod(temp, 0o640)
            if sha(read(temp)) != sha(data):
                raise RuntimeError(f"TEMP_VERIFY_FAILED {path}")

        for path, temp in temp_paths.items():
            code, _, err = run(f"mv -f -- {shlex.quote(temp)} {shlex.quote(path)}")
            if code != 0:
                raise RuntimeError(f"REPLACE_FAILED {path}: {err[:500]}")

        for path, data in candidates.items():
            if sha(read(path)) != sha(data):
                raise RuntimeError(f"POST_HASH_FAILED {path}")
        code, out, err = run(f"php -l {shlex.quote(REMOTE_CONFIG)}")
        if code != 0:
            raise RuntimeError(f"PHP_LINT_FAILED config: {out} {err}")
        for path in (REMOTE_INDEX, REMOTE_ADMIN_INDEX):
            code, out, err = run(f"php -l {shlex.quote(path)}")
            if code != 0:
                raise RuntimeError(f"PHP_LINT_FAILED {path}: {out} {err}")

        (local_report / "receipt.txt").write_text(
            "\n".join([
                f"backup_dir={backup_dir}",
                f"config_pre_sha={actual[REMOTE_CONFIG]}",
                f"config_post_sha={sha(candidates[REMOTE_CONFIG])}",
                f"index_pre_sha={actual[REMOTE_INDEX]}",
                f"index_post_sha={sha(candidates[REMOTE_INDEX])}",
                f"admin_index_pre_sha={actual[REMOTE_ADMIN_INDEX]}",
                f"admin_index_post_sha={sha(candidates[REMOTE_ADMIN_INDEX])}",
                "php_lint=PASS",
                "scope=GM mail only; giftcode/donate validators unchanged",
            ]) + "\n",
            encoding="utf-8",
        )
        print((local_report / "receipt.txt").read_text(encoding="utf-8"), end="")
    finally:
        sftp.close()
        client.close()


if __name__ == "__main__":
    main()
