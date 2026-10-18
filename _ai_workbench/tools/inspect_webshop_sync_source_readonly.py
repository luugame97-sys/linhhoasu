"""Print non-secret Webshop sync and display control excerpts from production."""

import getpass

import paramiko


HOST = "103.116.105.154"
FILES = {
    "sync": "/linhhoasu/webgame/gm/_ai_workbench/tools/sync_webshop_catalog.php",
    "index": "/linhhoasu/webgame/gm/index.php",
    "buy": "/linhhoasu/webgame/gm/api/user_api.php",
    "admin": "/linhhoasu/webgame/gm/admin/admin_api.php",
}
RANGES = {
    "sync": [(1, 115)],
    "index": [(140, 175), (455, 500)],
    "buy": [(285, 348)],
    "admin": [(440, 560)],
}


ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(
    HOST,
    username="root",
    password=getpass.getpass("VPS password (not logged): "),
    look_for_keys=False,
    allow_agent=False,
    timeout=15,
)
try:
    sftp = ssh.open_sftp()
    try:
        for key, path in FILES.items():
            with sftp.open(path, "rb") as handle:
                lines = handle.read().decode("utf-8", "replace").splitlines()
            print(f"### {key} {path}")
            for start, end in RANGES[key]:
                for number in range(start, min(end, len(lines)) + 1):
                    print(f"{number}: {lines[number - 1]}")
    finally:
        sftp.close()
finally:
    ssh.close()
