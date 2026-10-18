import os
import paramiko
import re

local_index = r"i:\Linhhoasu\server\server\linhhoasu\webgame\game\index.html"
with open(local_index, "r", encoding="utf-8") as f:
    html = f.read()

# Make sure we clean up their hack if it exists locally
html = re.sub(r"@font-face\s*{[^}]*}", "", html)
html = re.sub(r"\*{\s*font-family[^}]*}", "", html)

font_css = """
    @font-face {
        font-family: 'gothich';
        src: url('gothich.ttf') format('truetype');
        font-weight: normal;
        font-style: normal;
    }
"""
html = html.replace("<style>", "<style>\n" + font_css)

with open(local_index, "w", encoding="utf-8") as f:
    f.write(html)

host = "103.116.104.165"
user = "root"
password = "anhduc00"

try:
    transport = paramiko.Transport((host, 22))
    transport.connect(username=user, password=password)
    sftp = paramiko.SFTPClient.from_transport(transport)
    
    sftp.put(local_index, "/linhhoasu/webgame/game/index.html")
    print("Fixed index.html uploaded.")
    sftp.close()
    transport.close()
except Exception as e:
    print(e)
