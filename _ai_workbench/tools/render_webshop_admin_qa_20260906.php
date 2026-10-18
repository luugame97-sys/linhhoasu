<?php
// Render the actual candidate admin page without loading production config/DB.
$_SESSION=array('logged_in'=>true,'role'=>'admin','username'=>'QA preview','uin'=>'qa','server_id'=>'1001','server_name'=>'S1 preview');
class QaRows{function fetchAll(){return array();}}class QaDb{function query($s){return new QaRows();}}
$conn_web=new QaDb();$quarr=array('1001'=>array('name'=>'S1'));
function current_session_is_admin(){return true;}function csrf_token(){return'preview-only';}function csrf_meta_tag(){return'<meta name="csrf-token" content="preview-only">';}
function site_asset_url($p,$prefix=''){return$prefix.$p;}function site_absolute_asset_url($p){return'../'.$p;}function site_logo_image(){return'assets/images/logo.svg';}function site_bg_image(){return'assets/images/bg.svg';}
function hk_item_catalog_entries($f){return array_map(function($id){return array('id'=>(string)$id,'name'=>'Item '.$id);},array(1,2,4,6,19,24,50,55,60,65,28041,28042,28043,28049));}
function hk_item_catalog_map($f){$r=array();foreach(hk_item_catalog_entries($f)as$x)$r[$x['id']]=$x['name'];return$r;}
function item_icon_image_map($include){return array();}
$source=file_get_contents($argv[1].'/admin/index.php');$source=str_replace("require_once '../config.php';",'',$source);$source=str_replace('if(session_status() == PHP_SESSION_NONE) session_start();','',$source);
eval('?>'.$source);
