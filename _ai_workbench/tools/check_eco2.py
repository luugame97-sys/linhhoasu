import paramiko
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('103.116.104.165', 22, 'root', 'anhduc00', timeout=10)
stdin, stdout, stderr = client.exec_command('cat /linhhoasu/lhs/newServer/ecosystem.config.js')
print(stdout.read().decode('utf-8'))
client.close()
