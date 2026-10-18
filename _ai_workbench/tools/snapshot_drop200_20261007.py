import hashlib, json, sys
from pathlib import Path
from skin_incident_remote import connect, run

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench/temp/drop200_20261007'
RELS = ['lhs/newServer/src/config/dropLevel100.js', 'lhs/newServer/src/services/EquipService.js',
        'lhs/newServer/src/handlers/box.js', 'lhs/newServer/src/services/DropLevel46Service.js',
        'lhs/newServer/src/handlers/compat.js', 'lhs/newServer/src/handlers/account.js',
        'lhs/newServer/src/utils/boxTiming.js', 'webgame/game/js/main.min_drop100.js',
        'webgame/game/js/lhs-box-tier100-v1.js', 'webgame/game/index.html']

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    with connect() as client:
        manifest = {}
        with client.open_sftp() as sf:
            for rel in RELS:
                with sf.open('/linhhoasu/' + rel, 'rb') as handle:
                    data = handle.read()
                dest = OUT / 'baseline' / rel
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(data)
                manifest[rel] = {'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)}
        (OUT / 'baseline.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
        js = """const cp=require('child_process');const ps=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'}));console.log(JSON.stringify(ps.filter(p=>/^lhs-s100[1-7]$/.test(p.name)).map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,serverId:p.pm2_env.SERVER_ID,drop:p.pm2_env.DROP_LEVEL_100_ENABLED,skipUnit:p.pm2_env.BOX_UPGRADE_SKIP_UNIT_MS||null,timeMultiplier:p.pm2_env.BOX_UPGRADE_TIME_MULTIPLIER||null}))));"""
        runtime = json.loads(run(client, 'node -', js))
        (OUT / 'runtime.json').write_text(json.dumps(runtime, indent=2), encoding='utf-8')
        print(json.dumps({'files': manifest, 'runtime': runtime}, ensure_ascii=False))

if __name__ == '__main__':
    main()
