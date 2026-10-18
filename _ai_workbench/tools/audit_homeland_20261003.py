"""Read-only production source/config snapshot; no gameplay RPC or player DB access."""
import datetime as dt
import hashlib
import json
import shlex
from pathlib import Path

import paramiko
from rollback_role_lian_manifest_20260930 import ssh_config

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench/temp/homeland_audit_20261003'
APP = '/linhhoasu/lhs/newServer'
FILES = ['src/handlers/homeland.js', 'src/handlers/index.js', 'src/router.js',
         'src/services/BattleService.js', 'src/handlers/playerPayload.js']


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    args, kwargs = ssh_config()
    assert args[0] == '103.116.104.165'
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(*args, **kwargs)
    s = c.open_sftp()
    OUT.mkdir(parents=True, exist_ok=True)

    def run(cmd):
        _, o, e = c.exec_command(cmd, timeout=40)
        data, error = o.read(), e.read()
        if o.channel.recv_exit_status():
            raise RuntimeError('READONLY_COMMAND_FAILED:' + error.decode('utf8', 'replace')[-500:])
        return data

    try:
        hashes = {}
        for path in FILES:
            with s.open(APP + '/' + path, 'rb') as f:
                data = f.read()
            local = ROOT / 'linhhoasu/lhs/newServer' / path
            lb = local.read_bytes()
            hashes[path] = {'sha256': sha(data), 'bytes': len(data),
                            'localByteMatch': data == lb,
                            'localNormalizedMatch': data.replace(b'\r\n', b'\n') == lb.replace(b'\r\n', b'\n')}
            # Only snapshot code, never environment or player records.
            (OUT / Path(path).name).write_bytes(data)

        js = r"""
const fs=require('fs'),crypto=require('crypto'),cp=require('child_process');
const procs=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'}))
  .filter(p=>/^lhs-s100[1-6]$/.test(p.name));
const configKeys=['CONFIG_BIN_PATH','FASHION_CONTENT_OVERLAY_PATH','FASHION_CHOICE_OVERLAY_PATH',
 'FASHION_CHOICE_STARS_OVERLAY_PATH','DROP_LEVEL100_ENABLED','ROLE_LEVEL2000_ENABLED'];
const profiles=procs.map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,
  execPath:p.pm2_env.pm_exec_path,cwd:p.pm2_env.pm_cwd,
  config:Object.fromEntries(configKeys.map(k=>[k,p.pm2_env[k]||null]))}));
const p=procs.find(p=>p.name==='lhs-s1001');if(!p)throw Error('S1_MISSING');
for(const [k,v] of Object.entries(p.pm2_env))if(typeof v==='string'||typeof v==='number')process.env[k]=String(v);
require('dotenv').config();
const config=require('./src/services/ConfigService'), all=config.loadAllTables();
const tables=Object.fromEntries(Object.entries(all).filter(([k])=>k.startsWith('Homeland')||k==='TileSceneConfig'));
const ids=[1,2,71,220,221,222,223,224,225,226,-32,-33,...Array.from({length:12},(_,i)=>170031+i)];
tables.AssetsConfig=Object.fromEntries(ids.map(id=>[id,all.AssetsConfig[id]||null]));
tables.AssetsUseConfig=Object.fromEntries(ids.map(id=>[id,all.AssetsUseConfig[id]||null]));
const b=fs.readFileSync('/linhhoasu/webgame/game/js/main.min_drop100.js');
console.log('AUDIT_JSON:'+JSON.stringify({profiles,tables,bundleHash:crypto.createHash('sha256').update(b).digest('hex')}));
"""
        raw = run('cd ' + shlex.quote(APP) + ' && node -e ' + shlex.quote(js)).decode('utf8')
        live = json.loads(next(line[11:] for line in raw.splitlines() if line.startswith('AUDIT_JSON:')))
        (OUT / 'config.json').write_text(json.dumps(live['tables'], ensure_ascii=False) + '\n', encoding='utf8')
        bundle_local = ROOT / 'linhhoasu/webgame/game/js/main.min_drop100.js'
        report = {'at': dt.datetime.now(dt.timezone.utc).isoformat(), 'readOnly': True,
                  'productionWrites': 0, 'playerDbReads': 0, 'gameplayRpcCalls': 0,
                  'hashes': hashes, 'processes': live['profiles'],
                  'bundleHash': live['bundleHash'], 'bundleLocalMatch': sha(bundle_local.read_bytes()) == live['bundleHash'],
                  'tableCounts': {k: len(v) for k, v in live['tables'].items()},
                  'statue': {'base': live['tables']['HomelandBaseConfig'],
                             'level1': live['tables']['HomelandStatueConfig']['1']}}
        (OUT / 'live.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
        print(json.dumps(report, ensure_ascii=False, indent=2))
    finally:
        s.close()
        c.close()


if __name__ == '__main__':
    main()
