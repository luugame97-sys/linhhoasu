import paramiko
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('103.116.104.165', 22, 'root', 'anhduc00', timeout=10)

print('=== Ports ===')
stdin, stdout, stderr = client.exec_command('ss -lntp')
ports = stdout.read().decode('utf-8')
for line in ports.split('\n'):
    if any(p in line for p in ['27027', '8080', '9200', '3001', '8082']):
        print(line)

with open('logs_output2.txt', 'w', encoding='utf-8') as f:
    f.write('=== lhs-s1001 ===\n')
    stdin, stdout, stderr = client.exec_command('pm2 logs lhs-s1001 --lines 15 --nostream')
    f.write(stdout.read().decode('utf-8', errors='ignore'))
    f.write('\n=== lhs-dist ===\n')
    stdin, stdout, stderr = client.exec_command('pm2 logs lhs-dist --lines 15 --nostream')
    f.write(stdout.read().decode('utf-8', errors='ignore'))

client.close()
