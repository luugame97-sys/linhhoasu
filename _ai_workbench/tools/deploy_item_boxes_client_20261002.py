"""Publish verified-box addon before atomically changing the live index."""
from pathlib import Path
import datetime as dt,hashlib,json,shlex,paramiko
from rollback_role_lian_manifest_20260930 import ssh_config
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'_ai_workbench/temp/item_boxes_20261002'
INDEX='/linhhoasu/webgame/game/index.html'
ADDON='/linhhoasu/webgame/game/js/lhs-item-boxes-v1.js'
TOKEN='20261002_verified_boxes_v1'
def sha(x):return hashlib.sha256(x).hexdigest()
def main():
    snap=json.loads((OUT/'snapshot.json').read_text(encoding='utf8'))
    expected=snap['files'][INDEX]['sha256']
    index=(OUT/'candidate/client/index.html').read_bytes();addon=(OUT/'candidate/client/lhs-item-boxes-v1.js').read_bytes()
    after,addon_hash=sha(index),sha(addon)
    assert TOKEN.encode() in index and TOKEN.encode() in addon
    args,kw=ssh_config();assert args[0]=='103.116.104.165'
    c=paramiko.SSHClient();c.set_missing_host_key_policy(paramiko.AutoAddPolicy());c.connect(*args,**kw);s=c.open_sftp()
    stamp=dt.datetime.now(dt.timezone(dt.timedelta(hours=7))).strftime('%Y%m%d_%H%M%S')
    backup='/linhhoasu/_ai_workbench/backups/item_boxes_client_'+stamp
    stage_i=INDEX+'.boxes_'+stamp+'.html';stage_a=ADDON+'.boxes_'+stamp+'.js'
    report={'at':dt.datetime.now(dt.timezone.utc).isoformat(),'backupDir':backup,'directPlayerWrites':0,'pm2Restart':False,'files':{INDEX:{'before':expected,'after':after},ADDON:{'before':None,'after':addon_hash}}};swapped=False
    def run(cmd,timeout=40):
        _,o,e=c.exec_command(cmd,timeout=timeout);raw=o.read();err=e.read();rc=o.channel.recv_exit_status()
        if rc:raise RuntimeError('COMMAND_FAILED:'+str(rc)+':'+err.decode('utf8','replace')[-500:])
        return raw
    def rh(p):
        try:
            with s.open(p,'rb') as f:return sha(f.read())
        except FileNotFoundError:return None
    def served(rel):
        values={}
        for kind,host in [('loopback','http://127.0.0.1:81/'),('public','https://linhhoasu.lol/')]:
            values[kind]=sha(run('curl --compressed --max-time 20 -fsS '+shlex.quote(host+rel+'?v='+TOKEN),25))
        return values
    try:
        assert rh(INDEX)==expected,'INDEX_CAS_DRIFT'
        assert rh(ADDON) is None,'UNEXPECTED_ADDON_EXISTS'
        run('mkdir -m 700 -- '+shlex.quote(backup))
        run('cp -p -- '+shlex.quote(INDEX)+' '+shlex.quote(backup+'/index.html'))
        assert rh(backup+'/index.html')==expected,'BACKUP_HASH'
        for path,data in [(stage_i,index),(stage_a,addon)]:
            with s.open(path,'wb') as f:f.write(data)
            s.chmod(path,0o644)
            assert rh(path)==sha(data),'STAGE_HASH'
        st=s.stat(INDEX);s.chown(stage_i,st.st_uid,st.st_gid);s.chown(stage_a,st.st_uid,st.st_gid)
        run('node --check '+shlex.quote(stage_a))
        assert rh(ADDON) is None,'ADDON_CAS'
        s.posix_rename(stage_a,ADDON);assert rh(ADDON)==addon_hash,'ADDON_LIVE_HASH'
        report['servedAddon']=served('js/lhs-item-boxes-v1.js')
        assert all(h==addon_hash for h in report['servedAddon'].values()),'ADDON_SERVED_HASH'
        assert rh(INDEX)==expected,'INDEX_CAS_BEFORE_SWAP'
        s.posix_rename(stage_i,INDEX);swapped=True
        assert rh(INDEX)==after,'INDEX_LIVE_HASH'
        report['servedIndex']=served('index.html')
        assert all(h==after for h in report['servedIndex'].values()),'INDEX_SERVED_HASH'
        report.update(result='DEPLOYED',completedAt=dt.datetime.now(dt.timezone.utc).isoformat())
    except Exception as err:
        report.update(result='FAILED',error=str(err))
        if swapped:
            try:
                assert rh(INDEX)==after,'ROLLBACK_CAS_DRIFT'
                run('cp -p -- '+shlex.quote(backup+'/index.html')+' '+shlex.quote(stage_i));s.posix_rename(stage_i,INDEX)
                assert rh(INDEX)==expected,'ROLLBACK_HASH';report['rollback']='index_restored'
            except Exception as rb:report['rollbackError']=str(rb)
        raise
    finally:
        (OUT/'release_client').mkdir(exist_ok=True)
        (OUT/'release_client/deployment.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
        for path in [stage_i,stage_a]:
            try:s.remove(path)
            except FileNotFoundError:pass
        s.close();c.close();print(json.dumps(report,ensure_ascii=False,indent=2),flush=True)
if __name__=='__main__':main()
