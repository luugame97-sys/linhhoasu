<?php
// Render unchanged candidate template under explicit QA dependencies, no DB/login.
$_SESSION=array('logged_in'=>true,'role'=>'admin','username'=>'QA preview','uin'=>'qa','server_id'=>'1001','server_name'=>'QA Linh Họa Sư - S1');
class QaRows{function fetchAll(){return array();}}class QaDb{function query($sql){return new QaRows();}}
$conn_web=new QaDb();$quarr=array('1001'=>array('name'=>'QA Linh Họa Sư - S1'),'1002'=>array('name'=>'QA Linh Họa Sư - S2'));
function current_session_is_admin(){return true;}function csrf_token(){return'preview-only';}function csrf_meta_tag(){return'<meta name="csrf-token" content="preview-only">';}
function gm_get_server($s){global$quarr;return isset($quarr[$s])?$quarr[$s]:false;}
function site_asset_url($p,$prefix=''){return$prefix.$p;}function site_absolute_asset_url($p){return'../'.$p;}function site_logo_image(){return'assets/images/logo.svg';}function site_bg_image(){return'assets/images/bg.svg';}
function hk_item_catalog_entries($f){return array(array('id'=>'4','name'=>'Bánh Bao'),array('id'=>'5','name'=>'Điểm kỹ năng'),array('id'=>'65','name'=>'Đùi Gà'));}
function hk_item_catalog_map($f){$r=array();foreach(hk_item_catalog_entries($f)as$x)$r[$x['id']]=$x['name'];return$r;}
function item_icon_image_map($include){return array();}
$root=$argv[1];require$root.'/web_context.php';require$root.'/web_experience.php';
$source=file_get_contents($root.'/admin/index.php');
foreach(array("require_once '../config.php';","require_once '../web_context.php';","require_once '../web_experience.php';",'if(session_status() == PHP_SESSION_NONE) session_start();')as$line)$source=str_replace($line,'',$source);
$source=str_replace('<body','<body data-preview="qa-fixture"',$source);
eval('?>'.$source);
