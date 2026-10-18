from pathlib import Path
import paramiko
import sys

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('103.116.105.154', username='root', password='anhduc11', timeout=15, allow_agent=False, look_for_keys=False)
sftp = client.open_sftp()
sftp.put(r'I:\Linhhoasu\server\server\_ai_workbench\tools\verify_remote_php_int.php', '/linhhoasu/_ai_workbench/tools/verify_remote_php_int.php')
sftp.close()
stdin, stdout, stderr = client.exec_command('php /linhhoasu/_ai_workbench/tools/verify_remote_php_int.php')
sys.stdout.buffer.write(stdout.read())
sys.stderr.buffer.write(stderr.read())
client.close()
