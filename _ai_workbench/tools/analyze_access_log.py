import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('103.116.104.165', username='root', password='anhduc11')

code = """from collections import Counter

status_counts = Counter()
not_found_urls = Counter()
large_assets = []

with open('/www/wwwlogs/game-lhs-access.log', 'r', encoding='utf-8', errors='ignore') as f:
    for line in f:
        parts = line.split()
        if len(parts) < 10:
            continue
        status = parts[8]
        status_counts[status] += 1
        url = parts[6]
        
        if status == '404':
            not_found_urls[url] += 1
        elif status == '200':
            try:
                bytes_sent = int(parts[9])
                if bytes_sent > 1024 * 1024:
                    large_assets.append((bytes_sent, url))
            except:
                pass

print('=== 1. HTTP STATUS SUMMARY ===')
for s, c in status_counts.most_common(10):
    print('HTTP ' + s + ': ' + str(c) + ' requests')

print('\\n=== 2. TOP 404 NOT FOUND URLS ===')
for u, c in not_found_urls.most_common(10):
    print('[' + str(c) + ' times] ' + u)

print('\\n=== 3. TOP LARGEST DOWNLOADED ASSETS (> 1MB) ===')
large_assets.sort(key=lambda x: x[0], reverse=True)
seen = set()
for b, u in large_assets:
    if u not in seen:
        seen.add(u)
        print(str(round(b / 1024 / 1024, 2)) + ' MB : ' + u)
        if len(seen) >= 10:
            break
"""

sftp = client.open_sftp()
with sftp.file('/linhhoasu/_ai_workbench/tools/analyze_log.py', 'w') as f:
    f.write(code)
sftp.close()

_, out, err = client.exec_command("python3 /linhhoasu/_ai_workbench/tools/analyze_log.py")
print("STDOUT:\n" + out.read().decode('utf-8'))
stderr_msg = err.read().decode('utf-8')
if stderr_msg:
    print("STDERR:\n" + stderr_msg)

client.close()
