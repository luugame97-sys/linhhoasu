import getpass
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.116.105.154', username='root', password=getpass.getpass('VPS password (not logged): '), look_for_keys=False, allow_agent=False, timeout=15)
try:
    command = r'''echo PLAYER_SAVE_PERF; f=/root/.pm2/logs/lhs-s1001-out.log; line=$(grep -n '\[WSServer\] runtime ready revision=' $f | tail -1 | cut -d: -f1); [ -n "$line" ] && tail -n +$line $f | grep '\[Perf\]\[PlayerSave\]' | tail -30 || true; echo RECENT_PLAYERS; mongosh --quiet "mongodb://127.0.0.1:27017/lhs_s1001" --eval 'db.players.find({}, {userId:1,playerId:1,level:1,updatedAt:1}).sort({updatedAt:-1}).limit(8).forEach(x=>printjson(x))'; echo ERRORS_SINCE_RESTART; [ -n "$line" ] && tail -n +$line $f | grep -Ei 'failed|error|exception|timeout' | tail -30 || true; echo LISTENERS; ss -ltnp | grep -E ':(8080|9200)\b' '''
    _, out, err = ssh.exec_command(command)
    print(out.read().decode('utf-8', 'replace'))
    if out.channel.recv_exit_status() != 0:
        print(err.read().decode('utf-8', 'replace'))
finally:
    ssh.close()
