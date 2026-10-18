"""Transfer only the verified, unclaimed S1 Donate deliveries to Ntl291188 S7."""
import hashlib
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path
from skin_incident_remote import connect, run

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench/temp/ntl291188_s1_to_s7_20261012'
ACCOUNT = 'ntl291188'
OLD_SERVER = '1001'
NEW_SERVER = '1007'
OLD_ROLE = 'u_Wk_1001_36eede_1790474534512'
NEW_ROLE = 'u_Wk_1007_d84fcc_1791030460756'
DELIVERY_IDS = [9817, 9816, 9809, 9808, 9804, 9803, 9801, 9798, 9797, 9795, 9793]
INCIDENT = 'TRANSFER_NTL291188_S1_TO_S7_20261012'

def sha(value): return hashlib.sha256(value.encode('utf-8')).hexdigest()
def event_key(server, source, period): return 'webgm_recharge_' + sha(ACCOUNT + '|' + str(server) + '|' + str(source) + '|' + str(period))

WEB_PREFLIGHT = r'''<?php
require '/linhhoasu/webgame/gm/config.php';
$ids = json_decode(getenv('LHS_TRANSFER_IDS'), true);
$out = array('deliveries'=>array(),'claims'=>array(),'event_claims'=>array());
$marks = implode(',', array_fill(0,count($ids),'?'));
$s=$conn_web->prepare("SELECT * FROM web_reward_deliveries WHERE id IN ($marks) ORDER BY id"); $s->execute($ids); $out['deliveries']=$s->fetchAll(PDO::FETCH_ASSOC);
$s=$conn_web->prepare("SELECT * FROM recharge_milestone_claims WHERE account_name=? AND server_id=? AND created_at>=? ORDER BY id"); $s->execute(array('ntl291188','1001','2026-10-12 11:24:00')); $out['claims']=$s->fetchAll(PDO::FETCH_ASSOC);
$s=$conn_web->prepare("SELECT * FROM donate_event_claims WHERE delivery_id IN ($marks) ORDER BY id"); $s->execute($ids); $out['event_claims']=$s->fetchAll(PDO::FETCH_ASSOC);
echo json_encode($out,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
?>'''

def game_preflight(ssh, old_keys, new_keys):
    script = '''const {MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
const oldKeys=__OLD__,newKeys=__NEW__,account='ntl291188',oldRole='u_Wk_1001_36eede_1790474534512',newRole='u_Wk_1007_d84fcc_1791030460756';
(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017',{serverSelectionTimeoutMS:5000});await c.connect();try{
const d1=c.db('lhs_s1001'),d7=c.db('lhs_s1007');
const oldMails=await d1.collection('mails').find({userId:oldRole,eventKey:{$in:oldKeys}},{projection:{_id:1,userId:1,eventKey:1,claimed:1,read:1,attachments:1,revocationIncident:1,createdAt:1,title:1,content:1,targetServerId:1}}).toArray();
const oldPlayer=await d1.collection('players').findOne({userId:oldRole},{projection:{_id:0,userId:1,serverId:1,mailClaimLedger:1,level:1}});
const newPlayer=await d7.collection('players').findOne({userId:newRole},{projection:{_id:0,userId:1,accountId:1,serverId:1,level:1,mailClaimLedger:1}});
const newMails=await d7.collection('mails').find({userId:newRole,eventKey:{$in:newKeys}},{projection:{_id:1,eventKey:1,claimed:1,attachments:1}}).toArray();
console.log(JSON.stringify({oldMails,oldPlayer,newPlayer,newMails}));}finally{await c.close()}})().catch(e=>{console.error(e.stack);process.exit(1)})'''.replace('__OLD__',json.dumps(old_keys)).replace('__NEW__',json.dumps(new_keys))
    return json.loads(run(ssh, 'node -', script))

def revoke_old_mails(ssh, old_keys):
    script = '''const {MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
const keys=__KEYS__,userId='u_Wk_1001_36eede_1790474534512',incident='TRANSFER_NTL291188_S1_TO_S7_20261012';
(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017',{serverSelectionTimeoutMS:5000});await c.connect();try{const col=c.db('lhs_s1001').collection('mails');let changed=0;for(const eventKey of keys){const r=await col.updateOne({userId,eventKey,claimed:{$ne:true},revocationIncident:{$exists:false}},{$set:{attachments:[],revocationIncident:incident,revokedAt:new Date(),transferredToServerId:1007,transferredToRoleId:'u_Wk_1007_d84fcc_1791030460756'}});if(r.modifiedCount!==1)throw new Error('MAIL_CAS_FAILED:'+eventKey);changed++;}const check=await col.countDocuments({userId,eventKey:{$in:keys},revocationIncident:incident,attachments:{$size:0}});console.log(JSON.stringify({changed,check}));}finally{await c.close()}})().catch(e=>{console.error(e.stack);process.exit(1)})'''.replace('__KEYS__',json.dumps(old_keys))
    return json.loads(run(ssh, 'node -', script))

