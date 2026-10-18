import paramiko

host = "103.116.104.165"
user = "root"
password = "anhduc00"

try:
    transport = paramiko.Transport((host, 22))
    transport.connect(username=user, password=password)
    sftp = paramiko.SFTPClient.from_transport(transport)
    
    # Check the size of the uploaded file
    remote_path = "/linhhoasu/webgame/game/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin"
    stat = sftp.stat(remote_path)
    print("Uploaded file size:", stat.st_size)
    
    # Check if there is another directory where the game is served from!
    # Let's read the nginx config
    stdin, stdout, stderr = transport.open_session().exec_command("cat /etc/nginx/conf.d/linhhoasu.conf")
    # Actually paramiko exec_command is easier through SSHClient
except Exception as e:
    print(e)
