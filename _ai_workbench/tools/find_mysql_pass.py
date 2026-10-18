import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.116.104.165', username='root', password='anhduc11')

cmd = 'mysql -uroot -p11a72ee788bff9b4 -e "SHOW DATABASES;"'
stdin, stdout, stderr = ssh.exec_command(cmd)
print("MySQL output:\n", stdout.read().decode())
print("MySQL err:\n", stderr.read().decode())

ssh.close()