MOVE_AND_DISPATCH = r'''<?php
require '/linhhoasu/webgame/gm/config.php'; require_once '/linhhoasu/webgame/gm/reward_delivery.php';
$ids=json_decode(getenv('LHS_TRANSFER_IDS'),true);$account='ntl291188';$old='1001';$new='1007';$oldRole='u_Wk_1001_36eede_1790474534512';$newRole='u_Wk_1007_d84fcc_1791030460756';$incident='TRANSFER_NTL291188_S1_TO_S7_20261012';
// The delivery bridge requires the same account-bound WebGM session guard as
// the authenticated user_api request. This script does not use credentials;
// it only resumes the already reserved, CAS-verified delivery rows.
$_SESSION['username']=$account;$_SESSION['server_id']=$new;
$conn_web->beginTransaction();
try{
 $m=implode(',',array_fill(0,count($ids),'?'));$s=$conn_web->prepare("SELECT * FROM web_reward_deliveries WHERE id IN ($m) FOR UPDATE");$s->execute($ids);$rows=$s->fetchAll(PDO::FETCH_ASSOC);if(count($rows)!==count($ids))throw new RuntimeException('DELIVERY_COUNT_CHANGED');
 foreach($rows as $r)if((string)$r['account_name']!==$account||(string)$r['server_id']!==$old||(string)$r['role_id']!==$oldRole||(string)$r['status']!=='sent')throw new RuntimeException('DELIVERY_PRECONDITION:'.$r['id']);
 foreach($rows as $r){
   if(strpos((string)$r['claim_period'],'event:')===0){$s=$conn_web->prepare('UPDATE donate_event_claims SET server_id=? WHERE delivery_id=? AND account_name=? AND server_id=?');$s->execute(array($new,$r['id'],$account,$old));if($s->rowCount()!==1)throw new RuntimeException('EVENT_CLAIM_UPDATE_CAS:'.$r['id']);}
   else {$s=$conn_web->prepare('UPDATE recharge_milestone_claims SET server_id=? WHERE account_name=? AND server_id=? AND milestone_id=? AND claim_period=?');$s->execute(array($new,$account,$old,$r['source_id'],$r['claim_period']));if($s->rowCount()!==1)throw new RuntimeException('MILESTONE_CLAIM_UPDATE_CAS:'.$r['id']);}
 }
 $s=$conn_web->prepare("UPDATE web_reward_deliveries SET server_id=?,role_id=?,status='pending_delivery',delivered_batches=0,attempts=0,sent_at=NULL,lease_token=NULL,lease_until=NULL,last_error=? WHERE id IN ($m) AND account_name=? AND server_id=? AND role_id=? AND status='sent'");$s->execute(array_merge(array($new,$newRole,$incident),$ids,array($account,$old,$oldRole)));if($s->rowCount()!==count($ids))throw new RuntimeException('DELIVERY_UPDATE_CAS');
 $conn_web->commit();
 $results=array();foreach($ids as $id){$d=lhs_reward_find($conn_web,$id,$account,$new,'recharge');if(!$d)throw new RuntimeException('MOVED_DELIVERY_NOT_FOUND:'.$id);$results[$id]=lhs_reward_dispatch($conn_web,$d);}
 $s=$conn_web->prepare("SELECT id,server_id,role_id,status,delivered_batches,last_error FROM web_reward_deliveries WHERE id IN ($m) ORDER BY id");$s->execute($ids);echo json_encode(array('results'=>$results,'rows'=>$s->fetchAll(PDO::FETCH_ASSOC)),JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
}catch(Throwable $e){if($conn_web->inTransaction())$conn_web->rollBack();throw $e;}
?>'''

