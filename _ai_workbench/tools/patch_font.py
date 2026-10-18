import os
import re
import paramiko

def patch_file(path, old, new):
    if not os.path.exists(path): return
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    content = content.replace(old, new)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
        
js_dir = r"i:\Linhhoasu\server\server\linhhoasu\webgame\game\js"
egret_js = os.path.join(js_dir, "egret.min_7d668222.js")
main_js = os.path.join(js_dir, "main.min_a6195824.js")
index_html = r"i:\Linhhoasu\server\server\linhhoasu\webgame\game\index.html"

# Patch egret
patch_file(egret_js, '"Arial"', '"gothich"')
patch_file(egret_js, "'Arial'", "'gothich'")

# Patch main
patch_file(main_js, '"Microsoft YaHei"', '"gothich"')
patch_file(main_js, "'Microsoft YaHei'", "'gothich'")

# Patch index.html
with open(index_html, "r", encoding="utf-8") as f:
    html = f.read()
    
if "gothich" not in html:
    font_css = """
    @font-face {
        font-family: 'gothich';
        src: url('gothich.ttf') format('truetype');
        font-weight: normal;
        font-style: normal;
    }
"""
    html = html.replace("<style>", "<style>" + font_css)
    with open(index_html, "w", encoding="utf-8") as f:
        f.write(html)
        
# Upload them to VPS
host = "103.116.104.165"
user = "root"
password = "anhduc00"

files_to_upload = [
    (egret_js, "/linhhoasu/webgame/game/js/egret.min_7d668222.js"),
    (main_js, "/linhhoasu/webgame/game/js/main.min_a6195824.js"),
    (index_html, "/linhhoasu/webgame/game/index.html")
]

try:
    transport = paramiko.Transport((host, 22))
    transport.connect(username=user, password=password)
    sftp = paramiko.SFTPClient.from_transport(transport)
    
    for local_path, remote_path in files_to_upload:
        if os.path.exists(local_path):
            print(f"Uploading {os.path.basename(local_path)}...")
            sftp.put(local_path, remote_path)
            print(f"Success: {remote_path}")
            
    sftp.close()
    transport.close()
    print("All files patched and uploaded successfully.")
except Exception as e:
    print(f"Upload failed: {e}")
