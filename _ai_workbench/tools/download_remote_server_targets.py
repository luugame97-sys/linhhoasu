from pathlib import Path
import paramiko

dest = Path(r"I:\Linhhoasu\server\server\_ai_workbench\temp\donate_remote_current")
dest.mkdir(parents=True, exist_ok=True)
files = {
    "/linhhoasu/lhs/newServer/src/handlers/raid.js": "raid.js",
    "/linhhoasu/lhs/newServer/src/handlers/upgrade.js": "upgrade.js",
    "/linhhoasu/lhs/newServer/src/handlers/mail.js": "handlers_mail.js",
    "/linhhoasu/lhs/newServer/src/net/HTTPServer.js": "HTTPServer.js",
    "/linhhoasu/lhs/newServer/src/db/models/Mail.js": "model_Mail.js",
}
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('103.116.105.154', username='root', password='anhduc11', timeout=15, allow_agent=False, look_for_keys=False)
sftp = client.open_sftp()
for remote, name in files.items():
    sftp.get(remote, str(dest / name))
sftp.close()
client.close()
print(dest)
