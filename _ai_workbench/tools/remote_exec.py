import sys
if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.116.104.165', username='root', password='anhduc11')

cmd = sys.argv[1] if len(sys.argv) > 1 else 'ls -la'
stdin, stdout, stderr = ssh.exec_command(cmd)
out = stdout.read().decode('utf-8', errors='replace')
err = stderr.read().decode('utf-8', errors='replace')
print(out)
if err:
    print("--- STDERR ---", file=sys.stderr)
    print(err, file=sys.stderr)

ssh.close()
