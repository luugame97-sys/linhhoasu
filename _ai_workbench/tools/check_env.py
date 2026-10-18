import paramiko
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('103.116.104.165', 22, 'root', 'anhduc00', timeout=10)
stdin, stdout, stderr = client.exec_command('pm2 env 0 | grep REDIS')
print(stdout.read().decode('utf-8'))
client.close()
