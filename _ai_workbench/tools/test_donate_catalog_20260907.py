"""Execute actual catalog transaction on temporary schema clones, not live data."""
import json,shlex
from snapshot_web_multiserver_20260906 import WB,connect,run
from snapshot_donate_revision_20260907 import ROOT
ssh=connect()
try:
 backup='/linhhoasu/_ai_workbench/backups/donate_revision_20260907_qa_catalog';run(ssh,'install -d -m 700 '+backup)
 with ssh.open_sftp()as f:f.put(str(WB/'tools/apply_donate_catalog_20260907.php'),backup+'/catalog.php')
 bootstrap=(WB/'tools/webshop_schema_probe_20260906.php').read_text(encoding='utf-8').split('$out=array(')[0]
 rows=json.loads((ROOT/'sql-before.json').read_text(encoding='utf-8'))['milestones']
 code=bootstrap+'''\ndate_default_timezone_set('Asia/Ho_Chi_Minh');foreach(array('recharge_milestones','recharge_milestone_claims')as$t){$schema=$pdo->query('SHOW CREATE TABLE `'.$t.'`')->fetch(PDO::FETCH_NUM)[1];$pdo->exec(preg_replace('/^CREATE TABLE /','CREATE TEMPORARY TABLE ',$schema));}
$rows=json_decode('''+json.dumps(json.dumps(rows))+''',true);$keys=array_keys($rows[0]);$s=$pdo->prepare('INSERT INTO recharge_milestones (`'.implode('`,`',$keys).'`) VALUES('.implode(',',array_fill(0,count($keys),'?')).')');foreach($rows as$r)$s->execute(array_values($r));
$argv=array('','apply','''+json.dumps(backup)+''');ob_start();require '''+json.dumps(backup+'/catalog.php')+''';$result=json_decode(ob_get_clean(),true);
if(empty($result['committed'])||$result['skillRows']!==50||$result['weeklyRows']!==15)throw new RuntimeException('COUNTS');
$after=$pdo->query('SELECT * FROM recharge_milestones ORDER BY id')->fetchAll(PDO::FETCH_ASSOC);$checks=3;
foreach($after as$i=>$r){$before=$rows[$i];$a=json_decode($r['reward_items'],true);$b=json_decode($before['reward_items'],true);if((int)$r['is_active']!==1){if($r!==$before)throw new RuntimeException('INACTIVE_CHANGED');continue;}
if(isset($a['5'])||$a['65']!==intdiv($b['5'],10))throw new RuntimeException('SKILL_RATIO');$checks++;
if($r['period_type']==='week'&&(int)$r['milestone_amount']>=400000){if($a['4']!==$b['4']*10)throw new RuntimeException('WEEK_RATIO');}else{if($a['4']!==$b['4'])throw new RuntimeException('OUT_OF_SCOPE_BAOZI');}$checks++;
foreach($b as$id=>$qty)if(!in_array((int)$id,array(4,5,65),true)&&$a[$id]!==$qty)throw new RuntimeException('OTHER_REWARD_CHANGED');$checks++;}
echo json_encode(array('result'=>'PASS','checks'=>$checks,'productionRowsWritten'=>0,'skillRows'=>50,'weekRows'=>15,'php'=>PHP_VERSION,'mysql'=>$pdo->query('SELECT VERSION()')->fetchColumn()));'''
 result=json.loads(run(ssh,'php',code));(ROOT/'catalog-tests.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
finally:ssh.close()
