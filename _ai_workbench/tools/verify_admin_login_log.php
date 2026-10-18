<?php
if (PHP_SAPI !== 'cli') exit(1);
require $argv[1];
$probe = 'qa_admin_log_' . bin2hex(random_bytes(5));
try {
    $conn_web->beginTransaction();
    log_login_attempt($probe, '127.0.0.1', true, '1002');
    $q=$conn_web->prepare('SELECT server_id,success FROM login_attempts WHERE username=?');
    $q->execute(array($probe)); $row=$q->fetch(PDO::FETCH_ASSOC);
    if (!$row || $row['server_id']!=='1002' || (int)$row['success']!==1) throw new RuntimeException('LOGIN_SCOPE_FAILED');
    $conn_web->rollBack();
    $q->execute(array($probe));
    if ($q->fetch()) throw new RuntimeException('ROLLBACK_FAILED');
    echo json_encode(array('result'=>'PASS','newLoginServerId'=>'1002','probeRowsRemaining'=>0));
} finally {
    if ($conn_web->inTransaction()) $conn_web->rollBack();
    if (session_status()===PHP_SESSION_ACTIVE) session_destroy();
}
