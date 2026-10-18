import paramiko
import sys
sys.stdout.reconfigure(encoding='utf-8')

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('103.116.104.165', username='root', password='anhduc11')

def run(cmd):
    _, out, err = client.exec_command(cmd)
    return out.read().decode('utf-8', 'replace')

print('--- Icons in game and gm ---')
print(run("find /linhhoasu/webgame/game /linhhoasu/webgame/gm -maxdepth 3 -name '*logo*' -o -name '*icon*' -o -name '*favicon*' | head -n 30"))

print('--- Head of index.html ---')
print(run("head -n 35 /linhhoasu/webgame/game/index.html"))

client.close()
