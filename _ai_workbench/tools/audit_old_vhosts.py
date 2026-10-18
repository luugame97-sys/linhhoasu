import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.116.105.154', username='root', password='anhduc11')

for f in ['127.0.0.1.conf', '127.0.0.2.conf', 'game.lhs.conf']:
    print(f"\n=== {f} ===")
    _, o, _ = ssh.exec_command(f"grep -E '(listen|server_name|root )' /www/server/panel/vhost/nginx/{f}")
    print(o.read().decode())

ssh.close()
