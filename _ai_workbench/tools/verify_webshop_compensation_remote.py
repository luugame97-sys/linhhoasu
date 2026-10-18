import getpass
import json

import paramiko


HOST = '103.116.105.154'

password = getpass.getpass('VPS password (not logged): ')
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username='root', password=password, look_for_keys=False, allow_agent=False, timeout=15)


def run(command):
    _, stdout, stderr = ssh.exec_command(command)
    text = stdout.read().decode('utf-8', 'replace')
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(stderr.read().decode('utf-8', 'replace')[-3000:])
    return text


try:
    node = r'''const mongoose=require(process.cwd()+'/node_modules/mongoose');const Mail=require(process.cwd()+'/src/db/models/Mail');(async()=>{await mongoose.connect(process.env.MONGO_URI||'mongodb://127.0.0.1:27017/lhs_s1001');const rows=await Mail.find({eventKey:/^webshop-reward-fix-v2-order-/}).sort({createdAt:1}).lean();console.log(JSON.stringify({count:rows.length,rows:rows.map(r=>({eventKey:r.eventKey,userId:r.userId,claimed:!!r.claimed,attachments:r.attachments,title:r.title}))}));await mongoose.disconnect()})().catch(e=>{console.error(e.stack||e.message);process.exit(1)})'''
    encoded = node.replace('\\', '\\\\').replace('"', '\\"').replace('`', '\\`').replace('$', '\\$')
    raw = run(f'cd /linhhoasu/lhs/newServer && node -e "{encoded}"')
    start = raw.find('{')
    data = json.loads(raw[start:])
    if data.get('count') != 7:
        raise RuntimeError(f'compensation count mismatch: {data}')
    ready = run("curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ready").strip()
    health = run("curl -fsS http://127.0.0.1:9200/health | head -c 700").strip()
    statuses = run("pm2 jlist | node -e \"let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{for(const p of JSON.parse(s)){if(['lhs-s1001','lhs-dist','lhs-admin'].includes(p.name))console.log(p.name,p.pm2_env.status,p.pid,p.pm2_env.restart_time)}})\"").strip()
    print(json.dumps({'result': 'ok', 'compensations': data, 'ready': ready, 'health': health, 'pm2': statuses}, ensure_ascii=False, indent=2))
finally:
    ssh.close()
