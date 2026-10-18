"""Stage/test/commit only five new month milestones, preserving all old rows."""
import json,shlex,sys
from datetime import datetime,timezone
from snapshot_web_multiserver_20260906 import WB,connect,run
from snapshot_donate_revision_20260907 import ROOT

def main():
    mode=sys.argv[1]
    if mode not in ['test','preview','apply','verify']:raise RuntimeError('MODE')
    statePath=ROOT/'monthly-state.json'
    state=json.loads(statePath.read_text())if statePath.exists()else{'backup':'/linhhoasu/_ai_workbench/backups/donate_monthly20m_20260907_'+datetime.now(timezone.utc).strftime('%H%M%S')}
    if mode=='apply':
        assert json.loads((ROOT/'monthly-test.json').read_text())['result']=='PASS'
        assert json.loads((ROOT/'monthly-reward-test.json').read_text())['result']=='PASS'
    ssh=connect()
    try:
        folder=state['backup'];run(ssh,'install -d -m 700 '+shlex.quote(folder))
        with ssh.open_sftp()as f:
            for source,target in [(WB/'tools/donate_monthly20m_20260907.php','migration.php'),(ROOT/'monthly-extension.json','plan.json'),(ROOT/'resume-catalog.json','catalog.json')]:f.put(str(source),folder+'/'+target)
        code=(WB/'tools/webshop_schema_probe_20260906.php').read_text(encoding='utf-8').split('$out=array(')[0]+'\n$argv=array("",'+json.dumps(folder)+','+json.dumps(mode)+');require '+json.dumps(folder+'/migration.php')+';'
        result=json.loads(run(ssh,'php',code));result['at']=datetime.now(timezone.utc).isoformat()
        (ROOT/('monthly-'+mode+'.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        state['lastMode']=mode;statePath.write_text(json.dumps(state,indent=2)+'\n');print(json.dumps(result))
    finally:ssh.close()
if __name__=='__main__':main()
