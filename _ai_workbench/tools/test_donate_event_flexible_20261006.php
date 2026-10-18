<?php
// Pure RAM fixture: no database connection, sockets, schema changes or real mail.
$source = $argv[1] ?? getenv('LHS_GM_SOURCE') ?: dirname(__DIR__, 2).'/linhhoasu/webgame/gm';
$checks = 0;
function verify($condition, $label) { global $checks; if (!$condition) throw new RuntimeException('FAIL: '.$label); $checks++; }
function rejected($call, $label) { try { $call(); } catch (InvalidArgumentException $e) { verify(true,$label); return; } throw new RuntimeException('Expected rejection: '.$label); }
class RamPDO extends PDO {
    public $events = array(), $claims = array(), $deliveries = array(), $logs = array();
    private $snapshot = null;
    public function __construct() {}
    public function beginTransaction(): bool { if ($this->snapshot !== null) throw new RuntimeException('Nested transaction'); $this->snapshot=serialize(array($this->events,$this->claims,$this->deliveries)); return true; }
    public function commit(): bool { $this->snapshot=null; return true; }
    public function rollBack(): bool { list($this->events,$this->claims,$this->deliveries)=unserialize($this->snapshot); $this->snapshot=null; return true; }
    public function inTransaction(): bool { return $this->snapshot !== null; }
    public function prepare($query, $options = array()) { return new RamStatement($this,$query); }
    public function lastInsertId($name = null) { return (string)max(array_keys($this->events)); }
}
class RamStatement extends PDOStatement {
    private $db, $sql, $rows=array();
    public function __construct($db,$sql) { $this->db=$db; $this->sql=$sql; }
    public function execute($params = null) {
        $p=$params ?? array(); $d=$this->db; $q=$this->sql; $this->rows=array();
        if (str_starts_with($q,'SELECT * FROM donate_events WHERE id=')) $this->rows=isset($d->events[$p[0]]) ? array($d->events[$p[0]]) : array();
        elseif (str_starts_with($q,'SELECT COALESCE(MAX(tier_id)')) { $max=0; foreach($d->claims as $c) if($c['event_id']==$p[0]) $max=max($max,$c['tier_id']); $this->rows=array(array($max)); }
        elseif (str_starts_with($q,'UPDATE donate_events SET title=')) { $id=$p[7]; foreach(array('title','banner_path','starts_at','ends_at','tiers_json','is_active','published_at') as $i=>$key) $d->events[$id][$key]=$p[$i]; $d->events[$id]['edit_version']++; }
        elseif (str_starts_with($q,'INSERT INTO donate_events(')) { $id=count($d->events)+1; $row=array('id'=>$id,'edit_version'=>1); foreach(array('title','banner_path','starts_at','ends_at','tiers_json','is_active','published_at') as $i=>$key) $row[$key]=$p[$i]; $d->events[$id]=$row; }
        elseif (str_starts_with($q,'SELECT * FROM donate_event_claims WHERE')) { foreach($d->claims as $c) if($c['event_id']==$p[0] && $c['tier_id']==$p[1] && $c['account_name']===$p[2]) $this->rows[]=$c; }
        elseif (str_starts_with($q,'INSERT INTO donate_event_claims(')) { $row=array_combine(array('event_id','tier_id','account_name','server_id','delivery_id','qualified_amount'),$p); foreach($d->claims as $c) if($c['event_id']==$p[0] && $c['tier_id']==$p[1] && $c['account_name']===$p[2]) throw new RuntimeException('Duplicate claim'); $d->claims[]=$row; }
        elseif (str_starts_with($q,'SELECT COALESCE(SUM(amount)')) { $total=0; foreach($d->logs as $l) if($l['account']===$p[0] && in_array($l['action'],array('topup_xu','vip'),true) && $l['time'] >= $p[1] && $l['time'] < $p[2] && $l['time'] <= $p[3]) $total+=$l['amount']; $this->rows=array(array($total)); }
        elseif (str_starts_with($q,'SELECT * FROM donate_events WHERE (')) { foreach($d->events as $e) { $has=false; foreach($d->claims as $c) if($c['event_id']==$e['id'] && $c['account_name']===$p[1]) $has=true; if(($e['is_active']==1 && $e['ends_at']>$p[0]) || $has) $this->rows[]=$e; } }
        elseif (str_starts_with($q,'SELECT c.*,d.status FROM donate_event_claims')) { foreach($d->claims as $c) if($c['account_name']===$p[0]) $this->rows[]=array_merge($c,array('status'=>$d->deliveries[$c['delivery_id']]['status'])); }
        else throw new RuntimeException('Unexpected SQL; no fallback connection: '.$q);
        return true;
    }
    public function fetch($mode=PDO::FETCH_BOTH,$cursorOrientation=PDO::FETCH_ORI_NEXT,$cursorOffset=0) { return array_shift($this->rows) ?: false; }
    public function fetchAll($mode=null,$className=null,$ctorArgs=null) { return $this->rows; }
    public function fetchColumn($column=0) { $row=$this->fetch(); return $row===false ? false : array_values($row)[$column]; }
}
if (!function_exists('str_starts_with')) { function str_starts_with($value,$prefix) { return strpos($value,$prefix)===0; } }
function hk_reward_exists($id) { return in_array((int)$id,array(1,4,65),true); }
function donate_reward_amount_valid($id,$amount) { return $amount>0 && $amount<=10000000; }
function lhs_reward_json($value) { return json_encode($value,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR); }
function lhs_reward_identity($account,$server,$role) { if($role['account_id']!==$account || $role['server_id']!==$server) throw new InvalidArgumentException('Wrong owner'); }
function lhs_reward_find($db,$id,$account,$server,$kind) { $d=$db->deliveries[$id] ?? null; return $d && $d['account_name']===$account && $d['server_id']===$server && $d['kind']===$kind ? $d : null; }
function lhs_reward_insert($db,$kind,$account,$server,$source,$period,$role,$label,$snapshot) { $id=count($db->deliveries)+1; return $db->deliveries[$id]=array('id'=>$id,'kind'=>$kind,'account_name'=>$account,'server_id'=>$server,'source_id'=>$source,'claim_period'=>$period,'role_id'=>$role['role_id'],'label'=>$label,'reward_snapshot'=>lhs_reward_json($snapshot),'status'=>'pending_delivery'); }
function parse_donate_reward_items($json) { return json_decode($json,true); }
function vht6ur_item_catalog() { return array(1=>'NB',4=>'Food',65=>'Chicken'); }
function item_icon_image_map($all) { return array(); }
function site_asset_url($url) { return $url; }
function site_logo_image() { return 'logo.png'; }
require $source.'/donate_events.php';
$db=new RamPDO(); $now='2026-10-06 12:00:00';
function tier($amount,$id=0,$quantity=1) { return array('id'=>$id,'amount'=>$amount,'items'=>array(array('item_id'=>1,'amount'=>$quantity))); }
function edit_event($db,$id,$tiers,$now,$overrides=array()) { $input=array_merge($db->events[$id],array('is_active'=>0,'tiers_json'=>json_encode($tiers)),$overrides); return lhs_event_save($db,$input,$now); }
$input=array('id'=>'','title'=>'RAM test','starts_at'=>'2026-10-01T00:00','ends_at'=>'2026-10-10T00:00','is_active'=>0,'banner_path'=>'','tiers_json'=>json_encode(array(tier(100),tier(300))));
$id=lhs_event_save($db,$input,$now); verify($id===1,'new backdated event accepted');
$db->events[$id]['published_at']='2026-10-01 00:00:00'; $db->events[$id]['is_active']=1;
$db->logs[]=array('account'=>'qa','action'=>'topup_xu','amount'=>10000,'time'=>'2026-10-05 12:00:00');
$role=array('role_id'=>'qa_role','account_id'=>'qa','server_id'=>'1001');
$old=lhs_event_reserve($db,'qa','1001',$id,1,$role,$now); $snapshot=$old['reward_snapshot'];
edit_event($db,$id,array(tier(50),tier(100,1,9),tier(300,2)),$now,array('starts_at'=>'2026-09-01T00:00','ends_at'=>'2026-10-20T00:00'));
$rows=json_decode($db->events[$id]['tiers_json'],true);
verify(array_column($rows,'id')===array(3,1,2),'insertion before claimed tier preserves IDs');
verify($db->deliveries[$old['id']]['reward_snapshot']===$snapshot,'editing live rewards preserves reserved snapshot');
verify($db->events[$id]['starts_at']==='2026-09-01 00:00:00','published event time editable');
$db->events[$id]['is_active']=1;
$again=lhs_event_reserve($db,'qa','1001',$id,1,$role,$now); verify($again===$old && count($db->deliveries)===1,'old claim replays unchanged delivery');
$new=lhs_event_reserve($db,'qa','1001',$id,3,$role,$now); verify($new['source_id']===3,'new inserted tier claim resolves stable ID');
$pub=lhs_event_public($db,'qa','1001',$now); verify($pub['events'][0]['tiers'][1]['pending'] && $pub['events'][0]['tiers'][1]['delivery_id']===$old['id'],'public claim remains on original tier');
edit_event($db,$id,array(tier(100,1),tier(300,2)),$now);
edit_event($db,$id,array(tier(75),tier(100,1),tier(300,2)),$now);
verify(json_decode($db->events[$id]['tiers_json'],true)[0]['id']===4,'deleted claimed highest ID never reused');
$again=lhs_event_reserve($db,'qa','1001',$id,3,$role,'2027-01-01 00:00:00'); verify($again===$new,'deleted tier retries old snapshot after expiry/off');
$legacy=array(tier(75),tier(100),tier(300)); edit_event($db,$id,$legacy,$now);
verify(array_column(json_decode($db->events[$id]['tiers_json'],true),'id')===array(4,1,2),'legacy browser missing IDs matches amounts');
$many=array(); for($n=1;$n<=25;$n++) $many[]=tier($n*10);
$input['tiers_json']=json_encode($many); $large=lhs_event_save($db,$input,$now); verify(count(json_decode($db->events[$large]['tiers_json'],true))===25,'more than twenty tiers saved');
$db->events[$large]['is_active']=1; $high=lhs_event_reserve($db,'qa','1001',$large,25,$role,$now); verify($high['source_id']===25,'tier ID above twenty claim accepted');
$stale=$db->events[$id]; $stale['edit_version']--;
rejected(function()use($db,$stale,$now){lhs_event_save($db,$stale,$now);},'stale version');
$bad=$input; $bad['starts_at']='2026-02-30T00:00'; rejected(function()use($db,$bad,$now){lhs_event_save($db,$bad,$now);},'invalid date');
$bad=$input; $bad['tiers_json']='[{"amount":1,"items":[{"item_id":999,"amount":1}]}]'; rejected(function()use($db,$bad,$now){lhs_event_save($db,$bad,$now);},'unknown item');
$bad=$input; $bad['ends_at']=$bad['starts_at']; rejected(function()use($db,$bad,$now){lhs_event_save($db,$bad,$now);},'nonpositive duration');
$bad=$input; $bad['tiers_json']=json_encode(array(tier(1,99))); rejected(function()use($db,$bad,$now){lhs_event_save($db,$bad,$now);},'foreign tier ID');
verify(!$db->inTransaction(),'all rejection transactions closed');
echo json_encode(array('result'=>'PASS','checks'=>$checks,'database_connections'=>0,'network_calls'=>0,'real_mail'=>false,'scope'=>'actual donate_events save/reserve/public with RAM PDO and mocked delivery storage'),JSON_UNESCAPED_SLASHES).PHP_EOL;
