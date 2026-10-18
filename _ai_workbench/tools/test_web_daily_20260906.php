<?php
/**
 * Isolated, real-InnoDB daily check-in integration and concurrency checks.
 * Usage: php test_web_daily_20260906.php /absolute/path/to/daily_checkin.php [evidence.json]
 * Env: LHS_QA_DSN (without dbname), LHS_QA_DB_USER, LHS_QA_DB_PASSWORD.
 * Defaults target the disposable local QA instance, never the live config.
 * Every fixture is created in a new random qa_web_daily_* schema. Only that
 * schema, owned by this invocation, is removed at the end of the run.
 */
declare(strict_types=1);

function gm_get_server($server) {
    $server = (string)$server;
    return in_array($server, array('1001', '1002', '1003'), true)
        ? array('id' => $server, 'name' => 'QA ' . $server) : false;
}

function qa_daily_connect($schema = '') {
    $dsn = getenv('LHS_QA_DSN') ?: 'mysql:host=127.0.0.1;port=33316;charset=utf8mb4';
    if (strpos($dsn, 'mysql:') !== 0 || preg_match('/(?:^|;)\s*dbname\s*=/i', $dsn)) {
        throw new RuntimeException('QA DSN must be MySQL and must not select an existing database.');
    }
    if ($schema !== '' && !preg_match('/^qa_web_daily_[0-9]+_[a-f0-9]{12}$/D', $schema)) {
        throw new RuntimeException('Refusing non-QA database name.');
    }
    $user = getenv('LHS_QA_DB_USER');
    $pass = getenv('LHS_QA_DB_PASSWORD');
    $db = new PDO($dsn . ($schema === '' ? '' : ';dbname=' . $schema),
        $user === false ? 'root' : $user, $pass === false ? '' : $pass,
        array(PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false));
    $db->exec("SET time_zone='+07:00'");
    $db->exec('SET SESSION innodb_lock_wait_timeout=8');
    $db->exec('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    return $db;
}

function qa_daily_scalar(PDO $db, $sql, array $params = array()) {
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchColumn();
}

function qa_daily_check($condition, $label) {
    global $qaChecks;
    if (!$condition) throw new RuntimeException('ASSERT: ' . $label);
    $qaChecks[] = $label;
}

function qa_daily_rejected(callable $call, $label) {
    try {
        $call();
    } catch (Throwable $error) {
        qa_daily_check(true, $label);
        return $error;
    }
    throw new RuntimeException('Expected rejection: ' . $label);
}

function qa_daily_add_account(PDO $db, $name, $balance = 0, $status = 'active') {
    $db->prepare('INSERT INTO account(account,password_hash,ptb,status) VALUES(?,?,?,?)')
        ->execute(array($name, 'qa-not-a-login-password', $balance, $status));
}

function qa_daily_counts(PDO $db, $account) {
    $values = array('wallet' => (string)qa_daily_scalar($db, 'SELECT ptb FROM account WHERE account=?', array($account)));
    foreach (array('daily_checkins', 'daily_checkin_account_claims', 'gm_logs') as $table) {
        $values[$table] = (int)qa_daily_scalar($db, 'SELECT COUNT(*) FROM `' . $table . '` WHERE account_name=?', array($account));
    }
    return $values;
}

function qa_daily_spawn($helper, $schema, $account, $server, $date) {
    $command = array(PHP_BINARY, __FILE__, '--worker', $helper, $schema, $account, $server, $date);
    $process = proc_open($command, array(0 => array('pipe', 'r'), 1 => array('pipe', 'w'), 2 => array('pipe', 'w')), $pipes);
    if (!is_resource($process)) throw new RuntimeException('Cannot start concurrent PHP worker.');
    stream_set_timeout($pipes[1], 12);
    $ready = fgets($pipes[1]);
    if (trim((string)$ready) !== 'READY') {
        $error = stream_get_contents($pipes[2]);
        proc_terminate($process);
        throw new RuntimeException('Concurrent worker did not become ready: ' . $error);
    }
    return array('process' => $process, 'pipes' => $pipes);
}

function qa_daily_finish(array $worker) {
    fclose($worker['pipes'][0]);
    $output = stream_get_contents($worker['pipes'][1]);
    $error = stream_get_contents($worker['pipes'][2]);
    fclose($worker['pipes'][1]);
    fclose($worker['pipes'][2]);
    $code = proc_close($worker['process']);
    $result = json_decode(trim($output), true);
    if ($code !== 0 || !is_array($result) || isset($result['error'])) {
        throw new RuntimeException('Concurrent worker failed: ' . trim($output . ' ' . $error));
    }
    return $result;
}

function qa_daily_api($helper, $schema, $case) {
    $process = proc_open(array(PHP_BINARY, __FILE__, '--api-worker', $helper, $schema, $case),
        array(0 => array('pipe', 'r'), 1 => array('pipe', 'w'), 2 => array('pipe', 'w')), $pipes);
    if (!is_resource($process)) throw new RuntimeException('Cannot start API fixture worker.');
    fclose($pipes[0]);
    $output = stream_get_contents($pipes[1]);
    $error = stream_get_contents($pipes[2]);
    fclose($pipes[1]); fclose($pipes[2]);
    $code = proc_close($process);
    $result = json_decode(trim($output), true);
    if ($code !== 0 || !is_array($result) || !isset($result['status'])) {
        throw new RuntimeException('API fixture failed: ' . trim($output . ' ' . $error));
    }
    return $result;
}

// Minimal config substitutes for the CLI API fixture. The actual API file,
// actual context helper, and actual daily helper are executed unchanged;
// live database/bootstrap, rate-limit, and ban dependencies are not included.
function csrf_token() { return $_SESSION['csrf_token']; }
function csrf_validate_request() {
    $provided = $_POST['csrf_token'] ?? ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    return is_string($provided) && $provided !== '' && !empty($_SESSION['csrf_token'])
        && hash_equals($_SESSION['csrf_token'], $provided);
}
function web_message_vi($message) { return $message; }
function maintenance_mode_enabled() { return false; }
function current_session_is_admin() { return false; }
function api_rate_limit_exceeded($bucket, $limit, $seconds) { return false; }
function web_setting_enabled($key) { return ($GLOBALS['qaApiCase'] ?? '') !== 'feature_disabled'; }
function daily_checkin_reward_xu() { return 5000; }
function system_event_log() {}
function gm_audit_log($role, $action, $details) {
    global $conn_web;
    $conn_web->prepare('INSERT INTO gm_logs(account_name,server_id,target_role_id,action,details) VALUES(?,?,?,?,?)')
        ->execute(array($_SESSION['username'], $_SESSION['server_id'], $role, $action, $details));
    return true;
}
function vht6ur_login_required() {
    global $conn_web;
    $status = qa_daily_scalar($conn_web, 'SELECT status FROM account WHERE account=?', array($_SESSION['username']));
    if ($status !== 'active') api_exit('error', 'QA fixture account is unavailable.', array('login_required' => 1));
}

if (($argv[1] ?? '') === '--api-worker') {
    $helper = $argv[2];
    $schema = $argv[3];
    $qaApiCase = $argv[4];
    require $helper;
    require dirname($helper) . '/web_context.php';
    $conn_web = qa_daily_connect($schema);
    $_SESSION = array('logged_in' => true, 'username' => 'qa_api', 'uin' => 'qa_api_id',
        'server_id' => '1001', 'csrf_token' => 'qa-only-csrf-not-a-real-token');
    $_SERVER = array('REQUEST_METHOD' => 'POST', 'REMOTE_ADDR' => '127.0.0.1');
    $_POST = array('action' => 'claim_daily_checkin', 'csrf_token' => csrf_token());
    $_SERVER['HTTP_X_LHS_CONTEXT'] = lhs_web_context_token();
    switch ($qaApiCase) {
        case 'guest': $_SESSION['logged_in'] = false; break;
        case 'empty_account': $_SESSION['username'] = ''; break;
        case 'missing_uin': unset($_SESSION['uin']); break;
        case 'unknown_server': $_SESSION['server_id'] = '99999'; break;
        case 'missing_server': unset($_SESSION['server_id']); break;
        case 'array_server': $_SESSION['server_id'] = array('1001'); break;
        case 'csrf_missing': unset($_POST['csrf_token']); break;
        case 'context_missing': unset($_SERVER['HTTP_X_LHS_CONTEXT']); break;
        case 'stale_server_context': $_SESSION['server_id'] = '1002'; break;
        case 'stale_account_context': $_SESSION['username'] = 'qa_other'; break;
        case 'get_request': $_SERVER['REQUEST_METHOD'] = 'GET'; break;
        case 'post_server_forged': $_POST['server_id'] = '1002'; break;
        case 's2_retry':
            $_SESSION['server_id'] = '1002';
            $_SERVER['HTTP_X_LHS_CONTEXT'] = lhs_web_context_token();
            break;
        case 'form_context':
            $_SESSION['username'] = 'qa_form';
            $_POST['web_context_token'] = lhs_web_context_token();
            unset($_SERVER['HTTP_X_LHS_CONTEXT']);
            break;
        case 'baseline_s1':
        case 'baseline_s2':
            $_SESSION['username'] = 'qa_baseline';
            $_SESSION['server_id'] = $qaApiCase === 'baseline_s1' ? '1001' : '1002';
            break;
    }
    $baselineCase = strpos($qaApiCase, 'baseline_') === 0;
    $source = file_get_contents($baselineCase
        ? dirname(dirname($helper)) . '/baseline/api/user_api.php'
        : dirname($helper) . '/api/user_api.php');
    foreach (array("require_once '../config.php';", "require_once '../web_context.php';") as $bootstrap) {
        if ($baselineCase && $bootstrap === "require_once '../web_context.php';") continue;
        if (substr_count($source, $bootstrap) !== 1) throw new RuntimeException('Unexpected API bootstrap contract.');
        $source = str_replace($bootstrap, '', $source);
    }
    foreach (token_get_all($source) as $token) {
        if (is_array($token) && in_array($token[0], array(T_REQUIRE, T_REQUIRE_ONCE, T_INCLUDE, T_INCLUDE_ONCE), true)) {
            throw new RuntimeException('API fixture refuses unexpected include.');
        }
    }
    eval('?>' . $source);
    exit(3);
}

if (($argv[1] ?? '') === '--worker') {
    try {
        require $argv[2];
        $db = qa_daily_connect($argv[3]);
        echo "READY\n";
        flush();
        if (trim((string)fgets(STDIN)) !== 'GO') throw new RuntimeException('Missing worker start barrier.');
        $started = microtime(true);
        $result = lhs_daily_checkin_claim($db, $argv[4], $argv[5], 5000, $argv[6]);
        $result['elapsed_ms'] = (int)round((microtime(true) - $started) * 1000);
        echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;
        exit(0);
    } catch (Throwable $error) {
        echo json_encode(array('error' => get_class($error), 'message' => $error->getMessage()), JSON_UNESCAPED_UNICODE) . PHP_EOL;
        exit(1);
    }
}

$qaChecks = array();
$schema = 'qa_web_daily_' . getmypid() . '_' . bin2hex(random_bytes(6));
$helper = isset($argv[1]) ? realpath($argv[1]) : false;
$created = false;
$admin = null;
$db = null;
$failure = null;
$concurrency = array();
$result = array('result' => 'FAIL', 'productionRowsWritten' => 0,
    'isolation' => 'new random disposable qa_web_daily_* schema; real InnoDB, separate PHP workers');

try {
    if (!$helper || basename($helper) !== 'daily_checkin.php') throw new RuntimeException('Provide the candidate daily_checkin.php path.');
    require $helper;
    $admin = qa_daily_connect();
    $admin->exec('CREATE DATABASE `' . $schema . '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    $created = true;
    $db = qa_daily_connect($schema);
    $result['databaseVersion'] = (string)$db->query('SELECT VERSION()')->fetchColumn();
    $result['helperSha256'] = hash_file('sha256', $helper);
    $result['database'] = $schema;

    $db->exec("CREATE TABLE account (
        account_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        account VARCHAR(64) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        ptb BIGINT NOT NULL DEFAULT 0,
        status ENUM('active','locked') NOT NULL DEFAULT 'active',
        PRIMARY KEY(account), UNIQUE KEY uniq_account_id(account_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $db->exec("CREATE TABLE daily_checkins (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        account_name VARCHAR(64) NOT NULL,
        server_id VARCHAR(32) NOT NULL DEFAULT '1',
        claim_date DATE NOT NULL,
        reward_xu INT UNSIGNED NOT NULL DEFAULT 0,
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_daily_checkin(account_name,server_id,claim_date),
        KEY idx_daily_checkin_account_date(account_name,claim_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $db->exec("CREATE TABLE daily_checkin_account_claims (
        account_name VARCHAR(64) NOT NULL,
        claim_date DATE NOT NULL,
        source_server_id VARCHAR(32) NOT NULL,
        reward_xu INT UNSIGNED NOT NULL,
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(account_name,claim_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $db->exec("CREATE TABLE gm_logs (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        account_name VARCHAR(64) NOT NULL,
        server_id VARCHAR(32) NOT NULL DEFAULT '1',
        role_id VARCHAR(64) NOT NULL DEFAULT '',
        target_role_id VARCHAR(64) NOT NULL DEFAULT '',
        action VARCHAR(64) NOT NULL,
        details VARCHAR(2000) NOT NULL DEFAULT '',
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $today = '2026-09-06';
    $baselineApi = dirname(dirname($helper)) . '/baseline/api/user_api.php';
    if (is_file($baselineApi)) {
        qa_daily_add_account($db, 'qa_baseline', 93);
        $baseS1 = qa_daily_api($helper, $schema, 'baseline_s1');
        $baseS2 = qa_daily_api($helper, $schema, 'baseline_s2');
        qa_daily_check($baseS1['status'] === 'success' && $baseS2['status'] === 'success', 'baseline actual API reproduces successful S1 then S2 double claim');
        qa_daily_check(qa_daily_counts($db, 'qa_baseline') === array('wallet' => '10093', 'daily_checkins' => 2, 'daily_checkin_account_claims' => 0, 'gm_logs' => 2), 'baseline actual API produces +10000 for one account/day');
        $result['baselineReproduction'] = array('baselineApiSha256' => hash_file('sha256', $baselineApi),
            's1Result' => $baseS1['status'], 's2Result' => $baseS2['status'], 'dailyXuTotal' => 10000,
            'productionRowsWritten' => 0);
    }
    qa_daily_add_account($db, 'qa_sequential', 1234);
    $status = lhs_daily_checkin_status($db, 'qa_sequential', $today);
    qa_daily_check($status['claimed'] === false, 'fresh account is eligible');
    $claim = lhs_daily_checkin_claim($db, 'qa_sequential', '1001', 5000, $today);
    qa_daily_check($claim['claimed'] === true && $claim['duplicate'] === false && $claim['xu_web'] === '6234', 'S1 first claim credits exactly 5000');
    $retry = lhs_daily_checkin_claim($db, 'qa_sequential', '1002', 5000, $today);
    qa_daily_check($retry['duplicate'] === true && $retry['source_server_id'] === '1001' && $retry['xu_web'] === '6234', 'S2 same account/day returns duplicate without another credit');
    $retryThird = lhs_daily_checkin_claim($db, 'qa_sequential', '1003', 5000, $today);
    qa_daily_check($retryThird['duplicate'] === true, 'future configured server shares account entitlement');
    qa_daily_check(qa_daily_counts($db, 'qa_sequential') === array('wallet' => '6234', 'daily_checkins' => 1, 'daily_checkin_account_claims' => 1, 'gm_logs' => 1), 'one wallet credit, canonical receipt, history row and audit row');
    $tomorrow = lhs_daily_checkin_claim($db, 'qa_sequential', '1002', 5000, '2026-09-07');
    qa_daily_check($tomorrow['duplicate'] === false && $tomorrow['xu_web'] === '11234', 'next date independently eligible');
    qa_daily_check(lhs_daily_checkin_status($db, 'qa_sequential', '2026-09-07')['source_server_id'] === '1002', 'source server remains correct audit metadata');

    qa_daily_add_account($db, 'qa_legacy', 10000);
    $legacy = $db->prepare('INSERT INTO daily_checkins(account_name,server_id,claim_date,reward_xu) VALUES(?,?,?,?)');
    $legacy->execute(array('qa_legacy', '1001', $today, 5000));
    $legacyBefore = qa_daily_counts($db, 'qa_legacy');
    $legacyResult = lhs_daily_checkin_claim($db, 'qa_legacy', '1002', 5000, $today);
    qa_daily_check($legacyResult['duplicate'] === true && $legacyResult['source_server_id'] === '1001', 'pre-migration S1 claim blocks fresh S2 claim');
    qa_daily_check(qa_daily_counts($db, 'qa_legacy') === $legacyBefore, 'legacy block does not write receipts or alter old history/wallet');
    $legacy->execute(array('qa_legacy', '1002', $today, 5000));
    $doubleBefore = qa_daily_counts($db, 'qa_legacy');
    $double = lhs_daily_checkin_claim($db, 'qa_legacy', '1003', 5000, $today);
    qa_daily_check($double['duplicate'] === true && $double['source_server_id'] === '1001', 'old multi-server duplicates select first historical source');
    qa_daily_check(qa_daily_counts($db, 'qa_legacy') === $doubleBefore, 'old duplicate rewards remain preserved with no clawback');

    for ($round = 0; $round < 5; $round++) {
        $account = 'qa_race_' . $round;
        qa_daily_add_account($db, $account, 21);
        $db->beginTransaction();
        qa_daily_scalar($db, 'SELECT ptb FROM account WHERE account=? FOR UPDATE', array($account));
        $one = qa_daily_spawn($helper, $schema, $account, '1001', $today);
        $two = qa_daily_spawn($helper, $schema, $account, '1002', $today);
        fwrite($one['pipes'][0], "GO\n"); fflush($one['pipes'][0]);
        fwrite($two['pipes'][0], "GO\n"); fflush($two['pipes'][0]);
        usleep(150000);
        $db->commit();
        $first = qa_daily_finish($one);
        $second = qa_daily_finish($two);
        qa_daily_check((int)$first['duplicate'] + (int)$second['duplicate'] === 1, 'concurrent S1/S2 round ' . $round . ' exactly one winner');
        qa_daily_check($first['elapsed_ms'] >= 50 && $second['elapsed_ms'] >= 50, 'concurrent S1/S2 round ' . $round . ' both overlap behind the same wallet lock');
        qa_daily_check(qa_daily_counts($db, $account) === array('wallet' => '5021', 'daily_checkins' => 1, 'daily_checkin_account_claims' => 1, 'gm_logs' => 1), 'concurrent S1/S2 round ' . $round . ' exactly one durable credit/receipt/audit');
        $concurrency[] = array('first' => $first, 'second' => $second);
    }

    foreach (array('qa_alice', 'qa_bob') as $account) qa_daily_add_account($db, $account);
    $alice = qa_daily_spawn($helper, $schema, 'qa_alice', '1001', $today);
    $bob = qa_daily_spawn($helper, $schema, 'qa_bob', '1002', $today);
    fwrite($alice['pipes'][0], "GO\n"); fflush($alice['pipes'][0]);
    fwrite($bob['pipes'][0], "GO\n"); fflush($bob['pipes'][0]);
    $aliceResult = qa_daily_finish($alice);
    $bobResult = qa_daily_finish($bob);
    qa_daily_check(!$aliceResult['duplicate'] && !$bobResult['duplicate'] && $aliceResult['xu_web'] === '5000' && $bobResult['xu_web'] === '5000', 'two independent accounts each receive one daily reward');

    foreach (array('account' => 'qa_wallet_failure', 'gm_logs' => 'qa_audit_failure') as $table => $account) {
        qa_daily_add_account($db, $account, 77);
        $before = qa_daily_counts($db, $account);
        $event = $table === 'account' ? 'UPDATE' : 'INSERT';
        $field = $table === 'account' ? 'account' : 'account_name';
        $trigger = 'qa_forced_failure_' . $table;
        $db->exec('CREATE TRIGGER `' . $trigger . '` BEFORE ' . $event . ' ON `' . $table . '` FOR EACH ROW BEGIN IF NEW.' . $field . '=' . $db->quote($account) . " THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='intentional QA failure'; END IF; END");
        $error = qa_daily_rejected(function () use ($db, $account, $today) { lhs_daily_checkin_claim($db, $account, '1001', 5000, $today); }, $table . ' injected failure is returned');
        qa_daily_check(strpos($error->getMessage(), 'intentional QA failure') !== false, $table . ' failure is the intended SQL fault');
        qa_daily_check(!$db->inTransaction() && qa_daily_counts($db, $account) === $before, $table . ' failure rolls back wallet plus receipt plus history plus audit');
        $db->exec('DROP TRIGGER `' . $trigger . '`');
        $recovered = lhs_daily_checkin_claim($db, $account, '1002', 5000, $today);
        qa_daily_check(!$recovered['duplicate'] && $recovered['xu_web'] === '5077', $table . ' corrected failure allows a safe one-time retry');
    }

    qa_daily_add_account($db, 'qa_locked', 1, 'locked');
    qa_daily_add_account($db, 'qa_negative', -1);
    qa_daily_add_account($db, 'qa_overflow', PHP_INT_MAX);
    foreach (array('qa_missing', 'qa_locked', 'qa_negative', 'qa_overflow', '', str_repeat('a', 65)) as $badAccount) {
        qa_daily_rejected(function () use ($db, $badAccount, $today) { lhs_daily_checkin_claim($db, $badAccount, '1001', 5000, $today); }, 'invalid/missing/locked/unsafe wallet rejected: ' . ($badAccount === '' ? '(empty)' : $badAccount));
        qa_daily_check(!$db->inTransaction(), 'rejected account leaves no transaction open');
    }
    foreach (array('', '1004', '../1001') as $server) {
        qa_daily_rejected(function () use ($db, $server, $today) { lhs_daily_checkin_claim($db, 'qa_sequential', $server, 5000, $today); }, 'unconfigured/empty/malformed server rejected: ' . $server);
    }
    foreach (array(0, -1, 1000000001, '5000', 1.5) as $reward) {
        qa_daily_rejected(function () use ($db, $reward, $today) { lhs_daily_checkin_claim($db, 'qa_sequential', '1001', $reward, $today); }, 'invalid reward rejected: ' . json_encode($reward));
    }
    foreach (array('2026-02-30', '2026-9-6', '2026-09-06 12:00:00', '', '0000-00-00') as $date) {
        qa_daily_rejected(function () use ($date) { lhs_daily_checkin_date($date); }, 'invalid date rejected: ' . $date);
    }
    $originalTimezone = date_default_timezone_get();
    date_default_timezone_set('Pacific/Honolulu');
    qa_daily_check(lhs_daily_checkin_date() === (new DateTimeImmutable('now', new DateTimeZone('Asia/Ho_Chi_Minh')))->format('Y-m-d'), 'daily entitlement uses UTC+7 independently of PHP process timezone');
    date_default_timezone_set($originalTimezone);
    $db->beginTransaction();
    $nested = qa_daily_rejected(function () use ($db, $today) { lhs_daily_checkin_claim($db, 'qa_sequential', '1001', 5000, $today); }, 'nested transaction rejected');
    qa_daily_check($nested instanceof LogicException && $db->inTransaction(), 'nested transaction guard preserves callers transaction');
    $db->rollBack();

    foreach (array('qa_api', 'qa_other', 'qa_form') as $account) qa_daily_add_account($db, $account, 93);
    $result['apiSha256'] = hash_file('sha256', dirname($helper) . '/api/user_api.php');
    $result['contextSha256'] = hash_file('sha256', dirname($helper) . '/web_context.php');
    $apiBefore = qa_daily_counts($db, 'qa_api');
    $apiCases = array(
        'guest' => 'login_required',
        'empty_account' => 'INVALID_SERVER_CONTEXT',
        'missing_uin' => 'INVALID_SERVER_CONTEXT',
        'unknown_server' => 'INVALID_SERVER_CONTEXT',
        'missing_server' => 'INVALID_SERVER_CONTEXT',
        'array_server' => 'INVALID_SERVER_CONTEXT',
        'csrf_missing' => 'STALE_SESSION_CONTEXT',
        'context_missing' => 'STALE_SESSION_CONTEXT',
        'stale_server_context' => 'STALE_SESSION_CONTEXT',
        'stale_account_context' => 'STALE_SESSION_CONTEXT',
        'get_request' => '',
        'feature_disabled' => ''
    );
    foreach ($apiCases as $case => $expectedCode) {
        $api = qa_daily_api($helper, $schema, $case);
        qa_daily_check($api['status'] === 'error', 'API rejects ' . $case);
        if ($expectedCode !== '') {
            qa_daily_check($expectedCode === 'login_required' ? !empty($api['login_required']) : ($api['code'] ?? '') === $expectedCode, 'API rejection reason matches ' . $case);
        }
        qa_daily_check(qa_daily_counts($db, 'qa_api') === $apiBefore, 'API ' . $case . ' cannot alter wallet, claim, history or audit');
    }
    $api = qa_daily_api($helper, $schema, 'post_server_forged');
    qa_daily_check($api['status'] === 'success' && $api['source_server_id'] === '1001' && $api['xu_web'] === '5093', 'API ignores forged POST server and uses authenticated S1 context');
    $api = qa_daily_api($helper, $schema, 's2_retry');
    qa_daily_check($api['status'] === 'error' && $api['duplicate'] === true && $api['source_server_id'] === '1001', 'API S2 retry sees S1 account-global entitlement');
    qa_daily_check(qa_daily_counts($db, 'qa_api') === array('wallet' => '5093', 'daily_checkins' => 1, 'daily_checkin_account_claims' => 1, 'gm_logs' => 1), 'API cross-server flow leaves one durable credit');
    $api = qa_daily_api($helper, $schema, 'form_context');
    qa_daily_check($api['status'] === 'success' && $api['xu_web'] === '5093', 'API accepts bound hidden-form context for non-AJAX submission');
    $result['apiFixture'] = 'full candidate API/context/daily source; isolated PDO; config/auth/ban/rate fixtures; no game network';

    $result['result'] = 'PASS';
} catch (Throwable $error) {
    $failure = array('type' => get_class($error), 'message' => $error->getMessage(), 'line' => $error->getLine());
} finally {
    if ($db && $db->inTransaction()) $db->rollBack();
    $db = null;
    if ($created && $admin) {
        // The name was generated above and CREATE DATABASE succeeded in this
        // invocation; no pre-existing or application schema can reach this path.
        try {
            $admin->exec('DROP DATABASE `' . $schema . '`');
            $result['schemaRemoved'] = (int)qa_daily_scalar($admin, 'SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name=?', array($schema)) === 0;
        } catch (Throwable $error) {
            $result['schemaRemoved'] = false;
            $result['cleanupError'] = $error->getMessage();
            $result['result'] = 'FAIL';
        }
    }
}
$result['checks'] = count($qaChecks);
$result['passedChecks'] = $qaChecks;
$result['concurrencyRounds'] = $concurrency;
if ($failure) $result['error'] = $failure;
$encoded = json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;
if (isset($argv[2])) {
    $evidenceDir = realpath(dirname($argv[2]));
    $normalized = str_replace('\\', '/', (string)$evidenceDir);
    if (!$evidenceDir || !preg_match('~/_ai_workbench/(temp|logs)(/|$)~', $normalized) || file_exists($argv[2])) {
        fwrite(STDERR, "Evidence must be a new file inside _ai_workbench/temp or logs.\n");
        exit(2);
    }
    file_put_contents($argv[2], $encoded, LOCK_EX);
}
echo $encoded;
exit($result['result'] === 'PASS' ? 0 : 1);
