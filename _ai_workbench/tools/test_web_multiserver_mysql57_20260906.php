<?php
// $pdo is supplied by SELECT-only credential bootstrap, never config.php.
// Every table used by fixtures must be connection-local TEMPORARY first.
$qaRoot = $argv[1];
$checks = array();
function mscheck($ok, $label) { global $checks; if (!$ok) throw new RuntimeException($label); $checks[] = $label; }
function gm_get_server($server) { return in_array((string)$server, array('1001','1002','1003'), true) ? array('id'=>$server) : false; }
function msvalue($pdo, $sql, $args = array()) { $s=$pdo->prepare($sql);$s->execute($args);return $s->fetchColumn(); }
$engines = $pdo->query("SELECT table_name,engine,table_collation FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('account','daily_checkins','gm_logs')")->fetchAll();
foreach ($engines as $row) mscheck($row['engine'] === 'InnoDB', 'live '.$row['table_name'].' is transactional');
foreach (array('account','daily_checkins','gm_logs') as $table) {
    $schema = $pdo->query('SHOW CREATE TABLE `'.$table.'`')->fetch(PDO::FETCH_NUM);
    $pdo->exec(preg_replace('/^CREATE TABLE /','CREATE TEMPORARY TABLE ', $schema[1]));
}
$schema = file_get_contents($qaRoot.'/../tools/web_daily_schema_20260906.sql');
$ddl = substr($schema, strpos($schema, 'CREATE TABLE'), strpos($schema, ';', strpos($schema, 'CREATE TABLE')) - strpos($schema, 'CREATE TABLE') + 1);
$pdo->exec(str_replace('CREATE TABLE IF NOT EXISTS', 'CREATE TEMPORARY TABLE', $ddl));
require $qaRoot.'/daily_checkin.php';
$pdo->prepare('INSERT INTO account(account,password_hash,ptb) VALUES(?,?,?)')->execute(array('qa_ms_daily','fixture-not-a-password',77));
$first = lhs_daily_checkin_claim($pdo,'qa_ms_daily','1001',5001,'2026-09-06');
$second = lhs_daily_checkin_claim($pdo,'qa_ms_daily','1002',5001,'2026-09-06');
$third = lhs_daily_checkin_claim($pdo,'qa_ms_daily','1003',5001,'2026-09-06');
mscheck(!$first['duplicate'] && $second['duplicate'] && $third['duplicate'],'one global receipt across three servers');
mscheck(msvalue($pdo,"SELECT ptb FROM account WHERE account='qa_ms_daily'")==='5078','wallet credits configured 5001 once');
mscheck((int)msvalue($pdo,'SELECT COUNT(*) FROM daily_checkins')===1,'one legacy audit row');
mscheck((int)msvalue($pdo,'SELECT COUNT(*) FROM daily_checkin_account_claims')===1,'canonical unique receipt');
mscheck((int)msvalue($pdo,'SELECT COUNT(*) FROM gm_logs')===1,'one transactional audit');
$pdo->prepare('INSERT INTO account(account,password_hash,ptb) VALUES(?,?,?)')->execute(array('qa_ms_legacy','fixture-not-a-password',5001));
$pdo->exec("INSERT INTO daily_checkins(account_name,server_id,claim_date,reward_xu) VALUES('qa_ms_legacy','1001','2026-09-06',5001)");
$legacy=lhs_daily_checkin_claim($pdo,'qa_ms_legacy','1002',5001,'2026-09-06');
mscheck($legacy['duplicate']&&$legacy['xu_web']==='5001','legacy claim blocks new server without backfill');
$next=lhs_daily_checkin_claim($pdo,'qa_ms_legacy','1003',5001,'2026-09-07');
mscheck(!$next['duplicate']&&$next['xu_web']==='10002','next day works');
$pdo->exec("INSERT INTO daily_checkins(account_name,server_id,claim_date,reward_xu) VALUES('qa_ms_legacy','1002','2026-09-06',5001)");
$backfill = substr($schema, strpos($schema, 'INSERT IGNORE INTO'));
$pdo->exec($backfill);
$history = lhs_daily_checkin_status($pdo,'qa_ms_legacy','2026-09-06');
mscheck($history['claimed']&&$history['source_server_id']==='1001','migration keeps first original claim');
mscheck((int)msvalue($pdo,"SELECT COUNT(*) FROM daily_checkins WHERE account_name='qa_ms_legacy' AND claim_date='2026-09-06'")===2,'migration preserves historical duplicates');
mscheck(msvalue($pdo,"SELECT ptb FROM account WHERE account='qa_ms_legacy'")==='10002','migration never credits or claws back history');
$pdo->exec($backfill);
mscheck((int)msvalue($pdo,'SELECT COUNT(*) FROM daily_checkin_account_claims')===3,'migration rerun idempotent');
echo json_encode(array('result'=>'PASS','php'=>PHP_VERSION,'database'=>$pdo->query('SELECT VERSION()')->fetchColumn(), 'checks'=>count($checks),'passedChecks'=>$checks,'productionRowsWritten'=>0,'fixtureIsolation'=>'TEMPORARY tables'),JSON_UNESCAPED_UNICODE);
