"""Bounded read-only VPS snapshot for planning a S1-only drop-level 46 pilot."""
import importlib.util
import hashlib
import json
import shlex
import sys
from datetime import datetime, timezone
from pathlib import Path
import paramiko

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'temp' / (sys.argv[1] if len(sys.argv) > 1 else 'drop46_audit_20260914')

REMOTE = r'''
const fs=require('fs'),cp=require('child_process');
const names=['lhs-s1001','lhs-s1002','lhs-s1003'];
const rows=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'})).filter(p=>names.includes(p.name));
console.log(JSON.stringify(rows.map(p=>{const e=p.pm2_env||{},v={...e,...e.env};return {name:p.name,pid:p.pid,status:e.status,cwd:e.pm_cwd,script:e.pm_exec_path,serverId:v.SERVER_ID,port:v.PORT,configPath:v.CONFIG_BIN_PATH||null,boxEnv:Object.fromEntries(Object.entries(v).filter(([k])=>k.startsWith('BOX_')))};})));
'''

def main():
    spec = importlib.util.spec_from_file_location('existing_vps_access', ROOT / 'tools' / 'diagnose_auto_delegate_tier_remote.py')
    access = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(access)
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(access.HOST, username=access.USER, password=access.PASSWORD,
                look_for_keys=False, allow_agent=False, timeout=20)
    OUT.mkdir(parents=True, exist_ok=True)
    try:
        _, stdout, stderr = ssh.exec_command('node -e ' + shlex.quote(REMOTE), timeout=30)
        body = stdout.read().decode()
        error = stderr.read().decode()
        if stdout.channel.recv_exit_status():
            raise RuntimeError(error)
        processes = json.loads(body)
        paths = [
            '/linhhoasu/lhs/newServer/src/config/dropLevel46.js',
            '/linhhoasu/lhs/newServer/src/services/DropLevel46Service.js',
            '/linhhoasu/webgame/game/js/main.min_drop46_s1.js',
            '/linhhoasu/lhs/newServer/src/services/ConfigService.js',
            '/linhhoasu/lhs/newServer/src/services/PlayerService.js',
            '/linhhoasu/lhs/newServer/src/services/PlayerMutationService.js',
            '/linhhoasu/lhs/newServer/src/net/WSServer.js',
            '/linhhoasu/lhs/newServer/src/utils/boxTiming.js',
            '/linhhoasu/lhs/newServer/src/handlers/account.js',
            '/linhhoasu/lhs/newServer/src/handlers/item.js',
            '/linhhoasu/lhs/newServer/src/services/EquipService.js',
            '/linhhoasu/lhs/newServer/src/services/BattleService.js',
            '/linhhoasu/lhs/newServer/src/services/MapMonsterService.js',
            '/linhhoasu/lhs/newServer/src/services/RoleAppearanceService.js',
            '/linhhoasu/lhs/newServer/src/handlers/box.js',
            '/linhhoasu/lhs/newServer/src/handlers/compat.js',
            '/linhhoasu/lhs/newServer/src/handlers/index.js',
            '/linhhoasu/lhs/newServer/src/handlers/basic.js',
            '/linhhoasu/lhs/newServer/src/protocol/BinJsonUtil.js',
            '/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin',
            '/linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin',
            '/linhhoasu/webgame/game/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin',
            '/linhhoasu/webgame/game/index.html',
            '/linhhoasu/webgame/game/js/main.min_a6195824.js',
        ]
        paths += [p['configPath'] for p in processes if p['configPath']]
        files = []
        with ssh.open_sftp() as sftp:
            for remote in dict.fromkeys(paths):
                local = OUT / remote.lstrip('/')
                local.parent.mkdir(parents=True, exist_ok=True)
                sftp.get(remote, str(local))
                content = local.read_bytes()
                files.append({'remote': remote, 'local': str(local.relative_to(OUT)), 'bytes': len(content), 'sha256': hashlib.sha256(content).hexdigest()})
        result = {'generatedAt': datetime.now(timezone.utc).isoformat(), 'productionWrites': 0, 'processes': processes, 'files': files}
        (OUT / 'snapshot.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
        print(json.dumps(result, indent=2))
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
