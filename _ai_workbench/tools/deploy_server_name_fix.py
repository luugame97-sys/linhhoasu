import os
import sys
import time
from datetime import datetime
from pathlib import Path

if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

sys.path.insert(0, r'i:/Linhhoasu/server/server/_ai_workbench/tools')
from snapshot_web_multiserver_20260906 import connect, run

FILES_TO_DEPLOY = [
    ("linhhoasu/lhs/newServer/src/services/ArenaReadModelService.js", "/linhhoasu/lhs/newServer/src/services/ArenaReadModelService.js"),
    ("linhhoasu/lhs/newServer/src/services/CrossArenaService.js", "/linhhoasu/lhs/newServer/src/services/CrossArenaService.js"),
    ("linhhoasu/lhs/newServer/src/handlers/basic.js", "/linhhoasu/lhs/newServer/src/handlers/basic.js"),
    ("linhhoasu/lhs/newServer/src/handlers/arena.js", "/linhhoasu/lhs/newServer/src/handlers/arena.js"),
    ("linhhoasu/lhs/newServer/src/db/models/GameServer.js", "/linhhoasu/lhs/newServer/src/db/models/GameServer.js"),
    ("linhhoasu/lhs/newServer/ecosystem.config.js", "/linhhoasu/lhs/newServer/ecosystem.config.js"),
]

WORKSPACE_ROOT = Path("i:/Linhhoasu/server/server")

def main():
    print(">>> 1. Connecting to VPS...")
    ssh = connect()
    sftp = ssh.open_sftp()
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_dir = f"/linhhoasu/_ai_workbench/backups/server_name_fix_{ts}"
    run(ssh, f"mkdir -p {backup_dir}")
    print(f"Created backup directory: {backup_dir}")

    print("\n>>> 2. Backing up remote files...")
    for local_rel, remote_path in FILES_TO_DEPLOY:
        backup_dest = f"{backup_dir}/{Path(remote_path).name}"
        run(ssh, f"cp {remote_path} {backup_dest} 2>/dev/null || true")
        print(f"  Backed up {remote_path} -> {backup_dest}")

    print("\n>>> 3. Uploading modified files...")
    for local_rel, remote_path in FILES_TO_DEPLOY:
        local_path = WORKSPACE_ROOT / local_rel
        print(f"  Uploading {local_path} -> {remote_path}")
        sftp.put(str(local_path), remote_path)
    sftp.close()

    print("\n>>> 4. Rolling restart PM2 with updated env...")
    nodes = ["lhs-s1001", "lhs-s1002", "lhs-s1003", "lhs-s1004", "lhs-s1005"]
    for node in nodes:
        print(f"  Restarting {node} with --update-env...")
        run(ssh, f"pm2 restart {node} --update-env")
        time.sleep(2)

    print("\n>>> 5. Readiness probe check...")
    ports = [8080, 8083, 8084, 8085, 8086]
    for port in ports:
        code = run(ssh, f"curl -s -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{port}/ready").strip()
        print(f"  Port {port}: HTTP {code}")
        if code != "200":
            print(f"  WARNING: Port {port} readiness code is {code}")

    print("\n>>> 6. Live verification test...")
    verify_script = """
    const mongoose = require('/linhhoasu/lhs/newServer/node_modules/mongoose');
    async function test() {
        await mongoose.connect('mongodb://localhost:27017/lhs_s1001');
        const basic = require('/linhhoasu/lhs/newServer/src/handlers/basic');
        const arena = require('/linhhoasu/lhs/newServer/src/handlers/arena');
        const session = { serverId: 1001, player: { playerId: 'test_caller', serverId: 1001, serverName: 'S1' } };
        const targetId = 'p_u_Wk_1002_af2f6f_1788608815820_1788608815820';

        const res500 = await basic.handleGetPlayerDetail({ playerId: targetId, serverId: 1002 }, session, 1);
        console.log('LIVE RPC 500 (with serverId: 1002):', { name: res500?.data?.name, serverId: res500?.data?.serverId, serverName: res500?.data?.serverName });

        const res500_auto = await basic.handleGetPlayerDetail({ playerId: targetId }, session, 2);
        console.log('LIVE RPC 500 (auto lookup):', { name: res500_auto?.data?.name, serverId: res500_auto?.data?.serverId, serverName: res500_auto?.data?.serverName });

        const res502 = await basic.handleGetPlayerDetailCross({ playerId: targetId, serverId: 1002 }, session, 3);
        console.log('LIVE RPC 502 (cross):', { name: res502?.data?.name, serverId: res502?.data?.serverId, serverName: res502?.data?.serverName });

        const res6217 = await arena.handleTopArenaCrossPlayerDetail({ playerId: targetId, serverId: 1002 }, session, 4);
        console.log('LIVE RPC 6217 (top arena):', { name: res6217?.data?.name, serverId: res6217?.data?.serverId, serverName: res6217?.data?.serverName });

        await mongoose.disconnect();
    }
    test().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
    """
    sftp2 = ssh.open_sftp()
    with sftp2.file('/linhhoasu/_ai_workbench/temp/live_verify_server_name.js', 'w') as f:
        f.write(verify_script)
    sftp2.close()
    out = run(ssh, "node /linhhoasu/_ai_workbench/temp/live_verify_server_name.js")
    print(out)

    print("\n>>> DEPLOYMENT & VERIFICATION COMPLETED! <<<")
    ssh.close()

if __name__ == "__main__":
    main()
