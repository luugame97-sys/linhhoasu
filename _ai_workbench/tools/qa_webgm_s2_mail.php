<?php
declare(strict_types=1);

if ($argc !== 4) {
    fwrite(STDERR, "usage: qa_webgm_s2_mail.php /path/config.php userId eventKey\n");
    exit(2);
}

require_once $argv[1];
$userId = (string)$argv[2];
$eventKey = (string)$argv[3];
$role = lhs_find_role($userId, '1002', null, true);
if (!$role) {
    throw new RuntimeException('S2_ROLE_LOOKUP_FAILED');
}
$error = '';
$sent = lhs_mail_items(
    '1002',
    $userId,
    'QA WebGM S2',
    'Thư kiểm thử định tuyến S2; hệ thống sẽ tự xóa.',
    array(array('item_id' => 6, 'amount' => 1)),
    $error,
    $eventKey,
    'gift'
);
if (!$sent) {
    throw new RuntimeException('S2_MAIL_SEND_FAILED:' . $error);
}
echo 'WEBGM_S2_MAIL_QA=' . json_encode(array(
    'result' => 'PASS',
    'server' => 1002,
    'role_id' => $userId,
    'event_key' => $eventKey,
), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;
