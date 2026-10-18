import paramiko, sys
sys.stdout.reconfigure(encoding='utf-8')
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('103.116.104.165', username='root', password='anhduc11')

def run(cmd):
    _, out, err = client.exec_command(cmd)
    return out.read().decode('utf-8', 'replace')

print('--- Search apk or pc in login.php ---')
print(run('grep -n -C 5 "apk" /linhhoasu/webgame/gm/login.php'))
print('--- Search download modal in login.php ---')
print(run('grep -n -C 10 "modal-download" /linhhoasu/webgame/gm/login.php || grep -n -C 10 "download" /linhhoasu/webgame/gm/login.php | head -n 40'))

client.close()
