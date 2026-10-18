"""Stage/test delta; publish only guarded source hashes, no service restart."""
import hashlib
import json
import pathlib
import sys
import paramiko

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench/temp/recharge_event_candidate'
SOURCE = ROOT / 'linhhoasu/webgame/gm'
REMOTE = '/linhhoasu/webgame/gm'
STAGE = '/linhhoasu/_ai_workbench/temp/recharge_event_candidate_20260922'
FILES = ['index.php','admin/index.php','admin/admin_api.php','api/user_api.php','assets/js/admin.js','assets/js/index.js','reward_delivery.php','donate_events.php']
def sha(data): return hashlib.sha256(data).hexdigest()
def connect():
    p = (ROOT/'_ai_workbench/VPS103.116.105.154.txt').read_text().splitlines()
    c=paramiko.SSHClient(); c.load_system_host_keys(); c.set_missing_host_key_policy(paramiko.RejectPolicy())
    c.connect(p[0],username=p[1],password=p[2],timeout=15,look_for_keys=False,allow_agent=False)
    return c
def run(c, cmd, data=None):
    i,o,e=c.exec_command(cmd,timeout=45)
    if data is not None: i.write(data); i.channel.shutdown_write()
    out=o.read().decode('utf-8','replace'); err=e.read().decode('utf-8','replace')
    if o.channel.recv_exit_status(): raise RuntimeError(out+err)
    return out+err
def main():
    sys.stdout.reconfigure(encoding='utf-8')
    c=connect(); s=c.open_sftp()
    try:
        mode=sys.argv[1]
        if mode=='stage':
            state={}
            for f in FILES:
                state[f]=sha(s.open(REMOTE+'/'+f,'rb').read())
                s.put(str(SOURCE/f),STAGE+'/'+f); s.chmod(STAGE+'/'+f,0o644)
            (OUT/'before_finalize.json').write_text(json.dumps(state,indent=2))
            print(run(c,' && '.join('php -l '+STAGE+'/'+f for f in FILES if f.endswith('.php'))))
        elif mode=='test':
            s.put(str(ROOT/'_ai_workbench/tools/test_donate_events_20260922.php'),STAGE+'/test_event_fixture.php')
            bootstrap=(ROOT/'_ai_workbench/tools/webshop_schema_probe_20260906.php').read_text().split('$out=array(')[0]
            code=bootstrap+'\n$stage='+json.dumps(STAGE)+';require '+json.dumps(STAGE+'/test_event_fixture.php')+';'
            output=run(c,'php',code)
            (OUT/'fixture_result.txt').write_text(output,encoding='utf-8'); print(output)
        elif mode=='publish':
            count=run(c,"php -r 'require \"/linhhoasu/webgame/gm/config.php\"; echo $conn_web->query(\"SELECT COUNT(*) FROM donate_events\")->fetchColumn();'").strip()
            if count!='0': raise RuntimeError('Event catalog no longer empty; coordinate before publication')
            state=json.loads((OUT/'before_finalize.json').read_text())
            for f in FILES:
                if sha(s.open(REMOTE+'/'+f,'rb').read())!=state[f]: raise RuntimeError('PRODUCTION_DRIFT '+f)
                if sha(s.open(STAGE+'/'+f,'rb').read())!=sha((SOURCE/f).read_bytes()): raise RuntimeError('STAGE_DRIFT '+f)
            # New helper first, APIs next, views last. Empty event catalog means no claims during cutover.
            for f in ['donate_events.php','reward_delivery.php','api/user_api.php','admin/admin_api.php','assets/js/admin.js','assets/js/index.js','admin/index.php','index.php']:
                temp=REMOTE+'/'+f+'.event-install'
                s.put(str(SOURCE/f),temp); s.chmod(temp,0o644); s.posix_rename(temp,REMOTE+'/'+f)
            result={f:sha(s.open(REMOTE+'/'+f,'rb').read()) for f in FILES}
            (OUT/'release_hashes.json').write_text(json.dumps(result,indent=2)); print('Published and readback verified',len(result),'files')
        elif mode=='regression':
            for f in ['test_web_delivery_20260906.php','web_delivery_schema_20260906.sql']:
                s.put(str(ROOT/'_ai_workbench/tools'/f),STAGE+'/'+f)
            bootstrap=(ROOT/'_ai_workbench/tools/webshop_schema_probe_20260906.php').read_text().split('$out=array(')[0]
            code=bootstrap+'\n$argv=array("",'+json.dumps(STAGE)+','+json.dumps(STAGE+'/web_delivery_schema_20260906.sql')+');require '+json.dumps(STAGE+'/test_web_delivery_20260906.php')+';'
            output=run(c,'php',code)
            (OUT/'regression_result.txt').write_text(output,encoding='utf-8'); print(output)
        else: raise RuntimeError('Unknown mode')
    finally: s.close();c.close()
if __name__=='__main__': main()
