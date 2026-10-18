"""Read-only audit for the reported S8 recharge/pet incident."""
from __future__ import annotations

import json
from pathlib import Path

from skin_incident_remote import connect, run

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "_ai_workbench" / "temp" / "recharge_pet_incident_20261017"

NODE = r'''const fs=require('fs'),crypto=require('crypto');
const {MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
const cfg=require('/linhhoasu/lhs/newServer/src/services/ConfigService');
const tables=cfg.loadAllTables();
const petCfg=tables.PetConfig||{};
const ids=[810101,810201,810301,810401,810501];
const names=Object.fromEntries(ids.map(id=>[id,petCfg[id]?.name||petCfg[String(id)]?.name||null]));
const slimPet=p=>({id:Number(p.id),uid:p.uid??null,level:p.level??p.lv??null,slot:p.slot??null,quality:petCfg[p.id]?.quality??petCfg[String(p.id)]?.quality??null,locked:p.locked??p.lock??null,keys:Object.keys(p||{})});
const compactMail=m=>({id:String(m._id),userId:m.userId??null,title:m.title??null,eventKey:m.eventKey??null,claimed:!!m.claimed,createdAt:m.createdAt??null,attachments:(Array.isArray(m.attachments)?m.attachments:[]).filter(x=>ids.includes(Number(x.id))).map(x=>({id:Number(x.id),count:Number(x.count??x.amount??0),keys:Object.keys(x)})),attachmentCount:Array.isArray(m.attachments)?m.attachments.length:0});
(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017',{serverSelectionTimeoutMS:7000,connectTimeoutMS:7000,socketTimeoutMS:20000,maxPoolSize:2});await c.connect();try{
 const ident=c.db('lhs_s1001');
 const accounts=await ident.collection('accounts').find({$or:[{accountId:/^lemonchanh1$/i},{account:/^lemonchanh1$/i}]},{projection:{_id:0,account:1,accountId:1,roles:1}}).limit(10).toArray();
 const roleRefs=accounts.flatMap(a=>(a.roles||[]).map(r=>({account:a.account??a.accountId??null,userId:r.userId??null,serverId:Number(r.serverId??0),name:r.name??null,roleId:r.roleId??null}))).filter(r=>r.serverId===1008||/^egame2014$/i.test(String(r.name)));
 const db=c.db('lhs_s1008');
 const q={$or:[{accountId:/^lemonchanh1$/i},{account:/^lemonchanh1$/i},{name:/^egame2014$/i},...roleRefs.filter(r=>r.userId).map(r=>({userId:r.userId}))]};
 const projection={_id:0,accountId:1,account:1,userId:1,playerId:1,roleId:1,name:1,serverId:1,level:1,updatedAt:1,petInfo:1,items:1,rechargeInfo:1,moderation:1,mailClaimLedger:1};
 const players=await db.collection('players').find(q,{projection,maxTimeMS:20000}).limit(20).toArray();
 const out={at:new Date().toISOString(),readOnly:true,directPlayerWrites:0,serverId:1008,accountQuery:'lemonchanh1',petIds:ids,petNames:names,config:{petRows:Object.keys(petCfg).length,petConfig:ids.map(id=>({id,name:names[id],quality:petCfg[id]?.quality??petCfg[String(id)]?.quality??null,tag:petCfg[id]?.tag??petCfg[String(id)]?.tag??null}))},identity:{accounts:accounts.map(a=>({account:a.account??null,accountId:a.accountId??null,roles:(a.roles||[]).map(r=>({userId:r.userId??null,serverId:r.serverId??null,name:r.name??null,roleId:r.roleId??null}))})),roleRefs},players:[],mails:[],playerPetCounts:{}};
 for(const p of players){const pets=Array.isArray(p.petInfo?.pets)?p.petInfo.pets:[];const chaos=pets.filter(x=>ids.includes(Number(x.id)));out.players.push({identity:{accountId:p.accountId??null,account:p.account??null,userId:p.userId??null,playerId:p.playerId??null,roleId:p.roleId??null,name:p.name??null,serverId:p.serverId??null,level:p.level??null,updatedAt:p.updatedAt??null},petInfo:{field:p.petInfo?.field??null,nextUid:p.petInfo?.nextUid??null,total:pets.length,chaos:chaos.map(slimPet),allPets:pets.map(slimPet)},items:p.items?Object.fromEntries(ids.map(id=>[String(id),p.items?.[id]??p.items?.[String(id)]??0])):null,mailClaimLedgerTail:Array.isArray(p.mailClaimLedger)?p.mailClaimLedger.slice(-20):[],rechargeInfo:p.rechargeInfo??null,moderationKeys:p.moderation?Object.keys(p.moderation):[]});
  const mails=await db.collection('mails').find({userId:p.userId,$or:[{attachments:{$elemMatch:{id:{$in:ids}}}},{eventKey:/recharge|donate/i},{title:/Donate|mốc|nạp/i}]},{projection:{_id:1,userId:1,title:1,eventKey:1,claimed:1,createdAt:1,attachments:1,claimAt:1,claimedAt:1,receivedAt:1},maxTimeMS:20000}).sort({createdAt:-1}).limit(100).toArray();out.mails.push(...mails.map(m=>({...compactMail(m),claimAt:m.claimAt??null,claimedAt:m.claimedAt??null,receivedAt:m.receivedAt??null})));
 }
 for(const p of players){const n=String(p.name||'');out.playerPetCounts[n||String(p.userId)]=(Array.isArray(p.petInfo?.pets)?p.petInfo.pets:[]).filter(x=>ids.includes(Number(x.id))).length;}
 console.log(JSON.stringify(out));
}finally{await c.close()}})().catch(e=>{console.error(e.stack||String(e));process.exitCode=1});'''

