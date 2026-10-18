"""Adapt proven disposable-role WS QA to signed local cash callback, no provider money."""
import json,sys
import paramiko
from stage_fashion_fix_20260905 import WB,REL
sys.stdout.reconfigure(encoding='utf-8')
base=(WB/'tools/qa_appearance_live_20260905.js').read_text(encoding='utf-8')
old="""    const rechargeReply = recv((packet) => packet && packet.tag === 1230 && packet.msgUid === 801);
    ws.send(Pack(1230, { id: 11000003, multi: 1 }, 801));
    assert.equal((await rechargeReply).data.result, 0);"""
new="""    const {execFileSync}=require('node:child_process');
    const processes=JSON.parse(execFileSync('pm2',['jlist'],{encoding:'utf8'}));
    const runtime=processes.find(p=>p.name==='lhs-s'+serverId);
    const secret=runtime.pm2_env.API_KEY; assert(secret,'Runtime signing key unavailable');
    const {signInternalRequest}=require('/linhhoasu/lhs/newServer/src/utils/internalAuth');
    const endpoint='/api/internal/recharge';
    const request={userId:dbUid,orderId:'qa-cash-fashion-'+uid,productId:'11000003',amount:6,channel:'qa-local-fixture',idempotentSuccess:true};
    async function callback(){const timestamp=Date.now(),nonce=crypto.randomBytes(16).toString('hex');
      const signature=signInternalRequest({secret,method:'POST',path:endpoint,timestamp,nonce,body:request});
      const response=await fetch('http://127.0.0.1:'+(serverId===1002?8083:8080)+endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-Api-Key':secret,'X-Timestamp':String(timestamp),'X-Nonce':nonce,'X-Signature':signature},body:JSON.stringify(request)});
      return response.json();}
    assert.equal((await callback()).success,true);
    const equipAfterCash=recv(p=>p.tag===1801&&p.msgUid===801);
    ws.send(Pack(1801,{id:29001,type:301,set:0},801));
    assert.equal((await equipAfterCash).data.result,0,'cash ownership must exist in live session');
    assert.equal((await callback()).duplicate,true);"""
assert old in base
base=base.replace(old,new).replace('result: \'PASS\', checks: 45, serverId, dbName,',"result: 'PASS', checks: 48, serverId, dbName, cashCallback: true, immediateLiveEquip: true, cashDuplicate: true, upstreamPayment: false,")
base=base.replace('    await players.deleteMany({ userId: dbUid });',"    await database.collection('transactions').deleteMany({userId:dbUid,channel:'qa-local-fixture'});\n    await players.deleteMany({ userId: dbUid });")
base=base.replace('      players: await players.countDocuments({ userId: dbUid }),',"      transactions: await database.collection('transactions').countDocuments({userId:dbUid}),\n      players: await players.countDocuments({ userId: dbUid }),")
base=base.replace('{ players: 0, codes: 0, mails: 0 }','{ transactions: 0, players: 0, codes: 0, mails: 0 }')
c=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
results={}
try:
 for server in[1001,1002]:
  i,o,e=s.exec_command(f'NODE_ENV=test LOG_DIR= QA_SERVER_ID={server} node -',timeout=60);i.write(base);i.channel.shutdown_write();text=o.read().decode('utf-8','replace');err=e.read().decode('utf-8','replace');code=o.channel.recv_exit_status()
  (WB/'logs'/f'fashion_cash_live_s{server}_20260905.log').write_text(text+'\n'+err,encoding='utf-8')
  parsed={line.split('=',1)[0]:json.loads(line.split('=',1)[1])for line in text.splitlines()if line.startswith(('APPEARANCE_LIVE=','APPEARANCE_CLEANUP='))}
  results[str(server)]={'exit':code,'results':parsed};(REL/'cash_live_verification.json').write_text(json.dumps(results,indent=2)+'\n')
  assert code==0,('QA cash failure '+str(server)+' '+err[-1500:]);print(json.dumps({'server':server,'evidence':parsed}),flush=True)
finally:s.close()
