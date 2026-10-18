"""Read-only inventory for the production client hit-route promotion check.

The password is accepted through LHS_PROD_PASSWORD or an interactive prompt.
It is never printed or persisted by this tool.
"""
from __future__ import annotations

import getpass
import hashlib
import json
import os
import re
import shlex
from typing import Any

import paramiko


HOST = "103.116.105.154"
INDEX = "/linhhoasu/webgame/game/index.html"
WEB_ROOT = "/linhhoasu/webgame/game"


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 60) -> str:
    _, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(error[-3000:] or output[-3000:] or f"remote exit {code}")
    return output


def remote_sha(ssh: paramiko.SSHClient, path: str) -> str:
    return run(ssh, f"sha256sum -- {shlex.quote(path)} | awk '{{print $1}}'").strip()


def served_sha(ssh: paramiko.SSHClient, url: str) -> str:
    return run(
        ssh,
        f"curl -fsS --max-time 20 {shlex.quote(url)} | sha256sum | awk '{{print $1}}'",
    ).strip()


def main() -> None:
    password = os.environ.get("LHS_PROD_PASSWORD") or getpass.getpass(
        "Production password (not logged): "
    )
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
        sftp = ssh.open_sftp()
        try:
            with sftp.open(INDEX, "rb") as handle:
                index_bytes = handle.read()
        finally:
            sftp.close()

        index_text = index_bytes.decode("utf-8", "replace")
        scripts = re.findall(
            r"<script\b[^>]*\bsrc\s*=\s*['\"]([^'\"]+\.js(?:\?[^'\"]*)?)['\"]",
            index_text,
            flags=re.I,
        )
        scripts.extend(
            re.findall(
                r"['\"]([^'\"]+\.js(?:\?[^'\"]*)?)['\"]",
                index_text,
                flags=re.I,
            )
        )
        main_refs = [value for value in scripts if re.search(r"(?:^|/)main[^/]*\.js", value, re.I)]
        if not main_refs:
            raise RuntimeError("main bundle reference was not found in production index")
        main_ref = main_refs[-1]
        main_rel = main_ref.split("?", 1)[0].lstrip("/")
        main_path = f"{WEB_ROOT}/{main_rel}"

        pm2_json = run(
            ssh,
            "pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s)){const e=p.pm2_env||{};console.log(JSON.stringify({name:p.name,status:e.status,pid:p.pid,restarts:e.restart_time,pm_uptime:e.pm_uptime,pm_cwd:e.pm_cwd,pm_exec_path:e.pm_exec_path}))}})'",
        )
        pm2 = [json.loads(line) for line in pm2_json.splitlines() if line.strip()]

        listeners = run(
            ssh,
            "ss -lntpH | awk '$4 ~ /:(81|88|3001|8080|9097|9200)$/ {print}' | sort -k4",
        ).strip().splitlines()

        nginx = run(
            ssh,
            "nginx -T 2>/dev/null | grep -E '^# configuration file |^[[:space:]]*(listen|server_name|root|index|location|proxy_pass|alias)[[:space:]]' | grep -E 'configuration file|81|88|9097|linhhoasu|webgame|game|gmhoalinhsu|proxy_pass|server_name|root|index|location' | head -n 260",
        ).strip().splitlines()

        stat_lines = run(
            ssh,
            "stat -c '%n|size=%s|mtime=%y|owner=%U:%G|mode=%a' -- "
            + shlex.quote(INDEX)
            + " "
            + shlex.quote(main_path),
        ).strip().splitlines()

        http_checks: dict[str, Any] = {}
        for label, url in {
            "game_root": "http://127.0.0.1:81/",
            "ready": "http://127.0.0.1:8080/ready",
            "health": "http://127.0.0.1:9200/health",
        }.items():
            raw = run(
                ssh,
                "curl -sS --max-time 15 -w '\\n__LHS_HTTP_META__|%{http_code}|%{size_download}' "
                + shlex.quote(url),
            )
            body, _, meta = raw.rpartition("\n__LHS_HTTP_META__|")
            code, _, size = meta.partition("|")
            body = body[:600].replace("\r", " ").replace("\n", " ")
            http_checks[label] = {"url": url, "code": code, "bytes": size, "body": body}

        marker_names = [
            "LHS_MAIN_HIT_ROUTE_V6_START",
            "__lhsMainHitRouteV6Bootstrap",
            "__lhsMainLayerPriorityV8",
            "LHS_MAIN_HIT_ROUTE_V6_END",
            "20260831_touch_diag_guard23",
            "20260831_touch_alpha_watchdog_guard22",
            "__lhsTouchDiagGuard23",
            "__lhsTouchAlphaWatchdogGuard22",
        ]
        index_markers = {marker: index_text.count(marker) for marker in marker_names}

        main_marker_names = [
            "[LHS][TouchRecovery]",
            "PowerSavingModePanelSkin",
            "GuideMaskSkin",
        ]
        main_marker_counts = run(
            ssh,
            "python - " + shlex.quote(main_path) + " <<'PY'\n"
            "import sys\n"
            "p=sys.argv[1]\n"
            "data=open(p,'rb').read().decode('utf-8','replace')\n"
            f"markers={main_marker_names!r}\n"
            "for marker in markers: print(marker+'|'+str(data.count(marker)))\n"
            "PY",
        )
        main_markers = {}
        for line in main_marker_counts.splitlines():
            key, _, value = line.rpartition("|")
            if key:
                main_markers[key] = int(value)

        log_lines = run(
            ssh,
            "for f in /root/.pm2/logs/lhs-s1001-error.log /root/.pm2/logs/lhs-s1001-out.log; do "
            "[ -f \"$f\" ] || continue; echo \"FILE=$f\"; "
            "tail -n 250 \"$f\" | grep -Ei 'fatal|uncaught|unhandled|syntaxerror|referenceerror|typeerror|handler stuck|queue backlog|runtime ready|listening|ready' | tail -n 35 || true; done",
        ).strip().splitlines()

        report = {
            "host": HOST,
            "readOnly": True,
            "index": {
                "path": INDEX,
                "sha256_remote": remote_sha(ssh, INDEX),
                "sha256_sftp": hashlib.sha256(index_bytes).hexdigest(),
                "sha256_served": served_sha(ssh, "http://127.0.0.1:81/index.html?readonly_inventory=1"),
                "markers": index_markers,
            },
            "main": {
                "ref": main_ref,
                "path": main_path,
                "sha256_remote": remote_sha(ssh, main_path),
                "sha256_served": served_sha(
                    ssh, "http://127.0.0.1:81/" + main_rel + "?readonly_inventory=1"
                ),
                "markers": main_markers,
            },
            "stat": stat_lines,
            "pm2": pm2,
            "listeners": listeners,
            "nginx": nginx,
            "http": http_checks,
            "recentFilteredLogs": log_lines,
        }
        print(json.dumps(report, ensure_ascii=True, indent=2))
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
