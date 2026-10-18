import getpass
import json

import paramiko


HOST = '103.116.105.154'
ROOT = '/linhhoasu/webgame/gm'


password = getpass.getpass('VPS password (not logged): ')
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username='root', password=password, look_for_keys=False, allow_agent=False, timeout=15)


def run(command):
    _, stdout, stderr = ssh.exec_command(command)
    text = stdout.read().decode('utf-8', 'replace')
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(stderr.read().decode('utf-8', 'replace')[-3000:])
    return text


try:
    php = r'''require "config.php";
$d=json_decode(file_get_contents("assets/item/webshop_catalog.json"),true);
$ids=array(25011,25012,25013,25014,25021,25022,25023,25024,25031,25032,25033,25034,25041,25042,25043,25044,25051,25052,25053,25054,90014,90015,90016,90034,90036,90042,90043,90064,90065,100005,100006,100043);
$m=implode(",",array_fill(0,count($ids),"?"));
$s=$conn_web->prepare("SELECT COUNT(*) FROM webshop_items WHERE item_id IN ($m) AND is_active=1");$s->execute($ids);
echo json_encode(array("catalog_gem"=>($d["sort_groups"]["gem"]["enabled"]??null),"catalog_rare"=>($d["sort_groups"]["rare"]["enabled"]??null),"active_targets"=>(int)$s->fetchColumn(),"policy"=>array("gem"=>webshop_item_sale_enabled(25011),"rare"=>webshop_item_sale_enabled(90014),"normal"=>webshop_item_sale_enabled(2))));'''
    readback = run(f"cd {ROOT} && php -r '{php}'")
    data = json.loads(readback[readback.find('{'):])
    if data != {'catalog_gem': True, 'catalog_rare': True, 'active_targets': 32, 'policy': {'gem': True, 'rare': True, 'normal': True}}:
        raise RuntimeError(f'webshop readback failed: {readback}')
    endpoints = run("for u in http://127.0.0.1:88/ http://127.0.0.1:88/api/user_api.php http://127.0.0.1:81/web-panel/ http://127.0.0.1:81/web-panel/assets/item/webshop_catalog.json; do curl -sS -o /dev/null -w '%{http_code} %{url_effective}\\n' $u; done").strip().splitlines()
    ready = run("curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ready").strip()
    health = run("curl -fsS http://127.0.0.1:9200/health | head -c 500").strip()
    print(json.dumps({'result': 'ok', 'readback': data, 'endpoints': endpoints, 'ready': ready, 'health': health}, ensure_ascii=False, indent=2))
finally:
    ssh.close()
