<?php
// Execute exact monitoring handler against connection-local clones of live schema.
$candidate=$argv[1];$conn_web=$pdo;$checks=array();
function monitor_check($value,$label){global$checks;if(!$value)throw new RuntimeException($label);$checks[]=$label;}
function gm_get_server($id){return in_array((string)$id,array('1001','1002'),true)?array('name'=>'QA'):false;}
function extract_monitor_function($source,$name){$tokens=token_get_all($source);$found=false;$out='';$depth=0;$started=false;for($i=0;$i<count($tokens);$i++){if(!$found&&is_array($tokens[$i])&&$tokens[$i][0]===T_FUNCTION){$j=$i+1;while(is_array($tokens[$j])&&$tokens[$j][0]===T_WHITESPACE)$j++;if(is_array($tokens[$j])&&$tokens[$j][1]===$name)$found=true;}if($found){$t=is_array($tokens[$i])?$tokens[$i][1]:$tokens[$i];$out.=$t;if($t==='{'){$depth++;$started=true;}elseif($t==='}'){$depth--;if($started&&$depth===0)return$out;}}}throw new RuntimeException($name);}
class MonitorExit extends Error{public$result;function __construct($v){$this->result=$v;}}
function admin_exit($s,$m='',$e=array()){throw new MonitorExit(array_merge(array('status'=>$s,'message'=>$m),$e));}
function admin_log_error($scope,$e){throw$e;}
function admin_enrich_player_identity($r,&$c){return$r;}
require$candidate.'/admin_management.php';
$source=file_get_contents($candidate.'/admin/admin_api.php');
foreach(array('admin_monitor_union_sql','admin_monitor_period_range')as$name)eval(extract_monitor_function($source,$name));
$start=strpos($source,"    case 'get_monitor_logs':")+strlen("    case 'get_monitor_logs':");$end=strpos($source,"    case 'get_webshop_logs':",$start);$body=substr($source,$start,$end-$start);$body=preg_replace('/\s*break;\s*$/','',$body);
foreach(array('account','sepay_logs','system_event_logs','webshop_orders','webshop_items','gm_logs','login_attempts')as$t){$ddl=$pdo->query('SHOW CREATE TABLE `'.$t.'`')->fetch(PDO::FETCH_NUM)[1];$pdo->exec(preg_replace('/^CREATE TABLE /','CREATE TEMPORARY TABLE ',$ddl));}
$pdo->exec("INSERT INTO account(account,password_hash,sdk_user_id)VALUES('alice','fixture','101'),('alice2','fixture','102')");
$pdo->exec("INSERT INTO sepay_logs(tran_id,account_name,server_id,amount,action)VALUES('q1','alice','1001',10000,'topup_xu'),('q2','alice2','1001',90000,'vip')");
$pdo->exec("INSERT INTO system_event_logs(source,level,status,account_name,server_id,action,message,details)VALUES('sepay_webhook','warning','ignored','alice','1001','duplicate','retry',''),('sepay_webhook','error','manual_review','alice','1001','receipt_conflict','review',''),('sepay_webhook','info','success','alice','1001','topup_xu','notice','')");
function request_monitor($post){global$body,$conn_web;$_POST=$post;try{eval($body);}catch(MonitorExit$e){return$e->result;}throw new RuntimeException('no result');}
$base=array('source_filter'=>'sepay','period'=>'all','search'=>'alice');$r=request_monitor($base);
monitor_check($r['status']==='success'&&$r['summary']['total']===4,'exact account excludes alice2');
monitor_check((int)$r['financial']['lifetime']['total']===10000,'financial total not duplicate success system log');
monitor_check($r['summary']['error_count']===1&&$r['summary']['warning_count']===1,'warning error mutually exclusive');
$r=request_monitor($base+array('quick_status'=>'error'));monitor_check(count($r['data'])===1&&$r['data'][0]['status']==='manual_review','error quicktab includes manual review');
monitor_check($r['summary']['total']===4&&$r['total']===1,'summary stable while filtered row count changes');
$r=request_monitor($base+array('quick_status'=>'warning'));monitor_check(count($r['data'])===1&&$r['data'][0]['status']==='ignored','warning quicktab narrows correct rows');
$r=request_monitor($base+array('quick_status'=>'success'));monitor_check(count($r['data'])===2,'success quicktab returns success ledger and notice');
$r=request_monitor(array('source_filter'=>'sepay','period'=>'all','search'=>'101'));monitor_check(count($r['data'])===4&&$r['financial']['account']==='alice','numeric account search binds same log and financial account');
$r=request_monitor(array('source_filter'=>'sepay','period'=>'all','search'=>''));monitor_check((int)$r['financial']['lifetime']['total']===100000,'total source financial sum counts real receipts only');
echo json_encode(array('result'=>'PASS','checks'=>count($checks),'details'=>$checks,'productionRowsWritten'=>0,'fixture'=>'TEMP actual MySQL schemas and extracted monitor handler'),JSON_UNESCAPED_UNICODE);
