"""Read-only pet audit baseline; never start app, connect DB, or expose PM2 env."""
import hashlib
import json
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect, run

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench/temp/pet_full_audit_20260923'
FILES = [
    'lhs/newServer/src/handlers/pet.js',
    'lhs/newServer/src/handlers/pet-soul.js',
    'lhs/newServer/src/handlers/item.js',
    'lhs/newServer/src/handlers/raid.js',
    'lhs/newServer/src/net/WSServer.js',
    'lhs/newServer/src/services/ConfigService.js',
    'lhs/newServer/src/services/PlayerService.js',
    'lhs/newServer/src/services/NativeItemRewardService.js',
    'lhs/newServer/src/services/RewardGrantService.js',
    'lhs/newServer/src/services/RandomUsableItemRewardService.js',
    'webgame/game/js/main.min_drop100.js',
    'webgame/game/index.html',
    'lhs/update/resource/assets/excel/config_fashion_20260909.bin',
    'lhs/update/resource/assets/excel/config_e5ac72c2.bin',
    'webgame/game/update/resource/assets/excel/config_fashion_20260909.bin',
]

def sha(data):
    return hashlib.sha256(data).hexdigest()

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    ssh = connect()
    try:
        manifest = {'readOnly': True, 'directPlayerWrites': 0, 'files': {}}
        js_hash = "const fs=require('fs'),c=require('crypto');const sha=b=>c.createHash('sha256').update(b).digest('hex');console.log(JSON.stringify(Object.fromEntries(" + json.dumps(FILES) + ".map(p=>{try{const b=fs.readFileSync('/linhhoasu/'+p);return[p,{sha:sha(b),normalized:/\\.(js|html)$/.test(p)?sha(Buffer.from(b.toString('utf8').replace(/\\r\\n/g,'\\n'))):null}]}catch(e){return[p,{missing:true}]}}))));"
        import shlex
        hashes = json.loads(run(ssh, 'node -e ' + shlex.quote(js_hash)))
        with ssh.open_sftp() as sf:
            for rel in FILES:
                meta = hashes[rel]
                if meta.get('missing'):
                    manifest['files'][rel] = {'remoteMissing': True}
                    continue
                local_path = ROOT / 'linhhoasu' / rel
                local = local_path.read_bytes() if local_path.exists() else b''
                same_text = meta.get('normalized') == sha(local.replace(b'\r\n', b'\n'))
                row = {'remoteSha256': meta['sha'], 'localSha256': sha(local), 'identical': meta['sha'] == sha(local), 'normalizedEqual': same_text}
                if not row['identical'] and not same_text:
                    dest = OUT / 'baseline' / rel
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    if not dest.exists() or sha(dest.read_bytes()) != meta['sha']:
                        sf.get('/linhhoasu/' + rel, str(dest))
                    row['auditCopy'] = str(dest.relative_to(ROOT))
                    print('AUDIT_BASELINE_DIFF ' + rel, flush=True)
                manifest['files'][rel] = row
        js = "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.stringify(JSON.parse(s).filter(p=>/^lhs-s100[1-5]$/.test(p.name)).map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,cwd:p.pm2_env.pm_cwd,configPath:p.pm2_env.CONFIG_BIN_PATH||null,composeFailOpen:p.pm2_env.PET_COMPOSE_FAIL_OPEN??null,logLevel:p.pm2_env.LOG_LEVEL,traceTags:p.pm2_env.WS_TRACE_TAGS||null})))));"
        import shlex
        manifest['processes'] = json.loads(run(ssh, 'pm2 jlist | node -e ' + shlex.quote(js)))
        out = OUT / 'baseline.json'
        out.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(json.dumps(manifest, ensure_ascii=True, indent=2))
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
