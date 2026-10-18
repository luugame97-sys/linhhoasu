from pathlib import Path
import hashlib
import paramiko
import sys

files = {
    r"F:\WebSite\gm\Linhhoasu\config.php": "/linhhoasu/webgame/gm/config.php",
    r"F:\WebSite\gm\Linhhoasu\index.php": "/linhhoasu/webgame/gm/index.php",
    r"F:\WebSite\gm\Linhhoasu\api\user_api.php": "/linhhoasu/webgame/gm/api/user_api.php",
    r"F:\WebSite\gm\Linhhoasu\admin\admin_api.php": "/linhhoasu/webgame/gm/admin/admin_api.php",
    r"F:\WebSite\gm\Linhhoasu\account_Linhhoasu.sql": "/linhhoasu/webgame/gm/account_Linhhoasu.sql",
}
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('103.116.105.154', username='root', password='anhduc11', timeout=15, allow_agent=False, look_for_keys=False)
sftp = client.open_sftp()
for local_name, remote_name in files.items():
    local_hash = hashlib.sha256(Path(local_name).read_bytes()).hexdigest()
    with sftp.open(remote_name, 'rb') as stream:
        remote_hash = hashlib.sha256(stream.read()).hexdigest()
    print(Path(local_name).name, local_hash == remote_hash, local_hash, remote_hash)
sftp.close()
client.close()
