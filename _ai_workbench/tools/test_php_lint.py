import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('103.116.104.165', username='root', password='anhduc11')

_, out, err = c.exec_command('php -l /linhhoasu/webgame/gm/config.php && php -l /linhhoasu/webgame/gm/index.php')
print(out.read().decode('utf-8'))
c.close()
