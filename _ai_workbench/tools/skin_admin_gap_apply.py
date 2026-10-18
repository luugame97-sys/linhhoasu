"""Preflight, send missing fashion mail batches, and verify persistence."""
import json
from pathlib import Path
from skin_incident_remote import connect, run

ROOT=Path(__file__).resolve().parents[2]
manifest=json.loads((ROOT/'_ai_workbench/temp/skin2026lhs_gap_manifest.json').read_text(encoding='utf-8-sig'))
local_receipt=ROOT/'_ai_workbench/temp/skin2026lhs_incident'
remote_manifest='/linhhoasu/_ai_workbench/temp/skin2026lhs_gap_manifest.json'

with connect() as client:
    sftp=client.open_sftp()
    data=json.dumps(manifest,ensure_ascii=False,separators=(',',':')).encode()
    with sftp.open(remote_manifest,'wb') as handle:
        handle.write(data)
    sftp.chmod(remote_manifest,0o600)
    sftp.close()

    pre=json.loads(run(client,'node -',(ROOT/'_ai_workbench/tools/skin_admin_gap_preflight.js').read_text(encoding='utf-8')))
    (local_receipt/'gap_preflight.json').write_text(json.dumps(pre,ensure_ascii=False,indent=2),encoding='utf-8')
    sent=json.loads(run(client,'php',(ROOT/'_ai_workbench/tools/skin_admin_gap_send.php').read_text(encoding='utf-8')))
    (local_receipt/'gap_send_receipt.json').write_text(json.dumps(sent,ensure_ascii=False,indent=2),encoding='utf-8')
    post=json.loads(run(client,'node -',(ROOT/'_ai_workbench/tools/skin_admin_gap_postcheck.js').read_text(encoding='utf-8')))
    (local_receipt/'gap_postcheck.json').write_text(json.dumps(post,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'preflight':{'expectedMissing':pre.get('expectedMissing'),'currentMissing':pre.get('currentMissing')},'send':{'batchCount':sent.get('batchCount'),'attachmentCount':sent.get('attachmentCount'),'createdTotal':sent.get('createdTotal'),'skippedTotal':sent.get('skippedTotal')},'postcheck':{'result':post.get('result'),'actualMailCount':post.get('actualMailCount'),'actualAttachmentCount':post.get('actualAttachmentCount'),'claimed':post.get('claimed'),'exactIds':post.get('exactIds')}},ensure_ascii=False,indent=2))
