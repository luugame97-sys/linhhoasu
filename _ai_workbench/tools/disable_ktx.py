import os

js_file = r"i:\Linhhoasu\server\server\linhhoasu\webgame\game\js\start.min_52ac8d58.js"
with open(js_file, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace('?"_astc_ktx":void 0:null', '?void 0:void 0:null')

with open(js_file, "w", encoding="utf-8") as f:
    f.write(content)

import paramiko
host = "103.116.104.165"
user = "root"
password = "anhduc00"

try:
    transport = paramiko.Transport((host, 22))
    transport.connect(username=user, password=password)
    sftp = paramiko.SFTPClient.from_transport(transport)
    sftp.put(js_file, "/linhhoasu/webgame/game/js/start.min_52ac8d58.js")
    sftp.close()
    transport.close()
    print("Disabled KTX in start.min.js and uploaded.")
except Exception as e:
    print(e)
