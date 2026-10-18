<?php
ob_start();session_save_path(dirname(__FILE__));session_id('qaadminswitch'.bin2hex(random_bytes(8)));session_start();
$root=$argv[1];$checks=array();
function check_switch($v,$label){global$checks;if(!$v)throw new RuntimeException($label);$checks[]=$label;}
function gm_get_server($s){return in_array((string)$s,array('1001','1002'),true)?array('name'=>'QA '.$s):false;}
function lhs_api_base($s){if(!gm_get_server($s))throw new RuntimeException('unknown');return'http://127.0.0.1:'.($s==='1001'?'8080':'8083');}
function csrf_token(){if(empty($_SESSION['csrf_token']))$_SESSION['csrf_token']=bin2hex(random_bytes(32));return$_SESSION['csrf_token'];}
function gm_audit_log(){return true;}
function admin_require_rate(){}
class SwitchExit extends Error{public$result;function __construct($r){$this->result=$r;}}
function admin_exit($status,$message='',$extra=array()){throw new SwitchExit(array_merge(array('status'=>$status),$extra));}
require$root.'/web_context.php';
$source=file_get_contents($root.'/admin/admin_api.php');
$start=strpos($source,"    case 'switch_admin_server':")+strlen("    case 'switch_admin_server':");$end=strpos($source,"    case 'resolve_player_target':",$start);$body=preg_replace('/\s*break;\s*$/','',substr($source,$start,$end-$start));
$_SESSION=array('logged_in'=>true,'username'=>'qa_admin','uin'=>'qa_id','role'=>'admin','server_id'=>'1001','server_name'=>'QA 1001','csrf_token'=>bin2hex(random_bytes(32)));
$before=csrf_token();$oldContext=lhs_web_context_token();$current_server_id='1001';$_POST=array('server_id'=>'1002');
try{eval($body);}catch(SwitchExit$e){$r=$e->result;}
check_switch($r['status']==='success'&&$_SESSION['server_id']==='1002','actual switch changes session server');
check_switch($_SESSION['username']==='qa_admin'&&$_SESSION['role']==='admin'&&$_SESSION['uin']==='qa_id','switch preserves authenticated identity and role');
check_switch(csrf_token()!==$before,'switch rotates CSRF');
$_SERVER['HTTP_X_LHS_CONTEXT']=$oldContext;check_switch(!lhs_web_context_matches_request(),'old tab context rejected after switch');
$_SERVER['HTTP_X_LHS_CONTEXT']=lhs_web_context_token();check_switch(lhs_web_context_matches_request(),'new rendered page context accepted');
$_POST=array('server_id'=>'9999');try{eval($body);}catch(SwitchExit$e){$r=$e->result;}
check_switch($r['status']==='error'&&$_SESSION['server_id']==='1002','invalid server cannot change session');
check_switch(strpos($source,"!current_session_is_admin()")!==false&&strpos($source,'lhs_web_context_matches_request()')!==false,'switch remains behind admin and context preamble');
check_switch(strpos($source,"HTTP_X_LHS_ADMIN_UI")!==false,'old admin page revision must reload');
session_destroy();ob_end_clean();echo json_encode(array('result'=>'PASS','checks'=>count($checks),'details'=>$checks,'productionRowsWritten'=>0,'fixture'=>'real isolated PHP session; actual switch body; no game calls'),JSON_UNESCAPED_UNICODE);
