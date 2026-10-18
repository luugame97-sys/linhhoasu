#!/usr/bin/env python3
"""Read-only parse of the current Winston combined log after latest runtime marker."""
import getpass
import re
from collections import Counter, defaultdict

import paramiko

HOST = "103.116.105.154"
PATH = "/linhhoasu/lhs/newServer/logs/combined-2026-08-30.log"


def redact(line):
    line = re.sub(r"(user=)([^ ]+)", r"\1[REDACTED]", line)
    line = re.sub(r"(from )([^ ]+)", r"\1[REDACTED]", line)
    # Avoid dumping large payloads or account-like IDs from debug lines.
    return line[:700]


password = getpass.getpass("VPS password (not logged): ")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username="root", password=password, look_for_keys=False,
            allow_agent=False, timeout=15)
try:
    sftp = ssh.open_sftp()
    try:
        with sftp.open(PATH, "rb") as handle:
            raw = handle.read()
    finally:
        sftp.close()
    text = raw.decode("utf-8", "replace")
    lines = text.splitlines()
    marker_indexes = [i for i, line in enumerate(lines) if "runtime ready revision=" in line]
    start = marker_indexes[-1] if marker_indexes else max(0, len(lines) - 10000)
    current = lines[start:]
    print("PATH", PATH, "TOTAL_LINES", len(lines), "START_LINE", start + 1,
          "CURRENT_LINES", len(current))
    errors = []
    by_tag = Counter()
    by_message = Counter()
    slow = []
    pending = []
    closes = []
    opens = []
    epipe = []
    for line in current:
        if re.search(r"处理 tag=.*失败|unhandled rejection|uncaught exception|send failed|EPIPE|Connection is closed|SyntaxError", line, re.I):
            errors.append(line)
            match = re.search(r"(?:处理 tag=|tag=)(\d+).*?(?:失败|failed):?\s*(.*)$", line, re.I)
            if match:
                by_tag[int(match.group(1))] += 1
                message = re.sub(r"user=[^ ]+", "user=[REDACTED]", match.group(2)).strip()
                by_message[message[:180]] += 1
        if "slow tag=" in line:
            slow.append(line)
        if "handler still pending" in line or "handler stuck" in line or "deadline exceeded" in line:
            pending.append(line)
        if "socket closed" in line:
            closes.append(line)
        if "新连接" in line:
            opens.append(line)
        if "EPIPE" in line or "Connection is closed" in line:
            epipe.append(line)
    print("COUNTS", {"errors": len(errors), "slow": len(slow), "pending": len(pending),
                     "socketClosed": len(closes), "newConnections": len(opens),
                     "epipeOrClosed": len(epipe)})
    print("ERROR_TAGS", by_tag.most_common(30))
    print("ERROR_MESSAGES")
    for message, count in by_message.most_common(30):
        print(count, message)
    for label, rows in (("ERROR_TAIL", errors), ("SLOW_TAIL", slow),
                        ("PENDING_TAIL", pending), ("CLOSE_TAIL", closes), ("OPEN_TAIL", opens)):
        print(label)
        for line in rows[-60:]:
            print(redact(line))
finally:
    ssh.close()
