"""Sequential incident API execution with persistent per-role checkpoints."""
import json,shlex,sys
from datetime import datetime,timezone
from snapshot_web_multiserver_20260906 import connect,run
from snapshot_donate_revision_20260907 import ROOT
from release_donate_service_20260907 import STAGE
sys.stdout.reconfigure(encoding='utf-8');mode=sys.argv[1]
if mode not in ['preview','apply','verify']:raise RuntimeError('INVALID_MODE')
plan=json.loads((ROOT/'recovery-plan.json').read_text(encoding='utf-8'))
file=ROOT/('execution-'+mode+'.json');result={'mode':mode,'at':datetime.now(timezone.utc).isoformat(),'rows':[],'completed':False}
def save():file.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
ssh=connect()
def call(action,target):
    raw=run(ssh,'node '+STAGE+'/tools/donate_revision_api_20260907.js '+STAGE+'/plan.json '+action+' '+shlex.quote(target['userId']))
    response=json.loads(raw)
    if response['http']!=200 or not response['success']:raise RuntimeError('API_NOT_SUCCESS')
    return response['result']
try:
    if mode=='apply':
        pre=json.loads((ROOT/'execution-preview.json').read_text(encoding='utf-8'))
        if not pre['completed']or len(pre['rows'])!=len(plan['rows']):raise RuntimeError('PREVIEW_NOT_COMPLETE')
    for i,target in enumerate(plan['rows'],1):
        row={'userId':target['userId'],'accountId':target['accountId'],'serverId':target['serverId']}
        if mode=='apply':
            row['convert']=call('convert',target);result['rows'].append(row);save()
            row['send']=call('send',target);save()
        else:
            row['status']=call('status',target)
            if mode=='preview' and not row['status']['receipt'] and not row['status']['enough']:raise RuntimeError('BALANCE_CHANGED')
            if mode=='verify':
                receipt=row['status']['receipt'];mail=row['status']['mail']
                if not receipt or receipt['skill']!=target['skill'] or receipt['chicken']!=target['chicken']or receipt['baoziDelta']!=target['baoziDelta']:raise RuntimeError('RECEIPT_MISMATCH')
                if not mail:raise RuntimeError('MAIL_MISSING')
                expected=[{'id':65,'count':target['chicken']}]+([{'id':4,'count':target['baoziDelta']}]if target['baoziDelta']else[])
                if mail['attachments']!=expected:raise RuntimeError('ATTACHMENT_MISMATCH')
            result['rows'].append(row);save()
        print(json.dumps({'mode':mode,'progress':i,'total':len(plan['rows']),'server':target['serverId']}),flush=True)
    result['completed']=True;result['finishedAt']=datetime.now(timezone.utc).isoformat();save()
    print(json.dumps({'completed':True,'mode':mode,'roles':len(result['rows'])}))
except Exception as e:
    result['error']=str(e);save();raise
finally:ssh.close()
