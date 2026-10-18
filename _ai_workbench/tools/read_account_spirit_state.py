import getpass
import json
import time
import paramiko

HOST = "103.116.105.154"
ACCOUNT_ID = "vanduc971"

def run(ssh, cmd):
    _i, o, e = ssh.exec_command(cmd, timeout=60)
    out=o.read().decode('utf-8','replace'); err=e.read().decode('utf-8','replace'); code=o.channel.recv_exit_status()
    if code: raise RuntimeError(err or out)
    return out

def main():
    password=getpass.getpass("VPS password (not logged): ")
    ssh=paramiko.SSHClient(); ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    last=None
    for i in range(3):
        try:
            ssh.connect(HOST,username='root',password=password,look_for_keys=False,allow_agent=False,timeout=30,banner_timeout=30,auth_timeout=30);break
        except Exception as exc:
            last=exc
            if i<2:time.sleep(3)
    else:raise last
    try:
        script="""const mongoose=require('mongoose');const Account=require('./src/db/models/Account');const Player=require('./src/db/models/Player');(async()=>{await mongoose.connect(process.env.MONGO_URI);const a=await Account.findOne({accountId:process.env.ACCOUNT_ID}).select('accountId roles activeRoleByServer lastSelectedServerId').lean();const ids=(a&&a.roles||[]).map(r=>r.userId);const ps=await Player.find({userId:{$in:ids}}).select('userId name items currencies spiritInfo updatedAt').lean();console.log(JSON.stringify({accountId:a&&a.accountId,activeRoleByServer:a&&a.activeRoleByServer,lastSelectedServerId:a&&a.lastSelectedServerId,roles:(a&&a.roles||[]).map(r=>({userId:r.userId,name:r.name,serverId:r.serverId,lastLoginTime:r.lastLoginTime})),players:ps.map(p=>({userId:p.userId,name:p.name,item60:p.items&&p.items[60],item61:p.items&&p.items[61],diamond:p.currencies&&p.currencies.diamond,rank:p.spiritInfo&&p.spiritInfo.rank,level:p.spiritInfo&&p.spiritInfo.level,updatedAt:p.updatedAt}))},null,2));await mongoose.disconnect()})().catch(e=>{console.error(e.message);process.exit(1)})"""
        esc=script.replace("'","'\\''")
        cmd="pid=$(pm2 pid lhs-s1001|tail -1); export MONGO_URI=$(tr '\\0' '\\n' </proc/$pid/environ|sed -n 's/^MONGO_URI=//p'); "+f"export ACCOUNT_ID='{ACCOUNT_ID}'; cd /linhhoasu/lhs/newServer; node -e '{esc}'"
        print(run(ssh,cmd))
    finally:ssh.close()
if __name__=='__main__':main()
