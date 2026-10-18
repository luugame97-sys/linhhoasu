from pathlib import Path
import hashlib
import paramiko
import sys

local = Path(r"F:\WebSite\gm\Linhhoasu\account_Linhhoasu.sql")
remote = "/linhhoasu/webgame/gm/account_Linhhoasu.sql"
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('103.116.105.154', username='root', password='anhduc11', timeout=15, allow_agent=False, look_for_keys=False)
sftp = client.open_sftp()
sftp.put(str(local), remote)
sftp.chmod(remote, 0o644)
sftp.close()
stdin, stdout, stderr = client.exec_command("sha256sum /linhhoasu/webgame/gm/account_Linhhoasu.sql; grep -c 'Ngày khởi động' /linhhoasu/webgame/gm/account_Linhhoasu.sql; grep -c 'Tháng chí tôn' /linhhoasu/webgame/gm/account_Linhhoasu.sql")
sys.stdout.buffer.write(stdout.read())
sys.stderr.buffer.write(stderr.read())
if stdout.channel.recv_exit_status() != 0:
    raise SystemExit(1)
client.close()
print('LOCAL=' + hashlib.sha256(local.read_bytes()).hexdigest())
