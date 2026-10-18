<?php
include '../config/config.php';
$if=fopen('player.txt','r');
$items=array();
//$line=fgets($if);
while($line=fgets($if)){
	str_replace(PHP_EOL,'',$line);
	$item=explode(';',$line);
	if(count($item)>=2){
		array_push($items,array('value'=>$item[0],'name'=>$item[1]));
	}
}
fclose($if);
$quarr=array();
foreach($qus as $k => $qu){
    if($qu['hidde']!=true){
	$quarr[$k]=$qu['name'];
}
}
exit(json_encode(array('items'=>$items,'qus'=>$quarr,'gamename'=>$gamename,'namecol'=>$namecol,'copyright'=>$copyright),JSON_UNESCAPED_UNICODE));
