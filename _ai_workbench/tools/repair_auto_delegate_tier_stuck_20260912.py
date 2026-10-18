from pathlib import Path
import base64, json, paramiko
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ROOT = Path(__file__).resolve().parents[1]
lines = (ROOT / 'VPS103.116.105.154.txt').read_text(encoding='utf-8').splitlines()
host, user, password = lines[0].strip(), lines[1].strip(), lines[2].strip()
targets = [
    ('lhs-s1001', 'u_Wk_1001_a7b50c_1788013281963'),
    ('lhs-s1001', 'u_Wk_1001_438577_1788020922745'),
    ('lhs-s1001', 'u_Wk_1001_eee28c_1788539006576'),
    ('lhs-s1002', 'u_Wk_1002_43e350_1788609153618'),
]
js = r'''
const cp=require('child_process'),fs=require('fs');
const pm2=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'}));
const targets=%s;
const script=`const mongoose=require('mongoose');const Player=require('/linhhoasu/lhs/newServer/src/db/models/Player');(async()=>{await mongoose.connect(process.env.MONGO_URI);const ids=JSON.parse(process.env.IDS);const out=[];for(const id of ids){const p=await Player.findOne({userId:id},{userId:1,name:1,serverId:1,boxInfo:1,updatedAt:1,_id:0}).lean();if(!p){out.push({userId:id,status:'missing'});continue;}const b=p.boxInfo||{};const tier=Math.max(1,Number(b.tier)||1),exp=Math.max(0,Number(b.tierExp)||0),up=Math.max(0,Number(b.tierUpTime)||0);const now=Date.now();const stuck=up>0&&up<=now;const filter={userId:id,'boxInfo.tier':tier,'boxInfo.tierExp':exp,'boxInfo.tierUpTime':up};let after=null;if(stuck){after=await Player.findOneAndUpdate(filter,{$set:{'boxInfo.tier':tier+1,'boxInfo.tierExp':0,'boxInfo.tierUpTime':0,'boxInfo.tierUpStartTime':0}},{new:true}).lean();}out.push({before:{userId:p.userId,name:p.name,serverId:p.serverId,boxInfo:b,updatedAt:p.updatedAt},stuck,updated:!!after,after:after&&{userId:after.userId,name:after.name,serverId:after.serverId,boxInfo:after.boxInfo,updatedAt:after.updatedAt}});}console.log(JSON.stringify(out));await mongoose.disconnect();})().catch(e=>{console.error(e.stack||e);process.exit(1)});`;
const grouped={};for(const [name,id] of targets)(grouped[name]??=[]).push(id);
for(const [name,ids] of Object.entries(grouped)){const p=pm2.find(x=>x.name===name);const env={...process.env,...(p?.pm2_env?.env||{}),IDS:JSON.stringify(ids)};const r=cp.spawnSync(process.execPath,['-e',script],{cwd:'/linhhoasu/lhs/newServer',env,encoding:'utf8'});process.stdout.write('=== '+name+' ===\n'+(r.stdout||''));process.stderr.write(r.stderr||'');}
'''
ssh=paramiko.SSHClient(); ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy()); ssh.connect(host,username=user,password=password,look_for_keys=False,allow_agent=False,timeout=20,banner_timeout=20,auth_timeout=20)
try:
    payload=base64.b64encode((js % json.dumps(targets)).encode()).decode()
    cmd=f"echo {payload} | base64 -d | node"
    _,o,e=ssh.exec_command(cmd,timeout=120); out=o.read().decode('utf8','replace'); err=e.read().decode('utf8','replace'); print(out); 
    if err: print('STDERR='+err)
    if o.channel.recv_exit_status(): raise SystemExit(1)
finally: ssh.close()
