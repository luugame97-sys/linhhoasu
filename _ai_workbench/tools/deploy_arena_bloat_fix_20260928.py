import hashlib
import json
import sys
from pathlib import Path

if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

sys.path.insert(0, r'i:\Linhhoasu\server\server\_ai_workbench\tools')
from snapshot_web_multiserver_20260906 import connect, run

LOCAL_ARENA_JS = Path(r'I:\Linhhoasu\server\server\linhhoasu\lhs\newServer\src\handlers\arena.js')
REMOTE_ARENA_JS = '/linhhoasu/lhs/newServer/src/handlers/arena.js'
BACKUP_DIR = '/linhhoasu/_ai_workbench/backups/arena_ledger_bloat_fix_20260928'

CLEANUP_SCRIPT_CONTENT = '''
'use strict';
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('/linhhoasu/lhs/newServer/node_modules/mongodb');

const BACKUP_DIR = '/linhhoasu/_ai_workbench/backups/arena_ledger_bloat_fix_20260928';
fs.mkdirSync(BACKUP_DIR, { recursive: true });

(async () => {
  const client = new MongoClient('mongodb://127.0.0.1:27017');
  await client.connect();

  const report = {
    startedAt: new Date().toISOString(),
    databases: {},
    totalModified: 0,
    totalBytesSaved: 0,
  };

  const allBackups = {};

  for (const s of [1001, 1002, 1003, 1004, 1005, 1006]) {
    const dbName = 'lhs_s' + s;
    const db = client.db(dbName);
    const coll = db.collection('players');

    // Find all players with arenaReceiptLedger
    const players = await coll.find(
      { 'arenaReceiptLedger.0': { $exists: true } }
    ).toArray();

    const dbReport = {
      scanned: players.length,
      modified: 0,
      bytesSaved: 0,
      players: [],
    };

    allBackups[dbName] = [];

    for (const player of players) {
      if (!Array.isArray(player.arenaReceiptLedger)) continue;

      let hasBloat = false;
      let beforeLen = JSON.stringify(player).length;
      let rawOriginal = null;

      for (const entry of player.arenaReceiptLedger) {
        if (entry && entry.targetScore && entry.targetScore.document) {
          if (!hasBloat) {
            rawOriginal = JSON.parse(JSON.stringify(player));
          }
          hasBloat = true;
          delete entry.targetScore.document;
        }
      }

      if (hasBloat) {
        // Save raw original to backup array
        allBackups[dbName].push(rawOriginal);

        let afterLen = JSON.stringify(player).length;
        let savedBytes = beforeLen - afterLen;

        await coll.updateOne(
          { _id: player._id },
          { $set: { arenaReceiptLedger: player.arenaReceiptLedger } }
        );

        dbReport.modified += 1;
        dbReport.bytesSaved += savedBytes;
        dbReport.players.push({
          userId: player.userId,
          name: player.name,
          beforeKB: (beforeLen / 1024).toFixed(1),
          afterKB: (afterLen / 1024).toFixed(1),
          savedKB: (savedBytes / 1024).toFixed(1),
        });
      }
    }

    report.totalModified += dbReport.modified;
    report.totalBytesSaved += dbReport.bytesSaved;
    report.databases[dbName] = dbReport;
  }

  // Write backup file
  const backupFile = path.join(BACKUP_DIR, 'affected_players_backup.json');
  fs.writeFileSync(backupFile, JSON.stringify(allBackups, null, 2), 'utf-8');
  report.backupFile = backupFile;
  report.backupSizeKB = (fs.statSync(backupFile).size / 1024).toFixed(1);

  await client.close();
  console.log(JSON.stringify(report, null, 2));
})().catch((err) => {
  console.error('MIGRATION_FAILED:', err);
  process.exit(1);
});
'''

def main():
    print("=== 1. CONNECTING TO VPS ===")
    ssh = connect()
    try:
        # Create backup dir on VPS
        run(ssh, f"mkdir -p {BACKUP_DIR}")
        print(f"Created backup directory: {BACKUP_DIR}")

        # Backup existing remote arena.js
        run(ssh, f"cp {REMOTE_ARENA_JS} {BACKUP_DIR}/arena.js.bak")
        bak_hash = run(ssh, f"sha256sum {BACKUP_DIR}/arena.js.bak").split()[0]
        print(f"Remote arena.js backed up to {BACKUP_DIR}/arena.js.bak (SHA256: {bak_hash})")

        # Upload new arena.js
        local_content = LOCAL_ARENA_JS.read_bytes()
        local_hash = hashlib.sha256(local_content).hexdigest()
        print(f"Local arena.js SHA256: {local_hash}")

        candidate_path = '/linhhoasu/lhs/newServer/src/handlers/arena.candidate.js'
        with ssh.open_sftp() as sftp:
            with sftp.open(candidate_path, 'wb') as f:
                f.write(local_content)

        cand_hash = run(ssh, f"sha256sum {candidate_path}").split()[0]
        if cand_hash != local_hash:
            raise RuntimeError(f"Hash mismatch on upload: {cand_hash} != {local_hash}")
        print("Candidate uploaded and hash verified.")

        # Test candidate syntax with node --check
        run(ssh, f"node --check {candidate_path}")
        print("Candidate passed node --check.")

        # Overwrite remote arena.js
        run(ssh, f"mv {candidate_path} {REMOTE_ARENA_JS}")
        live_hash = run(ssh, f"sha256sum {REMOTE_ARENA_JS}").split()[0]
        print(f"Live arena.js updated (SHA256: {live_hash})")

        # Upload and run migration script
        migration_path = f"{BACKUP_DIR}/clean_bloat.js"
        with ssh.open_sftp() as sftp:
            with sftp.open(migration_path, 'w') as f:
                f.write(CLEANUP_SCRIPT_CONTENT)

        print("\n=== 2. RUNNING DB SANITIZATION & BACKUP ===")
        migration_output = run(ssh, f"node {migration_path}")
        print("Migration Result:")
        print(migration_output)

        print("\n=== 3. RESTARTING S6 (lhs-s1006) VIA PM2 ===")
        restart_out = run(ssh, "pm2 restart lhs-s1006")
        print(restart_out)

        print("\n=== 4. CHECKING S6 READINESS & HEALTH ===")
        import time
        time.sleep(3)
        ready_out = run(ssh, "curl -s http://127.0.0.1:8087/ready")
        print("Ready HTTP 8087:", ready_out)
        health_out = run(ssh, "curl -s http://127.0.0.1:9205/health")
        health_json = json.loads(health_out)
        print("WS 9205 Health status:", health_json.get('status'))
        print("WS 9205 Uptime:", health_json.get('runtime', {}).get('uptimeSec'), "s")
        print("WS 9205 Clients:", health_json.get('runtime', {}).get('clients'))

        print("\n=== 5. CHECKING PROCESS STATUS (PM2 & PS) ===")
        ps_out = run(ssh, "pm2 list | grep -E 'lhs-s1006|name'; ps aux --sort=-%cpu | head -n 10")
        print(ps_out)

    finally:
        ssh.close()

if __name__ == '__main__':
    main()
