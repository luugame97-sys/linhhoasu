import paramiko, sys
sys.stdout.reconfigure(encoding='utf-8')
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('103.116.104.165', username='root', password='anhduc11')

def run(cmd):
    _, out, err = client.exec_command(cmd)
    return out.read().decode('utf-8', 'replace')

cmd = sys.argv[1] if len(sys.argv) > 1 else 'id'
print(run(cmd))
client.close()
