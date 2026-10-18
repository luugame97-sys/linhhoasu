import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('103.116.104.165', username='root', password='anhduc11')

sftp = client.open_sftp()
with sftp.file('/linhhoasu/webgame/game/index.html', 'r') as f:
    content = f.read().decode('utf-8')

# Search for the block starting from giftcodeNoticeKey up to right before var dragged = false;
start_marker = "\t\tvar giftcodeNoticeKey = 'lhs_public_giftcode_notice_v1';"
end_marker = "\t\tvar dragged = false;"

start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

if start_idx != -1 and end_idx != -1 and start_idx < end_idx:
    new_content = content[:start_idx] + content[end_idx:]
    with sftp.file('/linhhoasu/webgame/game/index.html', 'w') as f:
        f.write(new_content.encode('utf-8'))
    print("SUCCESS: Removed giftcode polling block from index.html")
else:
    print(f"ERROR: Markers not found: start_idx={start_idx}, end_idx={end_idx}")

sftp.close()
client.close()
