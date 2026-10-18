import paramiko
import sys

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('103.116.105.154', username='root', password='anhduc11', timeout=15, allow_agent=False, look_for_keys=False)
command = "grep -n 'donate_reward_amount_limit\\|function parse_donate_reward_items\\|validation_scope' /linhhoasu/webgame/gm/config.php; grep -n '\\\$items = parse_donate_reward_items' /linhhoasu/webgame/gm/api/user_api.php; grep -n '\\\$reward = admin_parse_' /linhhoasu/webgame/gm/admin/admin_api.php | head -n 10; grep -n 'function handleSkillUpgrade\\|RoleKungFuLvConfig' /linhhoasu/lhs/newServer/src/handlers/upgrade.js; grep -n 'MAIL_CLAIM_LEDGER_LIMIT\\|playerService.savePlayer(userId' /linhhoasu/lhs/newServer/src/handlers/mail.js; pm2 status"
stdin, stdout, stderr = client.exec_command(command)
sys.stdout.buffer.write(stdout.read())
sys.stderr.buffer.write(stderr.read())
client.close()
