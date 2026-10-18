import paramiko
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('103.116.104.165', 22, 'root', 'anhduc00', timeout=10)

with open('logs_output_final.txt', 'w', encoding='utf-8') as f:
    f.write('=== lhs-s1001 ===\n')
    stdin, stdout, stderr = client.exec_command('pm2 logs lhs-s1001 --lines 50 --nostream')
    f.write(stdout.read().decode('utf-8', errors='ignore'))
    f.write('\n=== lhs-dist ===\n')
    stdin, stdout, stderr = client.exec_command('pm2 logs lhs-dist --lines 20 --nostream')
    f.write(stdout.read().decode('utf-8', errors='ignore'))

client.close()
