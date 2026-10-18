"""Fetch and summarize current test-VPS runtime evidence, read-only."""
from __future__ import annotations

import getpass
import hashlib
import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

import paramiko

HOST = "192.168.200.151"
ROOT = Path(__file__).resolve().parents[2]
REMOTE_FILES = [
    "/linhhoasu/lhs/newServer/logs/combined-2026-09-01.log",
    "/linhhoasu/lhs/newServer/logs/error-2026-09-01.log",
    "/root/.pm2/logs/lhs-s1001-out.log",
    "/root/.pm2/logs/lhs-s1001-error.log",
    "/linhhoasu/lhs/newServer/src/net/WSServer.js",
    "/linhhoasu/lhs/newServer/src/handlers/arena.js",
    "/linhhoasu/lhs/newServer/src/services/BotPopulationService.js",
    "/linhhoasu/lhs/newServer/src/services/RealBotWorker.js",
    "/linhhoasu/lhs/newServer/src/router.js",
    "/linhhoasu/lhs/newServer/ecosystem.config.js",
]


def redact(s: str) -> str:
    s = re.sub(r"(?i)(password|passwd|secret|token|api[_-]?key|private[_-]?key)\s*[=:]\s*[^\s,;]+", r"\1=[REDACTED]", s)
    s = re.sub(r"(?i)(mongodb(?:\+srv)?://[^:/\s]+:)[^@\s]+@", r"\1[REDACTED]@", s)
    s = re.sub(r"(?i)(redis://[^:/\s]+:)[^@\s]+@", r"\1[REDACTED]@", s)
    s = re.sub(r"\b(?:p_u_[A-Za-z0-9_-]+|user(?:Id)?=[A-Za-z0-9_-]+)\b", "[REDACTED_ID]", s)
    return s


def summarize(log: str) -> dict:
    lines = log.splitlines()
    # Keep the newest runtime marker onward when present; otherwise analyze all.
    marks = [i for i, x in enumerate(lines) if "runtime ready revision=" in x]
    start = marks[-1] if marks else 0
    cur = lines[start:]
    tag_counts: Counter[str] = Counter()
    slow_rows: list[str] = []
    pending_rows: list[str] = []
    error_rows: list[str] = []
    queue_depth: list[int] = []
    elapsed: list[float] = []
    for line in cur:
        for m in re.finditer(r"\btag(?:=|\s+)(\d+)\b", line):
            tag_counts[m.group(1)] += 1
        if re.search(r"slow|stuck|pending|deadline|timeout|EPIPE|handler\.throw|unhandled|uncaught|failed|error", line, re.I):
            if "slow" in line.lower() or "elapsed=" in line.lower(): slow_rows.append(line)
            if re.search(r"stuck|pending|deadline|timeout", line, re.I): pending_rows.append(line)
            if re.search(r"EPIPE|handler\.throw|unhandled|uncaught|failed|error", line, re.I): error_rows.append(line)
        m = re.search(r"queueDepth[=: ]+(\d+)", line)
        if m: queue_depth.append(int(m.group(1)))
        m = re.search(r"elapsed[=: ]+([0-9.]+)ms", line)
        if m:
            try: elapsed.append(float(m.group(1)))
            except ValueError: pass
    return {
        "totalLines": len(lines), "startLine": start + 1, "analyzedLines": len(cur),
        "tagCounts": tag_counts.most_common(80),
        "queue": {"count": len(queue_depth), "max": max(queue_depth) if queue_depth else None,
                   "p95": sorted(queue_depth)[max(0, int(len(queue_depth)*.95)-1)] if queue_depth else None},
        "elapsedMs": {"count": len(elapsed), "max": max(elapsed) if elapsed else None,
                      "p95": sorted(elapsed)[max(0, int(len(elapsed)*.95)-1)] if elapsed else None},
        "slowTail": [redact(x)[:1000] for x in slow_rows[-120:]],
        "pendingTail": [redact(x)[:1000] for x in pending_rows[-120:]],
        "errorTail": [redact(x)[:1000] for x in error_rows[-120:]],
    }


def main() -> None:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    out_dir = ROOT / "_ai_workbench" / "temp" / f"test_runtime_evidence_{stamp}"
    out_dir.mkdir(parents=True, exist_ok=False)
    password = getpass.getpass("Test VPS password (not logged): ")
    ssh = paramiko.SSHClient(); ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False,
                timeout=20, banner_timeout=20, auth_timeout=20)
    manifest = []; summaries = {}
    try:
        sftp = ssh.open_sftp()
        try:
            for remote in REMOTE_FILES:
                local = out_dir / "raw" / remote.lstrip("/")
                local.parent.mkdir(parents=True, exist_ok=True)
                try:
                    sftp.get(remote, str(local))
                except (IOError, OSError) as exc:
                    manifest.append({"remote": remote, "missing": str(exc)}); continue
                data = local.read_bytes(); digest = hashlib.sha256(data).hexdigest()
                manifest.append({"remote": remote, "bytes": len(data), "sha256": digest,
                                 "path": str(local.relative_to(out_dir)).replace("\\", "/")})
                if remote.endswith(".log"):
                    summaries[remote] = summarize(data.decode("utf-8", "replace"))
        finally: sftp.close()
    finally: ssh.close()
    # Redacted source copies and logs are kept only for local analysis; source has no secrets expected.
    for p in (out_dir / "raw").rglob("*"):
        if p.is_file() and p.suffix in {".log", ".js"}:
            p.write_text(redact(p.read_text(encoding="utf-8", errors="replace")), encoding="utf-8")
    report = {"host": HOST, "capturedAt": datetime.now(timezone.utc).isoformat(),
              "readOnly": True, "files": manifest, "summaries": summaries}
    (out_dir / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(out_dir), "files": len(manifest), "logs": len(summaries)}, ensure_ascii=False))


if __name__ == "__main__": main()
