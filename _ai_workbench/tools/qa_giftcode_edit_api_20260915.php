<?php
declare(strict_types=1);

if ($argc < 6) {
    fwrite(STDERR, "usage: php qa_giftcode_edit_api_20260915.php /path/config.php /path/admin_api.php mode stateFile marker\n");
    exit(2);
}

$configPath = (string)$argv[1];
$adminApiPath = (string)$argv[2];
$mode = (string)$argv[3];
$stateFile = (string)$argv[4];
$marker = preg_replace('/[^A-Za-z0-9_]/', '', (string)$argv[5]);
if ($mode !== 'invoke') require_once $configPath;

if ($mode === 'setup') {
    $code = 'QAEDIT' . strtoupper(substr(hash('sha256', $marker), 0, 14));
    $admin = (string)$conn_web->query('SELECT account_name FROM web_admins ORDER BY account_name LIMIT 1')->fetchColumn();
    if ($admin === '') throw new RuntimeException('QA_ADMIN_NOT_FOUND');
    $conn_web->beginTransaction();
    try {
        $stmt = $conn_web->prepare('INSERT INTO giftcodes(code,giftcode,reward_items,max_uses,used_count,is_active,hide) VALUES(?,?,?,?,?,?,?)');
        $stmt->execute(array($code, $code, json_encode(array('6'=>1)), 10, 3, 1, 0));
        $id = (int)$conn_web->lastInsertId();
        $conn_web->commit();
    } catch (Throwable $error) {
        if ($conn_web->inTransaction()) $conn_web->rollBack();
        throw $error;
    }
    file_put_contents($stateFile, json_encode(array('id'=>$id,'code'=>$code,'admin'=>$admin), JSON_UNESCAPED_SLASHES), LOCK_EX);
    chmod($stateFile, 0600);
    echo json_encode(array('result'=>'SETUP','id'=>$id,'code'=>$code)) . PHP_EOL;
    exit;
}

$state = json_decode((string)file_get_contents($stateFile), true);
if (!is_array($state) || empty($state['id']) || empty($state['code'])) throw new RuntimeException('QA_STATE_INVALID');

if ($mode === 'invoke') {
    session_write_close();
    session_id('qa-gift-edit-' . strtolower($marker));
    session_start();
    $_SESSION = array(
        'logged_in'=>true,
        'username'=>(string)$state['admin'],
        'uin'=>(string)$state['admin'],
        'server_id'=>'1001',
        'server_name'=>'QA S1',
        'role'=>'admin',
        'csrf_token'=>'qa_gift_edit_csrf',
    );
    $_SERVER['REQUEST_METHOD'] = 'POST';
    $_SERVER['REMOTE_ADDR'] = '127.0.0.1';
    $_SERVER['HTTP_X_CSRF_TOKEN'] = 'qa_gift_edit_csrf';
    $_SERVER['HTTP_X_LHS_ADMIN_UI'] = '20260907';
    $_SERVER['HTTP_X_LHS_CONTEXT'] = hash_hmac('sha256', json_encode(array('web-context-v1', (string)$state['admin'], (string)$state['admin'], '1001')), 'qa_gift_edit_csrf');
    $_POST = array(
        'action'=>'update_giftcode',
        'id'=>(string)$state['id'],
        'code'=>$state['code'] . 'X',
        'items_json'=>json_encode(array('29011'=>1,'29012'=>2)),
        'max_uses'=>'25',
        'hide'=>'1',
        'is_active'=>'1',
        'expire_at'=>'',
        'csrf_token'=>'qa_gift_edit_csrf',
    );
    chdir('/linhhoasu/webgame/gm/admin');
    require $adminApiPath;
    exit;
}

if ($mode === 'verify') {
    $stmt = $conn_web->prepare('SELECT * FROM giftcodes WHERE id=? LIMIT 1');
    $stmt->execute(array($state['id']));
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) throw new RuntimeException('QA_ROW_MISSING');
    $rewards = json_decode((string)$row['reward_items'], true);
    if ((string)$row['code'] !== $state['code'] . 'X' || (string)$row['giftcode'] !== $state['code'] . 'X') throw new RuntimeException('QA_CODE_NOT_UPDATED');
    if ((int)$row['used_count'] !== 3) throw new RuntimeException('QA_USED_COUNT_CHANGED');
    if ((int)$row['max_uses'] !== 25 || (int)$row['hide'] !== 1 || (int)$row['is_active'] !== 1) throw new RuntimeException('QA_POLICY_NOT_UPDATED');
    if ($rewards !== array('29011'=>1,'29012'=>2)) throw new RuntimeException('QA_REWARDS_NOT_UPDATED');
    echo json_encode(array('result'=>'PASS','usedCount'=>(int)$row['used_count'],'rewards'=>$rewards,'code'=>$row['code']), JSON_UNESCAPED_SLASHES) . PHP_EOL;
    exit;
}

if ($mode === 'cleanup') {
    $conn_web->prepare('DELETE FROM api_rate_limits WHERE account_name=? AND ip=? AND bucket=?')->execute(array($state['admin'],'127.0.0.1','admin_update_giftcode'));
    $conn_web->prepare('DELETE FROM gm_logs WHERE account_name=? AND action=? AND details LIKE ?')->execute(array($state['admin'],'update_giftcode','update #' . (int)$state['id'] . ' %'));
    $conn_web->prepare('DELETE FROM giftcodes WHERE id=? AND (code=? OR code=?)')->execute(array($state['id'],$state['code'],$state['code'].'X'));
    $stmt = $conn_web->prepare('SELECT COUNT(*) FROM giftcodes WHERE id=?');
    $stmt->execute(array($state['id']));
    if ((int)$stmt->fetchColumn() !== 0) throw new RuntimeException('QA_CLEANUP_FAILED');
    @unlink($stateFile);
    echo json_encode(array('result'=>'CLEANUP','remaining'=>0)) . PHP_EOL;
    exit;
}

throw new RuntimeException('QA_MODE_INVALID');
