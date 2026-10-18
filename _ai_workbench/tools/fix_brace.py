import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('103.116.104.165', username='root', password='anhduc11')

sftp = client.open_sftp()
with sftp.file('/linhhoasu/lhs/newServer/src/handlers/item.js', 'r') as f:
    content = f.read().decode('utf-8')

content = content.replace(
    "async function handleEquipSale(params, session, msgUid) {\n  return handleEquipSaleUnlocked(params, session, msgUid);\n}\n}",
    "async function handleEquipSale(params, session, msgUid) {\n  return handleEquipSaleUnlocked(params, session, msgUid);\n}"
)

with sftp.file('/linhhoasu/lhs/newServer/src/handlers/item.js', 'w') as f:
    f.write(content.encode('utf-8'))

sftp.close()
client.close()
print("Fixed extra brace in item.js")
