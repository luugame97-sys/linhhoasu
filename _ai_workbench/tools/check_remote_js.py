import paramiko
import re

host = "103.116.104.165"
user = "root"
password = "anhduc00"

try:
    transport = paramiko.Transport((host, 22))
    transport.connect(username=user, password=password)
    sftp = paramiko.SFTPClient.from_transport(transport)
    
    with sftp.open("/linhhoasu/webgame/game/js/main.min_a6195824.js", "r") as f:
        content = f.read().decode("utf-8")
        if "Microsoft YaHei" in content:
            print("Microsoft YaHei is still in JS!")
        if "gothich" in content:
            print("gothich is in JS!")
            
    sftp.close()
    transport.close()
except Exception as e:
    print(e)
