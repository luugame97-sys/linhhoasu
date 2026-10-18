<?php
// Read-only schema discovery, bootstrap DB without user sessions.
$auditEnv=array();foreach(array('/.env','/linhhoasu/.env','/linhhoasu/webgame/.env','/linhhoasu/webgame/gm/.env')as$file){if(!is_readable($file))continue;foreach(file($file,FILE_IGNORE_NEW_LINES|FILE_SKIP_EMPTY_LINES)as$line){$line=trim($line);if($line===''||$line[0]==='#'||strpos($line,'=')===false)continue;list($k,$v)=explode('=',$line,2);$v=trim($v);if(strlen($v)>1&&(($v[0]==='"'&&substr($v,-1)==='"')||($v[0]==="'"&&substr($v,-1)==="'")))$v=substr($v,1,-1);$auditEnv[trim($k)]=$v;}}
function vht6ur_env($key,$default=''){global$auditEnv;$v=getenv($key);return$v!==false?$v:(isset($auditEnv[$key])?$auditEnv[$key]:$default);}
$config=file_get_contents('/linhhoasu/webgame/gm/config.php');foreach(array('Host','Port','Name','User','Pass')as$k){if(!preg_match('/^\$db'.$k.'\s*=\s*[^\r\n]+;\s*$/m',$config,$m))throw new Exception('DB shape changed');eval(trim($m[0]));}
$pdo=new PDO("mysql:host={$dbHost};port={$dbPort};dbname={$dbName};charset=utf8mb4",$dbUser,$dbPass,array(PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC));
$out=array('php'=>PHP_VERSION,'tables'=>array());foreach(array('webshop_items','webshop_orders','account')as$table){$s=$pdo->query('SHOW CREATE TABLE `'.$table.'`');$out['tables'][$table]=$s->fetch();}
$out['statuses']=$pdo->query('SELECT status,COUNT(*) AS n FROM webshop_orders GROUP BY status')->fetchAll();echo json_encode($out);
