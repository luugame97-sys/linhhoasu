import sys
if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.116.104.165', username='root', password='anhduc11')

print("1. Creating cert directory on new VPS...")
_, o, _ = ssh.exec_command('mkdir -p /www/server/panel/vhost/cert/linhhoasu.lol')
print("Dir created:", o.channel.recv_exit_status())

print("2. Copying cert from old VPS 103.116.105.154...")
copy_cmd = "sshpass -p 'anhduc11' scp -o StrictHostKeyChecking=no -r root@103.116.105.154:/www/server/panel/vhost/cert/127.0.0.2/* /www/server/panel/vhost/cert/linhhoasu.lol/"
_, o, _ = ssh.exec_command(copy_cmd)
print("Copy status:", o.channel.recv_exit_status())

print("3. Checking cert files on new VPS:")
_, o, _ = ssh.exec_command('ls -la /www/server/panel/vhost/cert/linhhoasu.lol/')
print(o.read().decode('utf-8'))

print("4. Validating cert with openssl:")
_, o, _ = ssh.exec_command('openssl x509 -in /www/server/panel/vhost/cert/linhhoasu.lol/fullchain.pem -text -noout | grep -E "Issuer|Subject|Not After|DNS"')
print(o.read().decode('utf-8'))

ssh.close()