RESUME_DISPATCH = r'''<?php
require '/linhhoasu/webgame/gm/config.php'; require_once '/linhhoasu/webgame/gm/reward_delivery.php';
$ids=__IDS__;$account='ntl291188';$new='1007';$_SESSION['username']=$account;$_SESSION['server_id']=$new;
$results=array();foreach($ids as $id){$d=lhs_reward_find($conn_web,$id,$account,$new,'recharge');if(!$d)throw new RuntimeException('MOVED_DELIVERY_NOT_FOUND:'.$id);$results[$id]=lhs_reward_dispatch($conn_web,$d);}
$m=implode(',',array_fill(0,count($ids),'?'));$s=$conn_web->prepare("SELECT id,server_id,role_id,status,delivered_batches,last_error FROM web_reward_deliveries WHERE id IN ($m) ORDER BY id");$s->execute($ids);echo json_encode(array('results'=>$results,'rows'=>$s->fetchAll(PDO::FETCH_ASSOC)),JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
?>'''

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    resume = '--resume' in __import__('sys').argv
    with connect() as ssh:
        if resume:
            pre=json.loads((OUT/'preimage.json').read_text(encoding='utf8'))
            web=pre['web']; old_keys=pre['old_keys']; new_keys=pre['new_keys']; game=game_preflight(ssh,old_keys,new_keys)
            if len(game['oldMails']) != len(DELIVERY_IDS): raise RuntimeError('resume old mail count mismatch')
            if any(m.get('claimed') is True or m.get('attachments') for m in game['oldMails']): raise RuntimeError('resume old mail not revoked safely')
            if game['newMails']: raise RuntimeError('resume target mail already exists')
            revoked={'changed':0,'check':len(game['oldMails']),'resumed':True}
        else:
            # skin_incident_remote.run cannot pass env cleanly; PHP reads IDs from embedded JSON.
            php=WEB_PREFLIGHT.replace("json_decode(getenv('LHS_TRANSFER_IDS'), true)", json.dumps(DELIVERY_IDS))
            web=json.loads(run(ssh,'php',php))
            if len(web['deliveries']) != len(DELIVERY_IDS): raise RuntimeError('delivery set changed')
            expected={str(x) for x in DELIVERY_IDS}
            if {str(r['id']) for r in web['deliveries']} != expected: raise RuntimeError('delivery ids mismatch')
            if any(r['status']!='sent' or r['server_id']!=OLD_SERVER or r['role_id']!=OLD_ROLE for r in web['deliveries']): raise RuntimeError('web precondition failed')
            old_keys=[event_key(OLD_SERVER,r['source_id'],r['claim_period']) for r in web['deliveries']]
            new_keys=[event_key(NEW_SERVER,r['source_id'],r['claim_period']) for r in web['deliveries']]
            game=game_preflight(ssh,old_keys,new_keys)
            if len(game['oldMails']) != len(DELIVERY_IDS): raise RuntimeError('old mail count mismatch')
            if any(m.get('claimed') is True for m in game['oldMails']): raise RuntimeError('old mail already claimed')
            if game['oldPlayer'] and any(k in (game['oldPlayer'].get('mailClaimLedger') or []) for k in [m['_id'] for m in game['oldMails']]): raise RuntimeError('old ledger already claimed')
            if game['newMails']: raise RuntimeError('target mail event keys already exist')
            pre={'at':datetime.now(timezone.utc).isoformat(),'web':web,'game':game,'old_keys':old_keys,'new_keys':new_keys,'ids':DELIVERY_IDS,'old_server':OLD_SERVER,'new_server':NEW_SERVER,'old_role':OLD_ROLE,'new_role':NEW_ROLE,'incident':INCIDENT}
            (OUT/'preimage.json').write_text(json.dumps(pre,ensure_ascii=False,indent=2),encoding='utf8')
            revoked=revoke_old_mails(ssh,old_keys)
            if revoked.get('changed') != len(DELIVERY_IDS) or revoked.get('check') != len(DELIVERY_IDS): raise RuntimeError('revoke readback failed')
        moved_php=(RESUME_DISPATCH.replace('__IDS__',json.dumps(DELIVERY_IDS)) if resume else MOVE_AND_DISPATCH.replace("json_decode(getenv('LHS_TRANSFER_IDS'),true)",json.dumps(DELIVERY_IDS)))
        moved=json.loads(run(ssh,'php',moved_php))
        rows=moved['rows']
        if any(r['status']!='sent' or r['server_id']!=NEW_SERVER or r['role_id']!=NEW_ROLE for r in rows): raise RuntimeError('new delivery status failed')
        post=game_preflight(ssh,old_keys,new_keys)
        if any(m.get('attachments') for m in post['oldMails']): raise RuntimeError('old attachments remain')
        if len(post['newMails']) != len(DELIVERY_IDS) or any(m.get('claimed') is True for m in post['newMails']): raise RuntimeError('new mail readback failed')
        receipt={'at':datetime.now(timezone.utc).isoformat(),'result':'TRANSFER_VERIFIED','revoked':revoked,'moved':moved,'post':post}
        (OUT/'receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2),encoding='utf8')
        print(json.dumps({'result':receipt['result'],'revoked':revoked,'rows':rows,'new_mail_count':len(post['newMails'])},ensure_ascii=False,indent=2))

if __name__=='__main__': main()
