import paramiko
import sys
import time

sys.stdout.reconfigure(encoding='utf-8')
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.116.104.165', username='root', password='anhduc11')

sftp = ssh.open_sftp()

print("1. Uploading updated files to VPS...")
sftp.put(r'I:\Linhhoasu\server\server\linhhoasu\lhs\newServer\src\services\PlayerService.js', '/linhhoasu/lhs/newServer/src/services/PlayerService.js')
sftp.put(r'I:\Linhhoasu\server\server\linhhoasu\lhs\newServer\src\net\WSServer.js', '/linhhoasu/lhs/newServer/src/net/WSServer.js')
sftp.put(r'I:\Linhhoasu\server\server\linhhoasu\lhs\newServer\src\bots\RealBotWorker.js', '/linhhoasu/lhs/newServer/src/bots/RealBotWorker.js')
sftp.close()

print("2. Updating .env on VPS...")
cmd_env = """
update_or_add() {
    key="$1"
    val="$2"
    file="$3"
    if grep -q "^$key=" "$file"; then
        sed -i "s/^$key=.*/$key=$val/" "$file"
    else
        echo "$key=$val" >> "$file"
    fi
}

ENV_FILE="/linhhoasu/lhs/newServer/.env"
update_or_add "PLAYER_DEFERRED_SAVE_COALESCE_MS" "3000" "$ENV_FILE"
update_or_add "BOT_WORKER_ACTIVE_FARM_MIN_MS" "15000" "$ENV_FILE"
update_or_add "BOT_WORKER_ACTIVE_FARM_MAX_MS" "25000" "$ENV_FILE"
update_or_add "BOT_WORKER_LAZY_BOTS_PER_MAP" "2" "$ENV_FILE"

grep -E "PLAYER_DEFERRED_SAVE_COALESCE_MS|BOT_WORKER_ACTIVE_FARM|BOT_WORKER_LAZY_BOTS_PER_MAP" "$ENV_FILE"
"""
stdin, stdout, stderr = ssh.exec_command(cmd_env)
print("Updated .env:\n" + stdout.read().decode('utf-8').strip())

print("\n3. Restarting Game Servers with PLAYER_DEFERRED_SAVE_COALESCE_MS=3000...")
servers = ["lhs-s1001", "lhs-s1002", "lhs-s1003", "lhs-s1004", "lhs-s1005", "lhs-s1006"]
for s in servers:
    cmd = f"PLAYER_DEFERRED_SAVE_COALESCE_MS=3000 pm2 restart {s} --update-env"
    stdin, stdout, stderr = ssh.exec_command(cmd)
    stdout.channel.recv_exit_status()
    print(f"Restarted {s}")

print("\n4. Restarting Bot Workers with relaxed farm pace & 2-bot limit...")
bots = ["lhs-real-bots", "lhs-real-bots-s2", "lhs-real-bots-s3", "lhs-real-bots-s4", "lhs-real-bots-s5", "lhs-real-bots-s6"]
for b in bots:
    cmd = f"BOT_WORKER_ACTIVE_FARM_MIN_MS=15000 BOT_WORKER_ACTIVE_FARM_MAX_MS=25000 BOT_WORKER_LAZY_BOTS_PER_MAP=2 pm2 restart {b} --update-env"
    stdin, stdout, stderr = ssh.exec_command(cmd)
    stdout.channel.recv_exit_status()
    print(f"Restarted {b}")

stdin, stdout, stderr = ssh.exec_command("pm2 restart lhs-bot-fleet-supervisor --update-env")
stdout.channel.recv_exit_status()
print("Restarted lhs-bot-fleet-supervisor")

stdin, stdout, stderr = ssh.exec_command("pm2 save")
stdout.channel.recv_exit_status()
print("PM2 state saved successfully.")

print("\n5. Waiting 30s for connections and background tasks to settle...")
time.sleep(30)

print("\n=== SYSTEM RESOURCE USAGE ===")
stdin, stdout, stderr = ssh.exec_command("uptime; ps aux --sort=-%cpu | head -n 14")
print(stdout.read().decode('utf-8'))

print("=== PM2 STATUS ===")
stdin, stdout, stderr = ssh.exec_command("pm2 list")
print(stdout.read().decode('utf-8'))

print("=== RECENT SERVER 1 LOGS ===")
stdin, stdout, stderr = ssh.exec_command("pm2 logs lhs-s1001 --lines 20 --nostream")
print(stdout.read().decode('utf-8'))

print("=== RECENT SERVER 6 LOGS ===")
stdin, stdout, stderr = ssh.exec_command("pm2 logs lhs-s1006 --lines 20 --nostream")
print(stdout.read().decode('utf-8'))

ssh.close()
