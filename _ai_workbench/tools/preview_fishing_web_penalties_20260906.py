"""Read only WebGM account/admin/ban rows for the mapped penalty candidates."""
import json
import shlex
import sys
from pathlib import Path
import paramiko
from release_huyenvu_daily_20260906 import run

WB=Path(__file__).resolve().parents[1]


def main():
    sys.stdout.reconfigure(encoding='utf-8');root=Path(sys.argv[1]).resolve()
    assert root.parent==WB/'temp' and root.name.startswith('fishing_penalty_preflight_')
    preflight=json.loads((root/'preflight.json').read_text(encoding='utf-8'))
    accounts=[a['accountId'] for a in preflight['accounts']]
    php="""define('LHS_API_REQUEST',true); require '/linhhoasu/webgame/gm/config.php';
$ids=json_decode(%s,true);$marks=implode(',',array_fill(0,count($ids),'?'));
$conn_web->beginTransaction();
try {
 $q=$conn_web->prepare("SELECT account,status FROM account WHERE account IN ($marks)");$q->execute($ids);$rows=$q->fetchAll(PDO::FETCH_ASSOC);
 $q=$conn_web->prepare("SELECT account_name FROM web_admins WHERE account_name IN ($marks)");$q->execute($ids);$admins=$q->fetchAll(PDO::FETCH_COLUMN);
 $q=$conn_web->prepare("SELECT account_name,active,ban_until,reason,ban_code FROM web_account_bans WHERE account_name IN ($marks)");$q->execute($ids);$bans=$q->fetchAll(PDO::FETCH_ASSOC);
 echo json_encode(array('readOnly'=>true,'accounts'=>$rows,'admins'=>$admins,'bans'=>$bans),JSON_UNESCAPED_UNICODE);
} finally { if($conn_web->inTransaction())$conn_web->rollBack(); }
""" % ("'"+json.dumps(accounts).replace("'","\\'")+"'")
    creds=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines()
    ssh=paramiko.SSHClient();ssh.load_system_host_keys();ssh.set_missing_host_key_policy(paramiko.RejectPolicy());ssh.connect(creds[0].strip(),username='root',password=creds[2],look_for_keys=False,allow_agent=False,timeout=20)
    try:
        result=json.loads(run(ssh,'php -r '+shlex.quote(php),timeout=30))
        (root/'web-preflight.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        sftp=ssh.open_sftp()
        try:
            with sftp.open('/linhhoasu/webgame/gm/config.php','r') as f:source=f.read().decode('utf-8')
        finally:sftp.close()
        begin=source.index('function vht6ur_web_ban_state(');end=source.index('function vht6ur_is_admin(',begin)
        snippet=source[begin:end]
        (root/'web-ban-readonly-reference.php.txt').write_text(snippet,encoding='utf-8')
        print(json.dumps(result,ensure_ascii=False));print(snippet)
    finally:ssh.close()


if __name__=='__main__':main()
