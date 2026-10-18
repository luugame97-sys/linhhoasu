import base64
import json
import paramiko
import sys

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

HOST = "103.116.105.154"
USER = "root"
PASSWORD = "anhduc11"

REMOTE_JS = r'''
const cp=require('child_process');
const pm2=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'}));
const targets=pm2.filter(p=>['lhs-s1001','lhs-s1002'].includes(p.name));
const script=`
const mongoose=require('mongoose');
const Player=require('/linhhoasu/lhs/newServer/src/db/models/Player');
const Account=require('/linhhoasu/lhs/newServer/src/db/models/Account');
const fs=require('fs');
(async()=>{
 await mongoose.connect(process.env.MONGO_URI);
 const cfg=JSON.parse(fs.readFileSync('/linhhoasu/lhs/newServer/scripts/_tables_dump/BoxTierConfig.json','utf8')).data||{};
 const now=Date.now();
 const rows=await Player.find({}, {userId:1,name:1,serverId:1,level:1,boxInfo:1,updatedAt:1,_id:0}).lean();
 const named=await Player.find({$or:[{name:/tathien/i},{userId:/tathien/i},{accountId:/tathien/i}]},{userId:1,name:1,serverId:1,level:1,boxInfo:1,updatedAt:1,accountId:1,_id:0}).lean();
 const accounts=await Account.find({$or:[{accountId:/tathien/i},{'roles.name':/tathien/i},{'roles.userId':/tathien/i}]},{accountId:1,roles:1,activeRoleByServer:1,_id:0}).lean();
 const out=rows.map(p=>{const b=p.boxInfo||{};const tier=Math.max(1,Number(b.tier)||1);const c=cfg[String(tier)]||cfg[tier]||{};const costs=Array.isArray(c.tierUpCost)?c.tierUpCost:[];const exp=Math.max(0,Number(b.tierExp)||0);const up=Number(b.tierUpTime)||0;const expired=up>0&&up<=now;const ready=costs.length>0&&exp>=costs.length;return {userId:p.userId,name:p.name,serverId:p.serverId,level:p.level,tier,tierExp:exp,tierUpTime:up,expired,readyWithoutTimer:ready&&up<=0,stuck:expired||(ready&&up<=0),expectedDropCount:Number(c.count)||1,updatedAt:p.updatedAt};});
 console.log(JSON.stringify({playerCount:out.length,stuck:out.filter(x=>x.stuck),tierCounts:out.reduce((a,x)=>(a[x.tier]=(a[x.tier]||0)+1,a),{}),tier6or7:out.filter(x=>x.tier===6||x.tier===7),nameMatches:out.filter(x=>/tathien/i.test(String(x.name||''))),named,accounts},null,2));
 await mongoose.disconnect();
})().catch(e=>{console.error(e.stack||e);process.exit(1)});
`;
for(const p of targets){const env={...process.env,...(p.pm2_env&&p.pm2_env.env||{})};const r=cp.spawnSync(process.execPath,['-e',script],{env,cwd:'/linhhoasu/lhs/newServer',encoding:'utf8'});process.stdout.write('=== '+p.name+' SERVER_ID='+String(env.SERVER_ID||'')+' ===\n');process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');}
console.log('=== LOG_TAIL ===');
for(const p of targets){const n=p.name;const f='/root/.pm2/logs/'+n+'-out.log';try{const s=cp.execFileSync('bash',['-lc',`echo '[tier-tags]'; grep -E '2150|2151|2152|dropCount' ${f} 2>/dev/null | tail -n 80 || true; echo '[tathien]'; grep -i 'tathien' ${f} 2>/dev/null | tail -n 40 || true`],{encoding:'utf8'});process.stdout.write('--- '+n+' ---\n'+s)}catch(e){}}
'''

def main():
    ssh=paramiko.SSHClient(); ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST,username=USER,password=PASSWORD,look_for_keys=False,allow_agent=False,timeout=20,banner_timeout=20,auth_timeout=20)
    try:
        payload=base64.b64encode(REMOTE_JS.encode()).decode()
        cmd=f"echo {payload} | base64 -d | node"
        _,o,e=ssh.exec_command(cmd,timeout=120)
        out=o.read().decode('utf-8','replace'); err=e.read().decode('utf-8','replace')
        code=o.channel.recv_exit_status()
        print(out)
        if err: print('STDERR='+err)
        if code: raise SystemExit(code)
    finally: ssh.close()

if __name__=='__main__': main()
