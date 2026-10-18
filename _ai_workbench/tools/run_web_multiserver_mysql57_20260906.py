"""Run current PHP/MySQL fixtures in connection-local shadow tables only."""
import json
import shlex
from snapshot_web_multiserver_20260906 import OUT, WB, connect, run


def main():
    stage = json.loads((OUT/'stage.json').read_text())['stage']
    tests = ['test_web_multiserver_mysql57_20260906.php','web_daily_schema_20260906.sql','test_web_delivery_20260906.php','web_delivery_schema_20260906.sql','test_web_payment_identity_20260906.php']
    ssh = connect()
    try:
        with ssh.open_sftp() as sftp:
            for name in tests:
                sftp.put(str(WB/'tools'/name), stage+'/tools/'+name)
        bootstrap = (WB/'tools/webshop_schema_probe_20260906.php').read_text(encoding='utf-8').split('$out=array(')[0]
        code = bootstrap + '\n$argv=array("",'+json.dumps(stage+'/gm')+');require '+json.dumps(stage+'/tools/test_web_multiserver_mysql57_20260906.php')+';'
        result = json.loads(run(ssh, 'php', code))
        (OUT/'mysql57_daily_qa.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n',encoding='utf-8')
        print(json.dumps(result, ensure_ascii=False))
        code = bootstrap + '\n$argv=array("",'+json.dumps(stage+'/gm')+','+json.dumps(stage+'/tools/web_delivery_schema_20260906.sql')+');require '+json.dumps(stage+'/tools/test_web_delivery_20260906.php')+';'
        result = json.loads(run(ssh, 'php', code))
        (OUT/'mysql57_delivery_qa.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n',encoding='utf-8')
        print(json.dumps(result, ensure_ascii=False))
        code = bootstrap + '\n$argv=array("",'+json.dumps(stage+'/gm')+');require '+json.dumps(stage+'/tools/test_web_payment_identity_20260906.php')+';'
        result = json.loads(run(ssh, 'php', code))
        (OUT/'mysql57_payment_qa.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n',encoding='utf-8')
        print(json.dumps(result, ensure_ascii=False))
    finally:
        ssh.close()


if __name__ == '__main__':
    main()
