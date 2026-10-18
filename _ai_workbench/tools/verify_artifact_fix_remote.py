import getpass
import json

import paramiko


HOST = "103.116.105.154"
REMOTE_ARTIFACT = "/linhhoasu/lhs/newServer/src/handlers/artifact.js"
REMOTE_TEST = "/linhhoasu/_ai_workbench/temp/test_artifact_feature_contract_verify.js"
LOCAL_TEST = r"I:\Linhhoasu\server\server\_ai_workbench\tools\test_artifact_feature_contract.js"


def run(ssh, command, timeout=120):
    _stdin, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(error[-4000:] or output[-4000:])
    return output


def main():
    password = getpass.getpass("VPS password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False, timeout=15)
    try:
        sftp = ssh.open_sftp()
        try:
            sftp.put(LOCAL_TEST, REMOTE_TEST)
        finally:
            sftp.close()
        result = run(
            ssh,
            f"cd /linhhoasu/lhs/newServer && APP_ROOT=/linhhoasu/lhs/newServer ARTIFACT_HANDLER_PATH={REMOTE_ARTIFACT} node {REMOTE_TEST}",
        ).strip()
        print(result)
        print("ARTIFACT_HASH=" + run(ssh, f"sha256sum {REMOTE_ARTIFACT} | cut -d' ' -f1").strip())
        print("READY_HTTP=" + run(ssh, "curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ready").strip())
        print("WS_9200=" + run(ssh, "ss -lnt | grep -q ':9200 ' && echo listening").strip())
        print("RUNTIME_ERRORS=" + run(ssh, "tail -n 160 /root/.pm2/logs/lhs-s1001-error.log 2>/dev/null | grep -E 'SyntaxError|ReferenceError|TypeError|Artifact' | tail -n 20 || true").strip())
    finally:
        try:
            run(ssh, f"rm -f -- {REMOTE_TEST}")
        except Exception:
            pass
        ssh.close()


if __name__ == "__main__":
    main()
