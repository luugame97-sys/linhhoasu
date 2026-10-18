import getpass

import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.116.105.154', username='root', password=getpass.getpass('VPS password (not logged): '), look_for_keys=False, allow_agent=False, timeout=15)
try:
    command = r'''mongosh --quiet "mongodb://127.0.0.1:27017/lhs_s1001" --eval '
const dbi=db.getSiblingDB("lhs_s1001");
const s=db.serverStatus();
printjson({
  connections:s.connections,
  opcounters:s.opcounters,
  network:s.network,
  wiredTiger:{cache:s.wiredTiger.cache,concurrent:s.wiredTiger.concurrentTransactions},
  mem:s.mem,
  storageEngine:s.storageEngine,
  dbStats:dbi.stats(),
  playerIndexes:dbi.players.getIndexes(),
  playerCount:dbi.players.countDocuments()
});
dbi.players.aggregate([{$collStats:{storageStats:{}}}]).forEach(x=>printjson({storageStats:x.storageStats}));
dbi.players.findOne({}, {userId:1,playerId:1,updatedAt:1,level:1,items:1,currencies:1,taskInfo:1,petInfo:1}).forEach(()=>{});
' 2>&1'''
    _, out, err = ssh.exec_command(command)
    print(out.read().decode('utf-8', 'replace'))
    if out.channel.recv_exit_status() != 0:
        print(err.read().decode('utf-8', 'replace'))
finally:
    ssh.close()
