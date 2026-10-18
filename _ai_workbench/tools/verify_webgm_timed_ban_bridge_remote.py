"""Read-only smoke of the deployed WebGM -> game timed-ban HMAC bridge."""

from __future__ import annotations

import getpass
import shlex
import paramiko


PHP = r'''require '/linhhoasu/webgame/gm/config.php'; $r=lhs_internal_account_ban('/api/internal/account/ban', array('accountId'=>'testweb01','durationDays'=>100,'durationMinutes'=>0,'reason'=>'QA preview only','code'=>'QA_TIMED_BAN','dryRun'=>true,'confirm'=>false)); echo json_encode(array('success'=>isset($r['success'])?$r['success']:false,'http_code'=>isset($r['http_code'])?$r['http_code']:0,'error'=>isset($r['error'])?$r['error']:'','data_keys'=>isset($r['data'])&&is_array($r['data'])?array_keys($r['data']):array()), JSON_UNESCAPED_UNICODE);'''
password = getpass.getpass("Production password (not logged): ")
ssh = paramiko.SSHClient(); ssh.load_system_host_keys(); ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
ssh.connect("103.116.105.154", username="root", password=password, look_for_keys=False, allow_agent=False, timeout=20, banner_timeout=20, auth_timeout=20)
try:
    _, stdout, stderr = ssh.exec_command("php -r " + shlex.quote(PHP), timeout=60)
    print(stdout.read().decode("utf-8", "replace"))
    error = stderr.read().decode("utf-8", "replace")
    if error: print(error)
finally:
    ssh.close()
