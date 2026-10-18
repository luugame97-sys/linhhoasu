"""Scoped infinite-mainline baseline and release tooling. No credentials in output."""
from pathlib import Path
import sys, json, hashlib, shlex
from datetime import datetime, timezone
from skin_incident_remote import connect, run

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench/temp/mainline_infinite_20261014'
APP = '/linhhoasu/lhs/newServer'
WEB = '/linhhoasu/webgame/game'
NODES = {f'lhs-s{1001+i}': (8080 if i == 0 else 8082+i) for i in range(8)}
FILES = {
    'src/handlers/raid.js': APP + '/src/handlers/raid.js',
    'src/handlers/playerPayload.js': APP + '/src/handlers/playerPayload.js',
    'src/handlers/task.js': APP + '/src/handlers/task.js',
    'src/services/MainTaskProgressService.js': APP + '/src/services/MainTaskProgressService.js',
    'src/services/ConfigService.js': APP + '/src/services/ConfigService.js',
    'src/services/PlayerService.js': APP + '/src/services/PlayerService.js',
    'src/services/BattleService.js': APP + '/src/services/BattleService.js',
    'src/net/WSServer.js': APP + '/src/net/WSServer.js',
    'web/index.html': WEB + '/index.html',
    'web/js/main.min_drop200.js': WEB + '/js/main.min_drop200.js',
}

def digest(data):
    return hashlib.sha256(data).hexdigest()

def snapshot():
    manifest_file = OUT / 'baseline.json'
    if manifest_file.exists():
        print('BASELINE_ALREADY_EXISTS'); return
    evidence = {'at': datetime.now(timezone.utc).isoformat(), 'files': {}, 'playerWrites': 0}
    with connect() as ssh:
        with ssh.open_sftp() as sf:
            for local_rel, remote in FILES.items():
                with sf.open(remote, 'rb') as handle:
                    data = handle.read()
                target = OUT / 'baseline' / local_rel
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
                with sf.open(remote, 'rb') as handle:
                    if digest(handle.read()) != digest(data): raise RuntimeError('BASELINE_DRIFT:' + remote)
                evidence['files'][local_rel] = {'remote': remote, 'sha256': digest(data)}
        raw = json.loads(run(ssh, 'pm2 jlist'))
        evidence['nodes'] = {x['name']: {'pid': x['pid'], 'status': x['pm2_env']['status'],
            'watch': x['pm2_env'].get('watch', False), 'cwd': x['pm2_env'].get('pm_cwd'),
            'CONFIG_BIN_PATH': x['pm2_env'].get('CONFIG_BIN_PATH'), 'SERVER_ID': x['pm2_env'].get('SERVER_ID')}
            for x in raw if x['name'] in NODES}
        evidence['ready'] = {n: json.loads(run(ssh, 'curl -fsS --max-time 5 http://127.0.0.1:' + str(p) + '/ready')) for n,p in NODES.items()}
        source = """
const app='/linhhoasu/lhs/newServer';
const logger=app+'/src/logger.js';require.cache[logger]={id:logger,filename:logger,loaded:true,exports:{info(){},warn(){},error(){},debug(){}}};
const c=require(app+'/src/services/ConfigService'),t=c.loadAllTables();
console.log(JSON.stringify(Object.fromEntries(['ChapterConfig','LevelConfig','MonsterConfig','AssetsConfig','TaskConfig','TaskBaseConfig'].map(k=>[k,k==='MonsterConfig'?Object.fromEntries(Object.values(t.LevelConfig).slice(-100).map(r=>[r.monsterId,t.MonsterConfig[r.monsterId]])):k==='TaskConfig'?Object.fromEntries(Object.entries(t[k]).filter(([id,r])=>r.type===1)):t[k]]))));
"""
        text = run(ssh, 'cd ' + shlex.quote(APP) + ' && node -', source)
        config = json.loads(text.strip())
        (OUT/'baseline/config.json').write_text(json.dumps(config,ensure_ascii=False),encoding='utf-8')
        evidence['configHash'] = digest((OUT/'baseline/config.json').read_bytes())
    manifest_file.write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'result':'BASELINE_SAVED','nodes':evidence['nodes'],'ready':evidence['ready'],'files':len(FILES),'playerWrites':0}))

if __name__ == '__main__':
    if sys.argv[1:] == ['snapshot']: snapshot()
    else: raise SystemExit('Supported mode: snapshot')
