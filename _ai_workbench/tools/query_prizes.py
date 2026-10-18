import sys
if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.116.104.165', username='root', password='anhduc11')

cmd = """php -r "
require_once '/linhhoasu/webgame/gm/config.php';
\\$stmt = \\$conn_web->query('SELECT * FROM lucky_wheel_prizes WHERE is_active=1');
print_r(\\$stmt->fetchAll(PDO::FETCH_ASSOC));
" """

stdin, stdout, stderr = ssh.exec_command(cmd)
print(stdout.read().decode('utf-8'))
print(stderr.read().decode('utf-8'))
ssh.close()
