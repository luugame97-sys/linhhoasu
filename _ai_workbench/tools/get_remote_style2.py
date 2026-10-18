import paramiko

host = "103.116.104.165"
user = "root"
password = "anhduc00"

try:
    transport = paramiko.Transport((host, 22))
    transport.connect(username=user, password=password)
    sftp = paramiko.SFTPClient.from_transport(transport)
    
    with sftp.open("/linhhoasu/webgame/game/index.html", "r") as f:
        content = f.read().decode("utf-8")
        import re
        style_block = re.search(r"<style>.*?</style>", content, re.DOTALL)
        if style_block:
            print(style_block.group(0))
        
    sftp.close()
    transport.close()
except Exception as e:
    print(e)
