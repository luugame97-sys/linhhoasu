import getpass
import paramiko

HOST = '103.116.105.154'
ROOT = '/linhhoasu/webgame/gm'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username='root', password=getpass.getpass('VPS password (not logged): '), look_for_keys=False, allow_agent=False, timeout=15)

def run(command):
    _, out, err = ssh.exec_command(command)
    text = out.read().decode('utf-8', 'replace')
    code = out.channel.recv_exit_status()
    if code:
        print('COMMAND_FAILED', code, err.read().decode('utf-8', 'replace')[-2000:])
    return text

try:
    print('FUNCTION_LOCATIONS')
    print(run(f"grep -n -E 'function (vht6ur_sdk_web_send_items|gm_send_item_mail_by_role|hk_reward_exists|hk_clean_reward_id)|vht6ur_sdk_web_send_items' {ROOT}/config.php {ROOT}/api/user_api.php {ROOT}/admin/admin_api.php"))
    print('BRIDGE_CODE_REDACTED')
    # Print only code lines, replacing any quoted secret/token/password literals.
    command = f"sed -n '500,680p' {ROOT}/config.php | sed -E \"s/(TOKEN|SECRET|PASSWORD|KEY|API_KEY)[^=]*=[^;]*/\\1=[REDACTED]/Ig; s/'[^']{20,}'/'[REDACTED]'/g; s/\\\"[^\\\"]{{20,}}\\\"/\\\"[REDACTED]\\\"/g\""
    print(run(command))
    print('GM_LOG_SCHEMA')
    print(run(f"grep -n -E 'CREATE TABLE.*(gm_logs|webshop_orders)|gm_logs|webshop_orders' {ROOT}/account_Linhhoasu.sql | head -80"))
finally:
    ssh.close()
