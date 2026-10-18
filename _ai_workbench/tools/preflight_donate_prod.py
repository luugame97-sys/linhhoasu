import paramiko
import sys

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('103.116.105.154', username='root', password='anhduc11', timeout=15, allow_agent=False, look_for_keys=False)
commands = [
    "mongosh --quiet --host 127.0.0.1 --port 27017 lhs_s1001 --eval 'JSON.stringify(db.mails.aggregate([{\"$match\":{eventKey:{\"$type\":\"string\",\"$gt\":\"\"}}},{\"$group\":{_id:{userId:\"$userId\",eventKey:\"$eventKey\"},n:{\"$sum\":1}}},{\"$match\":{n:{\"$gt\":1}}},{\"$count\":\"duplicates\"}]).toArray())'",
    "mongosh --quiet --host 127.0.0.1 --port 27017 lhs_s1001 --eval 'JSON.stringify(db.mails.getIndexes())'",
    "php /linhhoasu/_ai_workbench/tools/verify_recharge_live.php",
    "pm2 status",
]
for command in commands:
    stdin, stdout, stderr = client.exec_command(command)
    sys.stdout.buffer.write(stdout.read())
    sys.stderr.buffer.write(stderr.read())
    if stdout.channel.recv_exit_status() != 0:
        raise SystemExit(1)
client.close()
