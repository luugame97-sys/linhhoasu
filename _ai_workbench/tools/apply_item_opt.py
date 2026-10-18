import paramiko
import re

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('103.116.104.165', username='root', password='anhduc11')

sftp = client.open_sftp()
with sftp.file('/linhhoasu/lhs/newServer/src/handlers/item.js', 'r') as f:
    content = f.read().decode('utf-8')

# Search with regex pattern for handleEquipSale
pattern = r"async function handleEquipSale\(params, session, msgUid\) \{[\s\S]*?Object\.assign\(original, draft\);[\s\S]*?return result;\s*\}\);"

replacement = """async function handleEquipSale(params, session, msgUid) {
  return handleEquipSaleUnlocked(params, session, msgUid);
}"""

match = re.search(pattern, content)
if match:
    print("Found match:", match.group(0)[:60], "...", match.group(0)[-60:])
    content = content[:match.start()] + replacement + content[match.end():]
    with sftp.file('/linhhoasu/lhs/newServer/src/handlers/item.js', 'w') as f:
        f.write(content.encode('utf-8'))
    print("SUCCESS: item.js updated")
else:
    print("Regex match failed")

sftp.close()
client.close()
