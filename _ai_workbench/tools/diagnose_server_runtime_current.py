#!/usr/bin/env python3
"""Read-only production runtime probe for the LHS WebSocket server.

The script deliberately filters and bounds PM2 output so credentials/payloads are
not printed. It does not upload files, write remote state, or restart processes.
"""
from __future__ import annotations

import getpass
import hashlib
import json
import re
import statistics
from collections import Counter, defaultdict
from pathlib import Path

import paramiko


HOST = "103.116.105.154"
REMOTE_OUT = "/root/.pm2/logs/lhs-s1001-out.log"
REMOTE_ERR = "/root/.pm2/logs/lhs-s1001-error.log"
REMOTE_APP = "/linhhoasu/lhs/newServer"
LOCAL_APP = Path(__file__).resolve().parents[2] / "linhhoasu" / "lhs" / "newServer"


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 30) -> tuple[int, str, str]:
    stdin, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    return stdout.channel.recv_exit_status(), out, err


def redact(line: str) -> str:
    # Keep diagnostics useful while never printing account ids or auth material.
    line = re.sub(r"(user=)([^\s]+)", r"\1[REDACTED]", line)
    line = re.sub(r"(from\s+)([^\s]+)", r"\1[REDACTED]", line)
    line = re.sub(r"(password|token|secret|api[_-]?key)=([^\s]+)", r"\1=[REDACTED_SECRET]", line, flags=re.I)
    return line[:900]


def pct(values: list[float], fraction: float) -> float:
    if not values:
        return 0.0
    values = sorted(values)
    idx = min(len(values) - 1, max(0, int(len(values) * fraction)))
    return values[idx]


def source_hashes() -> dict[str, str]:
    result: dict[str, str] = {}
    for rel in (
        "src/net/WSServer.js",
        "src/services/PlayerService.js",
        "src/handlers/farm.js",
        "src/services/RoleAppearanceService.js",
    ):
        path = LOCAL_APP / rel
        try:
            result[rel] = hashlib.sha256(path.read_bytes()).hexdigest()
        except OSError as exc:
            result[rel] = f"local-error:{exc}"
    return result


def parse_metrics(lines: list[str]) -> None:
    perf: dict[int, list[float]] = defaultdict(list)
    queue_depths: list[int] = []
    queue_by_tag: dict[int, list[int]] = defaultdict(list)
    slow: list[tuple[int, float, float, float, float]] = []
    queue_wait: list[tuple[int, float, int]] = []
    save_backlog: list[int] = []
    errors: Counter[str] = Counter()
    pending = []
    outbound = []
    closes = []
    marker = []

    for line in lines:
        if "runtime ready revision=" in line:
            marker.append(line)
        m = re.search(r"\[Perf\]\[WS\].*?tag=(\d+).*?totalMs=([\d.]+)", line)
        if m:
            perf[int(m.group(1))].append(float(m.group(2)))
        m = re.search(r"handler enter .*?tag=(\d+).*?queueDepth=(\d+)", line)
        if m:
            tag, depth = int(m.group(1)), int(m.group(2))
            queue_depths.append(depth)
            queue_by_tag[tag].append(depth)
        m = re.search(r"queue wait .*?tag=(\d+).*?depth=(\d+).*?wait=(\d+)ms", line)
        if m:
            queue_wait.append((int(m.group(1)), float(m.group(3)), int(m.group(2))))
        m = re.search(r"slow tag=(\d+).*?elapsed=(\d+)ms(?:.*?route=(\d+)ms post=(\d+)ms tail=(\d+)ms)?", line)
        if m:
            slow.append(tuple(float(x or 0) for x in m.groups()))
        m = re.search(r"save queue backlog .*?depth=(\d+)", line, flags=re.I)
        if m:
            save_backlog.append(int(m.group(1)))
        if any(x in line.lower() for x in ("handler still pending", "handler stuck", "deadline exceeded")):
            pending.append(line)
        if "outbound backlog" in line or "send callback pending" in line:
            outbound.append(line)
        if "socket closed" in line:
            closes.append(line)
        if re.search(r"处理 tag=.*失败|uncaught|unhandled rejection|EPIPE|ReferenceError|TypeError|SyntaxError|async-save-failed", line, re.I):
            # Group by stable error marker, not user/payload details.
            clean = re.sub(r"user=[^\s]+", "user=[REDACTED]", line)
            errors[clean[:260]] += 1

    all_perf = [value for values in perf.values() for value in values]
    print("LOG_STATS", json.dumps({
        "filteredLines": len(lines),
        "perfSamples": len(all_perf),
        "perfP50Ms": round(pct(all_perf, 0.50), 2),
        "perfP95Ms": round(pct(all_perf, 0.95), 2),
        "perfP99Ms": round(pct(all_perf, 0.99), 2),
        "perfMaxMs": round(max(all_perf), 2) if all_perf else 0,
        "queueSamples": len(queue_depths),
        "queueP95": int(pct([float(x) for x in queue_depths], 0.95)),
        "queueMax": max(queue_depths, default=0),
        "queueOver3": sum(x > 3 for x in queue_depths),
        "queueWaitSamples": len(queue_wait),
        "queueWaitP95Ms": round(pct([x[1] for x in queue_wait], 0.95), 2),
        "queueWaitMaxMs": round(max((x[1] for x in queue_wait), default=0), 2),
        "saveBacklogEvents": len(save_backlog),
        "saveBacklogMax": max(save_backlog, default=0),
        "slowCount": len(slow),
        "pendingCount": len(pending),
        "outboundBacklogCount": len(outbound),
        "socketClosedCount": len(closes),
        "errorCount": sum(errors.values()),
    }, ensure_ascii=False))

    print("TOP_TAGS")
    ranked = sorted(perf.items(), key=lambda item: pct(item[1], 0.95), reverse=True)
    for tag, values in ranked[:30]:
        print(json.dumps({
            "tag": tag,
            "n": len(values),
            "avgMs": round(statistics.mean(values), 2),
            "p95Ms": round(pct(values, 0.95), 2),
            "maxMs": round(max(values), 2),
        }))
    print("QUEUE_TAGS")
    for tag, values in sorted(queue_by_tag.items(), key=lambda item: max(item[1]), reverse=True)[:20]:
        print(json.dumps({"tag": tag, "n": len(values), "avg": round(statistics.mean(values), 2), "max": max(values)}))
    print("SLOW_TAIL")
    for row in slow[-50:]:
        print(redact("tag=%d elapsed=%dms route=%dms post=%dms tail=%dms" % row))
    print("PENDING_TAIL")
    for line in pending[-30:]:
        print(redact(line))
    print("ERROR_GROUPS")
    for line, count in errors.most_common(30):
        print(count, redact(line))
    print("MARKER_TAIL")
    for line in marker[-3:]:
        print(redact(line))