PHP = r'''<?php
$auditEnv=array();foreach(array('/.env','/linhhoasu/.env','/linhhoasu/webgame/.env','/linhhoasu/webgame/gm/.env') as $file){if(!is_readable($file))continue;foreach(file($file,FILE_IGNORE_NEW_LINES|FILE_SKIP_EMPTY_LINES) as $line){$line=trim($line);if($line===''||$line[0]==='#'||strpos($line,'=')===false)continue;list($k,$v)=explode('=',$line,2);$v=trim($v);if(strlen($v)>1&&(($v[0]==='"'&&substr($v,-1)==='"')||($v[0]==="'"&&substr($v,-1)==="'")))$v=substr($v,1,-1);$auditEnv[trim($k)]=$v;}}
$config=file_get_contents('/linhhoasu/webgame/gm/config.php');if(!function_exists('vht6ur_env')){function vht6ur_env($key,$default=''){global $auditEnv;$v=getenv($key);return $v!==false?$v:(isset($auditEnv[$key])?$auditEnv[$key]:$default);}}foreach(array('Host','Port','Name','User','Pass') as $k){if(!preg_match('/^\$db'.$k.'\s*=\s*[^\r\n]+;\s*$/m',$config,$m))throw new Exception('DB shape changed');eval(trim($m[0]));}
$pdo=new PDO("mysql:host={$dbHost};port={$dbPort};dbname={$dbName};charset=utf8mb4",$dbUser,$dbPass,array(PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC));
$out=array('readOnly'=>true,'directWrites'=>0,'at'=>gmdate('c'),'account'=>'lemonchanh1','server'=>'8','milestones'=>array(),'claims'=>array(),'deliveries'=>array(),'events'=>array(),'sepay'=>array());
$q=$pdo->prepare("SELECT id,period_type,title,milestone_amount,amount_required,reward_items,is_active,sort_order FROM recharge_milestones WHERE is_active=1 AND (milestone_amount=500000 OR amount_required=500000) ORDER BY id");$q->execute();$out['milestones']=$q->fetchAll();
$q=$pdo->prepare("SELECT id,event_id,tier_id,account_name,server_id,delivery_id,qualified_amount,created_at FROM donate_event_claims WHERE account_name=? AND server_id IN ('8','1008') ORDER BY id DESC LIMIT 50");$q->execute(array('lemonchanh1'));$out['claims']=$q->fetchAll();
$q=$pdo->prepare("SELECT id,kind,account_name,server_id,source_id,claim_period,role_id,label,status,delivered_batches,attempts,last_error,created_at,sent_at,reward_snapshot FROM web_reward_deliveries WHERE account_name=? AND server_id IN ('8','1008') AND kind='recharge' ORDER BY id DESC LIMIT 100");$q->execute(array('lemonchanh1'));$rows=$q->fetchAll();foreach($rows as &$r){$snap=json_decode($r['reward_snapshot'],true);$r['reward_snapshot']=array('title'=>$snap['title']??null,'content'=>$snap['content']??null,'batches'=>$snap['batches']??null);}unset($r);$out['deliveries']=$rows;
$q=$pdo->query("SELECT id,title,starts_at,ends_at,is_active,published_at,tiers_json FROM donate_events ORDER BY id DESC LIMIT 30");foreach($q->fetchAll() as $r){$t=json_decode($r['tiers_json'],true);$r['tiers_500k']=array_values(array_filter(is_array($t)?$t:array(),function($x){return (int)($x['amount']??0)===500000;}));unset($r['tiers_json']);$out['events'][]=$r;}
$q=$pdo->prepare("SELECT COUNT(*) AS n,COALESCE(SUM(amount),0) AS total,MIN(created_at) AS first_at,MAX(created_at) AS last_at FROM sepay_logs WHERE account_name=? AND action IN ('topup_xu','vip')");$q->execute(array('lemonchanh1'));$out['sepay']=$q->fetch();
echo json_encode($out,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
?>'''

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    with connect() as ssh:
        mongo = json.loads(next(line for line in reversed(run(ssh, 'cd /linhhoasu/lhs/newServer && node -', NODE).splitlines()) if line.startswith('{')))
        sql = json.loads(next(line for line in reversed(run(ssh, 'php', PHP).splitlines()) if line.startswith('{')))
    result = {'at': mongo.get('at'), 'readOnly': True, 'mongo': mongo, 'mysql': sql}
    (OUT / 'live.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'at': result['at'], 'players': len(mongo.get('players', [])), 'mails': len(mongo.get('mails', [])), 'deliveries': len(sql.get('deliveries', [])), 'claims': len(sql.get('claims', [])), 'path': str(OUT / 'live.json'), 'readOnly': True}, ensure_ascii=False))

if __name__ == '__main__':
    main()
