"""Read-only lookup for existing QA/test accounts suitable for timed-ban E2E."""

import base64
import getpass
import paramiko

source = r'''
try{require('/linhhoasu/lhs/newServer/node_modules/dotenv').config({path:'/linhhoasu/lhs/newServer/.env'})}catch(_){}
const mongoose=require('/linhhoasu/lhs/newServer/node_modules/mongoose');
const Account=require('/linhhoasu/lhs/newServer/src/db/models/Account');
(async()=>{await mongoose.connect(process.env.MONGO_URI||'mongodb://127.0.0.1:27017/lhs_s1001',{serverSelectionTimeoutMS:7000});const rows=await Account.find({accountId:{$regex:/qa|test|demo|admin/i}}).select({accountId:1,status:1,roles:1,lastLoginTime:1,createdAt:1}).lean();console.log(JSON.stringify(rows.map(a=>({accountId:a.accountId,status:Number(a.status),roles:(a.roles||[]).map(r=>({userId:r.userId,name:r.name,serverId:r.serverId})),lastLoginTime:a.lastLoginTime||0,createdAt:a.createdAt||null}))));await mongoose.disconnect()})().catch(async e=>{console.error(e.stack||String(e));try{await mongoose.disconnect()}catch(_){}process.exit(1)});
'''
encoded = base64.b64encode(source.encode()).decode()
password = getpass.getpass("Production password (not logged): ")
ssh = paramiko.SSHClient(); ssh.load_system_host_keys(); ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
ssh.connect("103.116.105.154", username="root", password=password, look_for_keys=False, allow_agent=False, timeout=20)
try:
    _, stdout, stderr = ssh.exec_command(f"cd /linhhoasu/lhs/newServer && node -e \"eval(Buffer.from('{encoded}','base64').toString('utf8'))\"")
    print(stdout.read().decode("utf-8", "replace"))
    error = stderr.read().decode("utf-8", "replace")
    if error: print(error)
finally:
    ssh.close()
