"""Stage only current non-secret changes, then test using MySQL TEMP clones."""
import hashlib,json,posixpath,shlex,sys
from snapshot_web_multiserver_20260906 import WB,connect,run
ROOT=WB/'temp/web_admin_upgrade_20260907';CAND=ROOT/'candidate';STAGE='/linhhoasu/_ai_workbench/temp/web_admin_upgrade_20260907'
def main():
    sys.stdout.reconfigure(encoding='utf-8');ssh=connect()
    try:
        run(ssh,'install -d -m 700 '+STAGE+'/gm '+STAGE+'/tools')
        with ssh.open_sftp()as f:
            for p in CAND.rglob('*'):
                if not p.is_file()or p.suffix not in ['.php','.js','.css']:continue
                rel=p.relative_to(CAND).as_posix()
                if 'config' in rel.lower():raise RuntimeError('NO_CONFIG_COPY')
                dest=STAGE+'/gm/'+rel;run(ssh,'install -d -m 700 '+shlex.quote(posixpath.dirname(dest)));f.put(str(p),dest)
                if p.suffix=='.php':run(ssh,'php -l '+shlex.quote(dest))
                if p.suffix=='.js':run(ssh,'node --check '+shlex.quote(dest))
            f.put(str(WB/'tools/test_web_admin_upgrade_20260907.php'),STAGE+'/tools/test.php')
            f.put(str(WB/'tools/test_web_admin_monitor_20260907.php'),STAGE+'/tools/test_monitor.php')
            f.put(str(WB/'tools/test_web_admin_switch_20260907.php'),STAGE+'/tools/test_switch.php')
        bootstrap=(WB/'tools/webshop_schema_probe_20260906.php').read_text(encoding='utf-8').split('$out=array(')[0]
        result=json.loads(run(ssh,'php',bootstrap+'\n$argv=array("",'+json.dumps(STAGE+'/gm')+');require '+json.dumps(STAGE+'/tools/test.php')+';'))
        (ROOT/'backend_tests.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps(result,ensure_ascii=False))
        result=json.loads(run(ssh,'php',bootstrap+'\n$argv=array("",'+json.dumps(STAGE+'/gm')+');require '+json.dumps(STAGE+'/tools/test_monitor.php')+';'))
        (ROOT/'monitor_tests.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps(result,ensure_ascii=False))
        result=json.loads(run(ssh,'php '+STAGE+'/tools/test_switch.php '+STAGE+'/gm'))
        (ROOT/'switch_tests.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps(result,ensure_ascii=False))
        (ROOT/'stage.json').write_text(json.dumps({'stage':STAGE,'sourceMutated':False},indent=2)+'\n')
    finally:ssh.close()
if __name__=='__main__':main()
