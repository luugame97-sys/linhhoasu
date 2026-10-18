import hashlib
import json
import os
import shlex
import sys
import time
from pathlib import Path

TOOLS_DIR = Path(__file__).resolve().parent
sys.path.append(str(TOOLS_DIR))
from snapshot_web_multiserver_20260906 import connect, run

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

def sha256_file(filepath):
    h = hashlib.sha256()
    with open(filepath, 'rb') as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()

def main():
    repo_root = TOOLS_DIR.parents[1]
    local_drop_cfg = repo_root / 'linhhoasu' / 'lhs' / 'newServer' / 'src' / 'config' / 'dropLevel100.js'
    local_equip_srv = repo_root / 'linhhoasu' / 'lhs' / 'newServer' / 'src' / 'services' / 'EquipService.js'
    local_client_js = repo_root / 'linhhoasu' / 'webgame' / 'game' / 'js' / 'main.min_drop100.js'

    print("Checking local files...")
    assert local_drop_cfg.exists()
    assert local_equip_srv.exists()
    assert local_client_js.exists()

    print(f"dropLevel100.js sha256: {sha256_file(local_drop_cfg)}")
    print(f"EquipService.js sha256: {sha256_file(local_equip_srv)}")
    print(f"main.min_drop100.js sha256: {sha256_file(local_client_js)}")

    print("\nConnecting to VPS 103.116.105.154...")
    ssh = connect()
    sftp = ssh.open_sftp()

    try:
        ts = "20260920_drop46_power"
        remote_backup_dir = f"/linhhoasu/backup_{ts}"
        run(ssh, f"mkdir -p {remote_backup_dir}")

        # Target remote paths
        remote_drop_cfg = "/linhhoasu/lhs/newServer/src/config/dropLevel100.js"
        remote_equip_srv = "/linhhoasu/lhs/newServer/src/services/EquipService.js"
        remote_client_js = "/linhhoasu/webgame/game/js/main.min_drop100.js"

        print("Uploading files to VPS...")
        sftp.put(str(local_drop_cfg), remote_drop_cfg)
        sftp.put(str(local_equip_srv), remote_equip_srv)
        sftp.put(str(local_client_js), remote_client_js)

        # Syntax check
        chk1 = run(ssh, f"node --check {remote_drop_cfg}").strip()
        chk2 = run(ssh, f"node --check {remote_equip_srv}").strip()
        print(f"Syntax dropLevel100.js: {chk1 or 'OK'}")
        print(f"Syntax EquipService.js: {chk2 or 'OK'}")

        # Unit probe
        probe_cmd = (
            "cd /linhhoasu/lhs/newServer && node -e "
            + shlex.quote(
                "const dl = require('./src/config/dropLevel100');"
                + "const es = require('./src/services/EquipService');"
                + "console.log('drop100 isEnabled(1001):', dl.isEnabled(1001));"
                + "console.log('drop100 isEnabled(1005):', dl.isEnabled(1005));"
                + "console.log('isDrop100EquipId(200049101):', es.isDrop100EquipId(200049101));"
                + "const eq = es.normalizeEquip({ uid: 1, id: 200049101, pos: 1, base: { hp: 100 } });"
                + "console.log('normalizeEquip result id:', eq ? eq.id : null);"
                + "if (!eq || eq.id !== 200049101) throw new Error('NORMALIZE_FAILED');"
            )
        )
        probe_out = run(ssh, probe_cmd).strip()
        print("Probe output:\n", probe_out)

        # Rolling reload PM2 processes
        ports = [8080, 8083, 8084, 8085, 8086]
        servers = ['lhs-s1001', 'lhs-s1002', 'lhs-s1003', 'lhs-s1004', 'lhs-s1005']
        
        print("\nReloading PM2 instances with ecosystem config...")
        for name, port in zip(servers, ports):
            print(f"Reloading {name} (port {port})...")
            reload_res = run(ssh, f"pm2 reload /linhhoasu/lhs/newServer/ecosystem.config.js --only {name}").strip()
            # Wait for ready
            ok = False
            for _ in range(15):
                time.sleep(1)
                code = run(ssh, f"curl -s --max-time 2 -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{port}/ready || true").strip()
                if code == '200':
                    ok = True
                    break
            print(f"  {name} ready check: {'PASS (200)' if ok else 'FAIL (' + code + ')'}")
            if not ok:
                raise RuntimeError(f"Server {name} failed ready check!")

        # Verify live data on S1 (lhs-s1001) for character Talo
        print("\nRunning Live verification for character Talo...")
        live_verify_cmd = (
            "cd /linhhoasu/lhs/newServer && node -e "
            + shlex.quote(
                "const mongo = require('./src/utils/mongo');"
                + "const es = require('./src/services/EquipService');"
                + "const cs = require('./src/services/ConfigService');"
                + "(async () => {"
                + "  await cs.init();"
                + "  const assets = cs.get('AssetsConfig') || {};"
                + "  const drop46_in_assets = !!assets[200049101];"
                + "  console.log('Drop46 in AssetsConfig:', drop46_in_assets);"
                + "  const db = await mongo.getDb('s1001');"
                + "  const p = await db.collection('player').findOne({ name: 'Talo' });"
                + "  if (!p) { console.log('Player Talo not found'); process.exit(0); }"
                + "  es.ensureEquipInfo(p);"
                + "  const plan0 = p.equipInfo && p.equipInfo.plan0 ? p.equipInfo.plan0 : {};"
                + "  const slots = Object.keys(plan0).sort((a,b)=>Number(a)-Number(b));"
                + "  const items = slots.map(k => ({ slot: k, id: plan0[k].id }));"
                + "  console.log('Talo plan0 slots count:', slots.length);"
                + "  console.log('Talo plan0 slots:', slots.join(','));"
                + "  console.log('Talo equip items:', JSON.stringify(items));"
                + "  process.exit(0);"
                + "})().catch(e => { console.error(e); process.exit(1); });"
            )
        )
        live_out = run(ssh, live_verify_cmd).strip()
        print("Live verification result:\n", live_out)

    finally:
        sftp.close()
        ssh.close()

if __name__ == '__main__':
    main()
