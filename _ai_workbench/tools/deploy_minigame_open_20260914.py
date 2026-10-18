"""Deploy the four requested mini-games with scoped CAS and post-checks."""
import hashlib
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path

from snapshot_web_multiserver_20260906 import connect, run


WB = Path(__file__).resolve().parents[1]
ROOT = WB.parent / 'linhhoasu'
APP = '/linhhoasu/lhs/newServer'
WEB = '/linhhoasu/webgame/game'
REMOTE_STAGE = '/linhhoasu/_ai_workbench/temp/minigame_open_20260914'
BACKUP = '/linhhoasu/_ai_workbench/backups/minigame_open_20260914_pre'
LOCAL = WB / 'temp/minigame_open_20260914'
PROCS = ['lhs-s1001', 'lhs-s1002', 'lhs-s1003']
PORTS = [8080, 8083, 8084]

REMOTE_FILES = {
    'lhs/newServer/src/handlers/invest-game.js': 'app/src/handlers/invest-game.js',
    'webgame/game/js/start.min_52ac8d58.js': 'web/js/start.min_52ac8d58.js',
    'webgame/game/js/main.min_a6195824.js': 'web/js/main.min_a6195824.js',
    'webgame/game/index.html': 'web/index.html',
}
EXPECTED = {
    'lhs/newServer/src/handlers/invest-game.js': '7b201fb2381ddb379accde8958199855f0a8a84def7f8bc69810fb9177022d5c',
    'webgame/game/js/start.min_52ac8d58.js': '21847a08cfd0cef6237d426c313da2f2b9b724bed8cae3628f3b1e9264508893',
    'webgame/game/js/main.min_a6195824.js': '2cc9a3811fd61cc421c3ce240982aae84582593e38d5d8c679a7a2af8c9d6c42',
    'webgame/game/index.html': 'bc84f3890a2ca21fc60a091380bb0ad1106203aee70d346aaa375a662ebb7ef6',
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def remote_path(rel):
    return '/linhhoasu/' + rel


def read_remote(sftp, path):
    try:
        return sftp.open(path, 'rb').read()
    except FileNotFoundError:
        return None


def remote_digest(ssh, sftp, path):
    # SFTP reads of the 9 MB main bundle are slow on this host; hash it in
    # place while retaining SFTP read-back for the small files.
    if path.endswith('main.min_a6195824.js'):
        return run(ssh, 'sha256sum ' + shlex.quote(path) + " | awk '{print $1}'").strip()
    return digest(read_remote(sftp, path) or b'')


def stage_candidates():
    """Build candidates from the exact remote snapshot, preserving remote drift."""
    before = LOCAL / 'remote_before'
    stage = LOCAL / 'candidate'
    stage.mkdir(parents=True, exist_ok=True)

    src = (before / 'lhs/newServer/src/handlers/invest-game.js').read_text(encoding='utf-8')
    old = 'const GAME_IDS = [2, 3, 4, 5, 6, 7];'
    new = 'const GAME_IDS = [2, 3, 4, 5, 6, 7, 8];'
    if src.count(old) != 1:
        raise RuntimeError('SOURCE_GAME_IDS_BASELINE_MISMATCH')
    src = src.replace(old, new)
    old = "  7: { chapter: 'ExorciseChapterConfig', base: 'ExorciseBaseConfig', chapterIdKey: 'id', passKey: '' },\n"
    new = old + "  8: { chapter: 'ShootDefenseChapterConfig', base: 'ShootDefenseBaseConfig', chapterIdKey: 'sceneID', passKey: '' },\n"
    if src.count(old) != 1:
        raise RuntimeError('SOURCE_GAME_CFG_BASELINE_MISMATCH')
    src = src.replace(old, new)
    files = {
        'lhs/newServer/src/handlers/invest-game.js': src.encode('utf-8'),
        'webgame/game/js/start.min_52ac8d58.js': (ROOT / 'webgame/game/js/start.min_52ac8d58.js').read_bytes(),
        'webgame/game/js/main.min_a6195824.js': (ROOT / 'webgame/game/js/main.min_a6195824.js').read_bytes(),
    }
    index = (before / 'webgame/game/index.html').read_text(encoding='utf-8')
    old_marker = "20260913_fishing_fashion_box_rank_v2"
    if index.count(old_marker) != 1:
        raise RuntimeError('INDEX_MARKER_BASELINE_MISMATCH')
    files['webgame/game/index.html'] = index.replace(old_marker, '20260914_minigame_open_v1').encode('utf-8')
    out = {}
    for rel, data in files.items():
        path = stage / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        out[rel] = {'sha256': digest(data), 'bytes': len(data)}
    return out


def ready(ssh):
    return {
        str(port): run(ssh, "curl -fsS --max-time 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:" + str(port) + '/ready').strip()
        for port in PORTS
    }


def inventory(ssh):
    command = (
        "pm2 jlist | node -e "
        + shlex.quote(
            "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.stringify(JSON.parse(s).filter(p=>/^lhs-s100[123]$/.test(p.name)).map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time})))));"
        )
    )
    return json.loads(run(ssh, command))


def live_probe(ssh):
    script = r"""
const h=require('/linhhoasu/lhs/newServer/src/handlers/invest-game');
(async()=>{const scores={4:0,5:50,6:0,8:0},out=[];for(const id of [5,6,4,8]){const s={player:{level:100,other_attr_info:{}}};const st=await h.handleInvestGameStart({id,chapter:1},s,id);const en=await h.handleInvestGameEnd({id,chapter:1,score:scores[id]},s,id+100);const p=Array.isArray(en)?en.find(x=>x.tag===5602):en;if(st.data.result!==0||!p||p.data.result!==0||p.data.info.id!==id||p.data.info.clearChapter!==1)throw Error('LIVE_MINIGAME_PROBE_FAILED_'+id);out.push(id)}console.log(JSON.stringify({result:'PASS',games:out}))})().catch(e=>{console.error(e.stack||e);process.exit(1)});
"""
    return json.loads(run(ssh, 'node -e ' + shlex.quote(script)).strip().splitlines()[-1])


def main():
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument('phase', choices=['prepare', 'apply', 'verify'])
    args = parser.parse_args()
    LOCAL.mkdir(parents=True, exist_ok=True)
    ssh = connect()
    try:
        if args.phase == 'prepare':
            if run(ssh, 'test -e ' + shlex.quote(BACKUP) + ' && echo yes || echo no').strip() != 'no':
                raise RuntimeError('REMOTE_BACKUP_ALREADY_EXISTS')
            candidates = stage_candidates()
            ev = {'phase': 'prepared', 'at': datetime.now(timezone.utc).isoformat(), 'files': {}, 'before': inventory(ssh)}
            with ssh.open_sftp() as sftp:
                for rel, staged_rel in REMOTE_FILES.items():
                    actual = remote_digest(ssh, sftp, remote_path(rel))
                    if actual != EXPECTED[rel]:
                        raise RuntimeError('BASELINE_MISMATCH:' + rel + ':' + actual)
                    data = (LOCAL / 'candidate' / rel).read_bytes()
                    stage_path = REMOTE_STAGE + '/' + staged_rel
                    run(ssh, 'mkdir -p ' + shlex.quote(stage_path.rsplit('/', 1)[0]))
                    if rel.endswith('main.min_a6195824.js'):
                        # Avoid a slow multi-megabyte SFTP upload: derive this
                        # one-literal candidate on the VPS from the verified
                        # baseline, then hash-check it below.
                        transform = (
                            "const fs=require('fs');const p=" + repr(remote_path(rel)) + ";"
                            "const q=" + repr(stage_path) + ";const s=fs.readFileSync(p,'utf8');"
                            "const a='e=e.splice(0,O.min(3,e.length))',b='e=e.splice(0,O.min(4,e.length))';"
                            "if(s.split(a).length-1!==1)throw Error('MAIN_LITERAL_BASELINE_MISMATCH');"
                            "fs.writeFileSync(q,s.replace(a,b),'utf8');"
                        )
                        run(ssh, 'cp ' + shlex.quote(remote_path(rel)) + ' ' + shlex.quote(stage_path) + ' && node -e ' + shlex.quote(transform))
                    else:
                        with sftp.open(stage_path, 'wb') as handle:
                            handle.write(data)
                    if remote_digest(ssh, sftp, stage_path) != candidates[rel]['sha256']:
                        raise RuntimeError('STAGE_HASH_MISMATCH:' + rel)
                    ev['files'][rel] = {'baseline': EXPECTED[rel], 'candidate': candidates[rel]['sha256'], 'bytes': candidates[rel]['bytes']}
                    if rel.endswith('.js'):
                        check_path = stage_path if rel.startswith('lhs/') else remote_path(rel)
                        run(ssh, 'node --check ' + shlex.quote(check_path))
            ev['localChecks'] = {'sourceSyntax': True, 'clientMarkers': True}
            (LOCAL / 'prepared.json').write_text(json.dumps(ev, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
            print(json.dumps({'phase': 'prepared', 'files': ev['files'], 'before': ev['before']}, ensure_ascii=False))
        elif args.phase == 'apply':
            ev = json.loads((LOCAL / 'prepared.json').read_text(encoding='utf-8'))
            if (LOCAL / 'apply-started.json').exists():
                raise RuntimeError('APPLY_ALREADY_STARTED_USE_VERIFY')
            with ssh.open_sftp() as sftp:
                for rel, meta in ev['files'].items():
                    actual = remote_digest(ssh, sftp, remote_path(rel))
                    if actual != meta['baseline']:
                        raise RuntimeError('COMMIT_BASELINE_DRIFT:' + rel)
                    staged = REMOTE_STAGE + '/' + REMOTE_FILES[rel]
                    if remote_digest(ssh, sftp, staged) != meta['candidate']:
                        raise RuntimeError('COMMIT_STAGE_DRIFT:' + rel)
            run(ssh, 'mkdir -p ' + shlex.quote(BACKUP))
            for rel in ev['files']:
                src = remote_path(rel)
                dst = BACKUP + '/' + rel
                run(ssh, 'mkdir -p ' + shlex.quote(dst.rsplit('/', 1)[0]) + ' && test ! -e ' + shlex.quote(dst) + ' && cp -p ' + shlex.quote(src) + ' ' + shlex.quote(dst))
                staged = REMOTE_STAGE + '/' + REMOTE_FILES[rel]
                target = remote_path(rel)
                tmp = target + '.minigame-open-20260914'
                run(ssh, 'cp ' + shlex.quote(staged) + ' ' + shlex.quote(tmp) + ' && mv ' + shlex.quote(tmp) + ' ' + shlex.quote(target))
            (LOCAL / 'apply-started.json').write_text(json.dumps({'at': datetime.now(timezone.utc).isoformat(), 'backup': BACKUP}, indent=2) + '\n', encoding='utf-8')
            for proc in PROCS:
                run(ssh, 'pm2 reload ' + shlex.quote(proc) + ' --update-env')
            print(json.dumps({'phase': 'applied', 'processes': inventory(ssh), 'ready': ready(ssh)}, ensure_ascii=False))
        else:
            ev = json.loads((LOCAL / 'prepared.json').read_text(encoding='utf-8'))
            result = {'phase': 'verified', 'at': datetime.now(timezone.utc).isoformat(), 'files': {}, 'processes': inventory(ssh), 'ready': ready(ssh)}
            with ssh.open_sftp() as sftp:
                for rel, meta in ev['files'].items():
                    actual = remote_digest(ssh, sftp, remote_path(rel))
                    if actual != meta['candidate']:
                        raise RuntimeError('LIVE_HASH_MISMATCH:' + rel)
                    result['files'][rel] = actual
            if len(result['processes']) != 3 or any(row['status'] != 'online' for row in result['processes']):
                raise RuntimeError('PM2_NOT_ONLINE')
            if set(result['ready'].values()) != {'200'}:
                raise RuntimeError('READY_CHECK_FAILED')
            served_index = run(ssh, 'curl -fsS --max-time 10 http://127.0.0.1:81/index.html')
            served_start = run(ssh, 'curl -fsS --max-time 10 http://127.0.0.1:81/js/start.min_52ac8d58.js?v=20260914_minigame_open_v1')
            served_main = run(ssh, 'curl -fsS --max-time 10 http://127.0.0.1:81/js/main.min_a6195824.js?v=20260914_minigame_open_v1')
            result['served'] = {
                'indexMarker': '20260914_minigame_open_v1' in served_index,
                'order': 'subGameOrder:[5,6,4,8]' in served_start,
                'visibleCount': 'e=e.splice(0,O.min(4,e.length))' in served_main,
            }
            result['liveProbe'] = live_probe(ssh)
            if not all(result['served'].values()) or result['liveProbe'].get('result') != 'PASS':
                raise RuntimeError('SERVED_OR_LIVE_PROBE_FAILED')
            result['result'] = 'DEPLOY_VERIFIED'
            (LOCAL / 'deploy.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
            print(json.dumps(result, ensure_ascii=False))
    finally:
        ssh.close()


if __name__ == '__main__':
    main()
