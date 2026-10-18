"""Verify the exact config transform and execute transformed pure PHP helpers."""
import json
import pathlib
import subprocess
import sys
from web_multiserver_config_context_patch import apply_config_context_hardening

task_root = pathlib.Path(__file__).resolve().parents[1]
candidate = task_root / 'temp' / 'web_multiserver_20260906' / 'candidate'
source = (candidate.parent / 'config.redacted.php').read_text(encoding='utf-8')
transformed = apply_config_context_hardening(source)
try:
    apply_config_context_hardening(transformed)
except ValueError:
    pass
else:
    raise AssertionError('Double transform must fail on drift')


def php_function(text, name, next_name):
    start = text.index('function ' + name + '(')
    end = text.index('\nfunction ' + next_name + '(', start)
    return text[start:end]


php = r'''<?php
$passed = 0;
function check($v,$label) { global $passed;if(!$v)throw new Exception($label);$passed++;echo 'PASS '.$label.PHP_EOL; }
function rejected($f) { try{$f();return false;}catch(RuntimeException $e){return true;} }
function vht6ur_env($key,$default='') { return $default; }
$quarr=array('1001'=>array('api_base'=>'http://127.0.0.1:8080'),'1002'=>array('api_base'=>'http://127.0.0.1:8083'),'1003'=>array('api_base'=>''));
function gm_get_server($key) { global $quarr;return isset($quarr[(string)$key])?$quarr[(string)$key]:false; }
'''
php += php_function(transformed, 'lhs_api_base', 'lhs_nonce')
php += r'''
$_SESSION=array();$_POST=array('server_id'=>'1002');
check(lhs_api_base()==='http://127.0.0.1:8080','Unauthenticated policy retains explicitly configured primary route');
check(lhs_api_base('1002')==='http://127.0.0.1:8083','Explicit S2 uses S2 API');
check(rejected(function(){lhs_api_base('9999');}),'Unknown explicit server fails closed');
check(rejected(function(){lhs_api_base('');}),'Empty explicit server fails closed');
check(rejected(function(){lhs_api_base('1003');}),'Unconfigured future server cannot fall back to S1');
$_SESSION=array('logged_in'=>true,'server_id'=>'1001');
check(lhs_api_base()==='http://127.0.0.1:8080','Forged POST server cannot override authenticated S1');
$_SESSION['server_id']='1002';check(lhs_api_base()==='http://127.0.0.1:8083','Authenticated S2 uses configured S2 route');
$_SESSION['server_id']='9999';check(rejected(function(){lhs_api_base();}),'Unknown session server fails closed');
unset($_SESSION['server_id']);check(rejected(function(){lhs_api_base();}),'Authenticated missing server fails closed');
class TestSchemaStatement { public $names; function execute($names) {$this->names=$names;} function fetchAll($mode){return $this->names;} }
class TestSchemaDB { public $calls=0;public $stmt;function prepare($sql){$this->calls++;$this->stmt=new TestSchemaStatement();return $this->stmt;} }
$conn_web=new TestSchemaDB();
'''
schema_start = transformed.index('function vht6ur_require_schema()')
schema_end = transformed.index('\ntry {\n    vht6ur_require_schema();', schema_start)
php += transformed[schema_start:schema_end]
php += r'''
vht6ur_require_schema();
check($conn_web->calls===1,'Required schema checked in one SQL round trip');
check(count($conn_web->stmt->names)===13,'Schema guard validates original 10 plus all three required ledger tables');
foreach(array('daily_checkins','daily_checkin_account_claims','web_reward_deliveries') as $table)check(in_array($table,$conn_web->stmt->names,true),'Schema guard includes '.$table);
echo json_encode(array('status'=>'PASS','checks'=>$passed,'scope'=>'transformed pure PHP helpers; no network')).PHP_EOL;
'''
php_exe = sys.argv[1] if len(sys.argv) > 1 else r'C:\xampp\php\php.exe'
run = subprocess.run([php_exe], input=php, encoding='utf-8', capture_output=True)
sys.stdout.write(run.stdout)
sys.stderr.write(run.stderr)
if run.returncode:
    raise SystemExit(run.returncode)
print(json.dumps({'status': 'PASS', 'transform_checks': 2, 'double_apply_rejected': True}))
