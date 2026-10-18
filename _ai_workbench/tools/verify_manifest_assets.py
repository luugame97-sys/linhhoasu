import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('103.116.104.165', username='root', password='anhduc11')

code = """import re
import os

with open('/linhhoasu/webgame/game/index.html', 'r', encoding='utf-8') as f:
    text = f.read()

match_initial = re.search(r'"initial":\s*\[(.*?)\]', text, re.DOTALL)
match_game = re.search(r'"game":\s*\[(.*?)\]', text, re.DOTALL)
match_bin = re.search(r'"hashed_default_json":\s*\{(.*?)\}', text, re.DOTALL)

items = []
if match_initial:
    items += re.findall(r'"([^"]+)"', match_initial.group(1))
if match_game:
    items += re.findall(r'"([^"]+)"', match_game.group(1))
if match_bin:
    items += re.findall(r'"([^"]+\.bin[^"]*)"', match_bin.group(1))

print(f"Total manifest resources: {len(items)}")
missing = []
for item in items:
    clean_path = item.split('?')[0]
    full_path = os.path.join('/linhhoasu/webgame/game', clean_path)
    if not os.path.exists(full_path):
        missing.append((item, "FILE_NOT_FOUND"))
    else:
        size = os.path.getsize(full_path)
        if size == 0:
            missing.append((item, "ZERO_SIZE"))

if missing:
    print("MISSING/INVALID ASSETS FOUND:")
    for m in missing:
        print(f"  - {m[0]} ({m[1]})")
else:
    print(f"ALL {len(items)} MANIFEST RESOURCES EXIST ON DISK (100% OK)")
"""

sftp = client.open_sftp()
with sftp.file('/linhhoasu/_ai_workbench/tools/check_manifest.py', 'w') as f:
    f.write(code)
sftp.close()

_, out, err = client.exec_command("python3 /linhhoasu/_ai_workbench/tools/check_manifest.py")
print("STDOUT:\n" + out.read().decode('utf-8'))
stderr_msg = err.read().decode('utf-8')
if stderr_msg:
    print("STDERR:\n" + stderr_msg)

client.close()
