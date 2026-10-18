"""Create S9 from the verified live S8 launch workflow.

The S8 deployer is transformed in memory so the production logic stays in one
audited path while this run gets its own S9 timestamp, receipt directory and
server identity.  No player/account data is created by this tool.
"""
from __future__ import annotations

import runpy
import sys
from pathlib import Path


SOURCE = Path(__file__).with_name("deploy_server8_launch_20261010.py")
OPEN_TIME = 1792206000000  # 2026-10-17 10:00:00 Asia/Bangkok


def transform(source: str) -> str:
    # First move all explicit S8/S7 template references to the S9/S8 pair.
    source = source.replace("lhs-s1007", "lhs-s1008")
    source = source.replace("lhs-real-bots-s7", "lhs-real-bots-s8")
    source = source.replace("start-scheduled-bots-s7.js", "start-scheduled-bots-s8.js")
    source = source.replace("S7_OPEN_TIME", "S8_OPEN_TIME")
    source = source.replace("range(1, 8)", "range(1, 9)")
    source = source.replace(
        "[8080, 8083, 8084, 8085, 8086, 8087, 8088]",
        "[8080, 8083, 8084, 8085, 8086, 8087, 8088, 8089]",
    )
    source = source.replace("[1-7]", "[1-8]")

    # Then change the release identity and ports/timestamp.
    for old, new in (
        ("server8_launch_20261010", "server9_launch_20261017"),
        ("server8", "server9"),
        ("S8", "S9"),
        ("s8", "s9"),
        ("1008", "1009"),
        ("8089", "8090"),
        ("9207", "9208"),
        ("1791626400000", str(OPEN_TIME)),
    ):
        source = source.replace(old, new)

    # The S8 script's template is the prior node (S7); after the numeric
    # substitution restore those template references to S8. The new node
    # itself remains S9.
    source = source.replace(
        "server9Template = module.exports.apps.find(app => app.name === 'lhs-s1009')",
        "server9Template = module.exports.apps.find(app => app.name === 'lhs-s1008')",
    )
    source = source.replace(
        "server9BotTemplate = module.exports.apps.find(app => app.name === 'lhs-real-bots-s9')",
        "server9BotTemplate = module.exports.apps.find(app => app.name === 'lhs-real-bots-s8')",
    )
    source = source.replace(
        "'bot_template': APP + '/scripts/start-scheduled-bots-s9.js'",
        "'bot_template': APP + '/scripts/start-scheduled-bots-s8.js'",
    )
    # Existing route ports are S1-S8; 8090 is reserved for the new S9 node.
    source = source.replace(
        "[8080, 8083, 8084, 8085, 8086, 8087, 8088, 8090]",
        "[8080, 8083, 8084, 8085, 8086, 8087, 8088, 8089]",
    )
    source = source.replace("LHS_SERVER_COUNT=7", "LHS_SERVER_COUNT=8")
    source = source.replace("LHS_SERVER_8_", "LHS_SERVER_9_")
    source = source.replace("b'LHS_SERVER_COUNT=8'", "b'LHS_SERVER_COUNT=9'")
    source = source.replace(
        "assert env.count(b'LHS_SERVER_COUNT=9') == 1",
        "assert env.count(b'LHS_SERVER_COUNT=8') == 1",
    )
    source = source.replace(
        "env = env.replace(b'LHS_SERVER_COUNT=9', b'LHS_SERVER_COUNT=9', 1)",
        "env = env.replace(b'LHS_SERVER_COUNT=8', b'LHS_SERVER_COUNT=9', 1)",
    )
    source = source.replace(
        "const old=ps.find(p=>p.name==='lhs-s1009').pm2_env,oldBot=ps.find(p=>p.name==='lhs-real-bots-s9').pm2_env;",
        "const old=ps.find(p=>p.name==='lhs-s1008').pm2_env,oldBot=ps.find(p=>p.name==='lhs-real-bots-s8').pm2_env;",
    )
    source = source.replace("let now=1791626399999", "let now=1792205999999")
    source = source.replace("location /ws-s7", "location /ws-s8")
    source = source.replace("replace(b'/ws-s7', b'/ws-s9')", "replace(b'/ws-s8', b'/ws-s9')")
    source = source.replace("replace(b':9206', b':9208')", "replace(b':9207', b':9208')")
    source = source.replace(
        "assert b'const S9_OPEN_TIME = 1791028800000;' in bot",
        "assert b'const S8_OPEN_TIME = 1791626400000;' in bot",
    )
    source = source.replace(
        "bot = bot.replace(b'S7', b'S9').replace(b'1007', b'1009').replace(b'1791028800000', str(OPEN).encode())",
        "bot = bot.replace(b'S8', b'S9').replace(b'1008', b'1009').replace(b'1791626400000', str(OPEN).encode())",
    )
    source = source.replace(
        '"1007":"http://127.0.0.1:8088"}',
        '"1007":"http://127.0.0.1:8088","1008":"http://127.0.0.1:8089"}',
    )
    source = source.replace("17:00 10/10/2026", "10:00 17/10/2026")
    source = source.replace("2026-10-10T17:00:00+07:00", "2026-10-17T10:00:00+07:00")

    # Transform the read-only QA probe from S8 to S9 at deploy time; no QA
    # account or player is created.
    source = source.replace(
        "ROOT / '_ai_workbench/tools/qa_server9_launch_20261017.js'",
        "ROOT / '_ai_workbench/tools/qa_server8_launch_20261010.js'",
    )
    needle = "source = (ROOT / '_ai_workbench/tools/qa_server8_launch_20261010.js').read_text(encoding='utf-8')"
    replacement = needle + "\n    for old, new in [('1008','1009'), ('S8','S9'), ('s8','s9'), ('1791626400000', str(OPEN)), ('9207','9208'), ('8089','8090')]:\n        source = source.replace(old, new)\n    source = source.replace('[8080, 8083, 8084, 8085, 8086, 8087, 8088, 8090, 81]', '[8080, 8083, 8084, 8085, 8086, 8087, 8088, 8089, 8090, 81]')\n    source = source.replace('[8080, 8083, 8084, 8085, 8086, 8087, 8088, 8090])', '[8080, 8083, 8084, 8085, 8086, 8087, 8088, 8089, 8090])')"
    source = source.replace(needle, replacement)
    return source


def main() -> None:
    code = transform(SOURCE.read_text(encoding="utf-8"))
    namespace = {"__name__": "__main__", "__file__": str(SOURCE)}
    exec(compile(code, str(SOURCE), "exec"), namespace)


if __name__ == "__main__":
    main()
