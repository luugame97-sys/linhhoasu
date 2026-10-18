"""Idempotently add non-secret S2 routing keys to an existing WebGM .env."""

import os
import sys
from pathlib import Path


UPDATES = {
    "LHS_SERVER_COUNT": "2",
    "LHS_SERVER_1_API_BASE": "http://127.0.0.1:8080",
    "LHS_SERVER_2_ID": "1002",
    "LHS_SERVER_2_KEY": "1002",
    "LHS_SERVER_2_NAME": "Linh Họa Sư - S2",
    "LHS_SERVER_2_API_BASE": "http://127.0.0.1:8083",
}


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: update_webgm_s2_env.py /path/to/.env")
    path = Path(sys.argv[1])
    lines = path.read_text(encoding="utf-8-sig").splitlines()
    seen = set()
    output = []
    for line in lines:
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and "=" in line:
            key = line.split("=", 1)[0].strip()
            if key in UPDATES:
                output.append(f"{key}={UPDATES[key]}")
                seen.add(key)
                continue
        output.append(line)
    if output and output[-1] != "":
        output.append("")
    for key, value in UPDATES.items():
        if key not in seen:
            output.append(f"{key}={value}")
    temp = path.with_name(path.name + ".s2-new")
    temp.write_text("\n".join(output).rstrip() + "\n", encoding="utf-8")
    os.chmod(temp, 0o640)
    os.replace(temp, path)
    print("UPDATED_KEYS=" + ",".join(sorted(UPDATES)))


if __name__ == "__main__":
    main()
