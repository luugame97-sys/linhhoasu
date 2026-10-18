import hashlib
import sys
from pathlib import Path

# Setup paths
tools_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(tools_dir))

from snapshot_web_multiserver_20260906 import connect, run

workspace_root = tools_dir.parent.parent
local_js = workspace_root / 'linhhoasu' / 'webgame' / 'game' / 'js' / 'lhs-power-relogin-v1.js'
local_html = workspace_root / 'linhhoasu' / 'webgame' / 'game' / 'index.html'

def sha256(data):
    return hashlib.sha256(data).hexdigest()

js_content = local_js.read_bytes()
html_content = local_html.read_bytes()

print(f"Local JS SHA256:   {sha256(js_content)} (size: {len(js_content)})")
print(f"Local HTML SHA256: {sha256(html_content)} (size: {len(html_content)})")

ssh = connect()
print("Connected to VPS via Paramiko SSH.")

sftp = ssh.open_sftp()

# 1. Create backup dir on VPS
backup_dir = '/linhhoasu/_ai_workbench/backups/power_relogin_v2_20260921'
run(ssh, f'mkdir -p {backup_dir}')

# 2. Backup current remote files
print("Backing up remote files...")
run(ssh, f'cp -p /linhhoasu/webgame/game/js/lhs-power-relogin-v1.js {backup_dir}/lhs-power-relogin-v1.js.bak')
run(ssh, f'cp -p /linhhoasu/webgame/game/index.html {backup_dir}/index.html.bak')

# 3. Upload new files
print("Uploading new files to VPS...")
with sftp.file('/linhhoasu/webgame/game/js/lhs-power-relogin-v1.js', 'wb') as f:
    f.write(js_content)

with sftp.file('/linhhoasu/webgame/game/index.html', 'wb') as f:
    f.write(html_content)

# 4. Set permissions
run(ssh, 'chmod 644 /linhhoasu/webgame/game/js/lhs-power-relogin-v1.js /linhhoasu/webgame/game/index.html')

# 5. Verify checksums on VPS
remote_js_sum = run(ssh, 'sha256sum /linhhoasu/webgame/game/js/lhs-power-relogin-v1.js').strip().split()[0]
remote_html_sum = run(ssh, 'sha256sum /linhhoasu/webgame/game/index.html').strip().split()[0]

print(f"Remote JS SHA256:   {remote_js_sum}")
print(f"Remote HTML SHA256: {remote_html_sum}")

assert remote_js_sum == sha256(js_content), "JS SHA256 mismatch!"
assert remote_html_sum == sha256(html_content), "HTML SHA256 mismatch!"

print("SHA256 checksums match 100%!")

# 6. Verify HTTP response on port 81 (Nginx Webgame)
http_verify = run(ssh, 'curl -sI "http://127.0.0.1:81/js/lhs-power-relogin-v1.js?v=20260921_power_relogin_v2" | head -n 5')
print("HTTP verification on port 81:")
print(http_verify)

html_grep = run(ssh, 'grep "20260921_power_relogin_v2" /linhhoasu/webgame/game/index.html')
print("HTML verification:")
print(html_grep.strip())

sftp.close()
ssh.close()
print("Deployment completed successfully!")
