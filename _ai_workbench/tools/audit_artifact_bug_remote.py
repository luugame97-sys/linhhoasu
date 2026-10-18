import getpass
import json

import paramiko


HOST = "103.116.105.154"
REMOTE_AUDIT = r"""
const mongo = require('/linhhoasu/lhs/newServer/src/db/mongo');
const Player = require('/linhhoasu/lhs/newServer/src/db/models/Player');
(async()=>{
  await mongo.connect();
  const rows = await Player.find(
    { $or: [{ name: /nicky/i }, { name: /FangZi/i }, { name: /chichchoe/i }] },
    { userId:1, name:1, level:1, currencies:1, items:1, artifactInfo:1, updatedAt:1, _id:0 }
  ).lean();
  console.log('AUDIT_JSON='+JSON.stringify(rows.map(p=>({
    userId:p.userId,
    name:p.name,
    level:p.level,
    currencies:p.currencies,
    material52:Number(p.items&&p.items['52']||0),
    material53:Number(p.items&&p.items['53']||0),
    material54:Number(p.items&&p.items['54']||0),
    quench191:Number(p.items&&p.items['191']||0),
    quench193:Number(p.items&&p.items['193']||0),
    orb200:Number(p.items&&p.items['200']||0),
    orb205:Number(p.items&&p.items['205']||0),
    artifacts:(p.artifactInfo&&Array.isArray(p.artifactInfo.artifacts)?p.artifactInfo.artifacts:[]).map(a=>({uid:a.uid,id:a.id,level:a.attr&&a.attr.level,value:a.attr&&a.attr.value,count:a.count,quenchLv:a.quenchLv,lock:a.lock})),
    updatedAt:p.updatedAt,
  }))));
})().finally(()=>mongo.disconnect());
"""
REMOTE_WRAPPER = r"""
const cp=require('child_process');
const pm2=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'}));
const p=pm2.find(x=>x.name==='lhs-s1001');
const configured=p&&p.pm2_env&&p.pm2_env.env||{};
const env={...process.env};
for(const key of ['MONGO_URI','CONFIG_BIN_PATH','SERVER_ID']) if(configured[key]!=null) env[key]=configured[key];
const r=cp.spawnSync(process.execPath,process.argv.slice(2),{env,encoding:'utf8'});
process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');process.exit(r.status==null?1:r.status);
"""


def run(ssh, command):
    _stdin, stdout, stderr = ssh.exec_command(command)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(error[-3000:] or output[-3000:])
    return output


def main():
    password = getpass.getpass("VPS password (not logged): ")
    ssh = paramiko.SSHClient(); ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST,username='root',password=password,look_for_keys=False,allow_agent=False,timeout=15)
    audit='/linhhoasu/_ai_workbench/temp/audit_artifact_bug.js'; wrapper='/linhhoasu/_ai_workbench/temp/audit_artifact_wrapper.js'
    try:
        sftp=ssh.open_sftp()
        try:
            with sftp.file(audit,'w') as f:f.write(REMOTE_AUDIT)
            with sftp.file(wrapper,'w') as f:f.write(REMOTE_WRAPPER)
        finally:sftp.close()
        raw=run(ssh,f'node {wrapper} {audit}')
        for line in raw.splitlines():
            line=line.strip()
            if line.startswith('AUDIT_JSON='):print(json.dumps(json.loads(line[len('AUDIT_JSON='):]),ensure_ascii=False,indent=2))
        print('RECENT_TAGS')
        print(run(ssh,"grep -E 'handler enter .*tag=(350[0-7]|640[0-6])|C->S tag=(350[0-7]|640[0-6])' /root/.pm2/logs/lhs-s1001-out.log | tail -n 80 || true"))
    finally:
        try:run(ssh,f'rm -f -- {audit} {wrapper}')
        except Exception:pass
        ssh.close()

if __name__=='__main__':main()
