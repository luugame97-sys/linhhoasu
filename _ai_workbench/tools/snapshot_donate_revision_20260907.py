"""Read-only exact source + SQL/Mongo evidence for owner-approved Donate revision."""
import hashlib,json,shlex,sys
from datetime import datetime,timezone
from snapshot_web_multiserver_20260906 import WB,connect,run

ROOT=WB/'temp/donate_revision_20260907';APP='/linhhoasu/lhs/newServer';WEB='/linhhoasu/webgame/gm'
FILES=['src/net/HTTPServer.js','src/services/PlayerService.js','src/services/PlayerMutationService.js','src/services/PlayerGrantService.js','src/services/RewardGrantService.js','src/handlers/mail.js','src/handlers/upgrade.js','src/db/models/Player.js','src/db/models/Mail.js','src/net/WSServer.js','src/services/FishingFreeRecoveryService.js','src/utils/internalAuth.js']

def main():
    sys.stdout.reconfigure(encoding='utf-8');ROOT.mkdir(parents=True,exist_ok=False);ssh=connect()
    try:
        manifest={'at':datetime.now(timezone.utc).isoformat(),'sources':{}}
        with ssh.open_sftp()as f:
            for base,files,sub in [(APP,FILES,'app'),(WEB,['api/user_api.php','admin/admin_api.php','reward_delivery.php','web_experience.php'],'web')]:
                for rel in files:
                    with f.open(base+'/'+rel,'rb')as remote:content=remote.read()
                    for tree in ['baseline','candidate']:
                        p=ROOT/tree/sub/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(content)
                    manifest['sources'][base+'/'+rel]=hashlib.sha256(content).hexdigest()
        bootstrap=(WB/'tools/webshop_schema_probe_20260906.php').read_text(encoding='utf-8').split('$out=array(')[0]
        script=bootstrap+'''\n$pdo->exec("SET time_zone='+07:00'");$pdo->exec('SET SESSION TRANSACTION READ ONLY');$pdo->beginTransaction();$out=array();
$out['milestones']=$pdo->query('SELECT * FROM recharge_milestones ORDER BY id')->fetchAll();
$out['claims']=$pdo->query('SELECT * FROM recharge_milestone_claims ORDER BY id')->fetchAll();
$out['deliveries']=$pdo->query("SELECT * FROM web_reward_deliveries WHERE kind='recharge' ORDER BY id")->fetchAll();
$out['audit']=$pdo->query("SELECT id,account_name,server_id,target_role_id,details,created_at FROM gm_logs WHERE action='recharge_milestone' ORDER BY id")->fetchAll();
$out['flags']=$pdo->query("SELECT setting_key,setting_value FROM web_settings WHERE setting_key IN ('recharge_rewards_enabled')")->fetchAll();
$pdo->rollBack();echo json_encode($out,JSON_UNESCAPED_UNICODE);'''
        sql=json.loads(run(ssh,'php',script));(ROOT/'sql-before.json').write_text(json.dumps(sql,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        script=r'''const {MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');const cp=require('child_process');
(async()=>{const client=new MongoClient('mongodb://127.0.0.1:27017');await client.connect();try{let result={at:new Date().toISOString(),servers:{}};
for(const id of[1001,1002]){const db=client.db('lhs_s'+id);const mails=await db.collection('mails').find({$or:[{eventKey:/^webgm_recharge_/},{title:/Donate/},{content:/Mốc .*kỳ.*ID/}]},{projection:{userId:1,title:1,content:1,eventKey:1,attachments:1,claimed:1,read:1,createdAt:1,expireAt:1,targetServerId:1}}).toArray();
const users=[...new Set(mails.map(m=>m.userId))];const players=await db.collection('players').find({userId:{$in:users}},{projection:{userId:1,playerId:1,accountId:1,name:1,serverId:1,isBot:1,'items.4':1,'items.5':1,'items.65':1,mailClaimLedger:1,moderation:1}}).toArray();result.servers[id]={mails,players};}
result.pm2=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'})).filter(p=>/^lhs-/.test(p.name)).map(p=>({name:p.name,pid:p.pid,restarts:p.pm2_env.restart_time,status:p.pm2_env.status,cwd:p.pm2_env.pm_cwd}));console.log(JSON.stringify(result));}finally{await client.close()}})().catch(e=>{console.error(e.name+':'+e.message);process.exitCode=1;});'''
        mongo=json.loads(run(ssh,'node -',script));(ROOT/'mongo-before.json').write_text(json.dumps(mongo,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        manifest['sqlSha256']=hashlib.sha256((ROOT/'sql-before.json').read_bytes()).hexdigest();manifest['mongoSha256']=hashlib.sha256((ROOT/'mongo-before.json').read_bytes()).hexdigest();manifest['pm2']=mongo['pm2']
        (ROOT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
        print(json.dumps({'root':str(ROOT),'milestones':len(sql['milestones']),'claims':len(sql['claims']),'deliveries':len(sql['deliveries']),'audit':len(sql['audit']),'servers':{k:{'mails':len(v['mails']),'players':len(v['players'])}for k,v in mongo['servers'].items()},'sources':len(manifest['sources']),'readOnly':True}))
    finally:ssh.close()
if __name__=='__main__':main()