def main() -> None:
    password = getpass.getpass("VPS password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False, timeout=15)
    try:
        print("LOCAL_HASHES", json.dumps(source_hashes(), ensure_ascii=False))
        for label, command in (
            ("DATE_HOST", "date -Is; hostname"),
            ("PM2_LIST", "pm2 list --no-color"),
            ("PROCESS", "p=$(pm2 pid lhs-s1001 2>/dev/null | tail -1); echo pm2pid=$p; [ -n \"$p\" ] && ps -o pid,ppid,etimes,%cpu,%mem,rss,args -p \"$p\""),
            ("LISTENERS", "ss -ltnp 2>/dev/null | grep -E ':(81|8080|9200|3001|8082)\\b' || true"),
            ("HEALTH_WS", "curl -sS --max-time 5 http://127.0.0.1:9200/health || true"),
            ("READY_HTTP", "curl -sS --max-time 5 http://127.0.0.1:8080/ready || true"),
            ("REMOTE_HASHES", "sha256sum " + " ".join(f"{REMOTE_APP}/{rel}" for rel in (
                "src/net/WSServer.js", "src/services/PlayerService.js", "src/handlers/farm.js", "src/services/RoleAppearanceService.js"))),
            ("LOG_FILES", "ls -lhtr /root/.pm2/logs/lhs-s1001-*.log /linhhoasu/lhs/newServer/logs/* 2>/dev/null | tail -20"),
        ):
            code, out, err = run(ssh, command)
            print(f"=== {label} (exit={code}) ===")
            if out:
                # PM2 output can include environment in some versions; only print the table.
                print("\n".join(redact(line) for line in out.splitlines()[:120]))
            if err:
                print("STDERR", "\n".join(redact(line) for line in err.splitlines()[:20]))

        # Filter a bounded tail after the latest runtime marker. This avoids downloading
        # the potentially multi-gigabyte combined log over SFTP.
        command = (
            "f=" + REMOTE_OUT + "; "
            "line=$(grep -n '\\[WSServer\\] runtime ready revision=' \"$f\" 2>/dev/null | tail -1 | cut -d: -f1); "
            "if [ -n \"$line\" ]; then tail -n +$line \"$f\"; else tail -n 120000 \"$f\"; fi | "
            "grep -E 'runtime ready revision=|\\[Perf\\]\\[WS\\]|handler enter .*queueDepth=|queue wait .*wait=|queue backlog|slow tag=|handler still pending|handler stuck|deadline exceeded|save queue backlog|outbound backlog|send callback pending|socket closed|处理 tag=.*失败|uncaught|unhandled rejection|EPIPE|ReferenceError|TypeError|SyntaxError|async-save-failed' | tail -n 50000"
        )
        code, out, err = run(ssh, command, timeout=90)
        print(f"=== FILTERED_RUNTIME_LOG (exit={code}) ===")
        if err:
            print("STDERR", "\n".join(redact(line) for line in err.splitlines()[:20]))
        parse_metrics(out.splitlines())
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
