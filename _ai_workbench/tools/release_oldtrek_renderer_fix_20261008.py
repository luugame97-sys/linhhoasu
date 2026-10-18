"""Static-only OldTrek renderer release. Exact bytes, backup, CAS and rollback."""
import hashlib
import json
import shlex
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from release_petsoul_day1_20261007 import connect, run, procs, ready, rh

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench/temp/oldtrek_renderer_fix_20261008'
MANIFEST = OUT / 'release.json'
REMOTE = '/linhhoasu/'
ALLOW = ['webgame/game/js/main.min_drop200.js', 'webgame/game/index.html']
SENTINELS = ['lhs/newServer/src/handlers/old-trek.js', 'lhs/newServer/src/services/PlayerService.js',
             'lhs/newServer/src/services/Activity52Service.js', 'lhs/newServer/src/services/EventExposureGate.js',
             'lhs/newServer/src/config/eventRotation.json', 'webgame/game/js/lhs-fulu-safe-v1.js',
             'webgame/game/js/lhs-oldtrek-errors-v1.js']


def save(m):
    MANIFEST.write_text(json.dumps(m, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')


def stamp():
    return datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')


def swap(s, src, dst, digest):
    tmp = dst + '.oldtrek_renderer_fix.tmp'
    q = shlex.quote
    run(s, 'test ! -e '+q(tmp)+' && cp -p '+q(src)+' '+q(tmp)
        +' && chmod --reference='+q(dst)+' '+q(tmp)+' && chown --reference='+q(dst)+' '+q(tmp))
    if rh(s,tmp) != digest:
        raise RuntimeError('STAGED_HASH')
    run(s, 'mv -f '+q(tmp)+' '+q(dst))
    if rh(s,dst) != digest:
        raise RuntimeError('SWAP_HASH')


def rollback(s, m):
    for r in reversed(m['files']):
        dst = REMOTE+r['relative']
        current = rh(s,dst)
        if current == r['expected']:
            continue
        if current != r['candidate']:
            raise RuntimeError('ROLLBACK_DRIFT:'+r['relative'])
        src = m['backup']+'/'+r['relative']
        if rh(s,src) != r['expected']:
            raise RuntimeError('ROLLBACK_PREIMAGE')
        swap(s,src,dst,r['expected'])
    m['phase'] = 'rolled_back'
    save(m)


def main():
    m = json.loads(MANIFEST.read_text(encoding='utf-8'))
    if [r['relative'] for r in m['files']] != ALLOW:
        raise RuntimeError('FILE_SCOPE')
    mode = sys.argv[1] if len(sys.argv)>1 else 'deploy'
    s = connect()
    try:
        if mode == 'rollback':
            rollback(s,m)
            print(json.dumps({'phase':m['phase']})); return
        if m['phase'] not in ['candidate','rolled_back']:
            raise RuntimeError('ALREADY_STARTED:'+m['phase'])
        qa = json.loads((OUT/'renderer-tests.json').read_text(encoding='utf-8'))
        if qa['result']!='PASS' or qa['baselineMissingEffectsReproduced']!=32 or qa['nativeRendererCases']!=2103:
            raise RuntimeError('QA_GATE')
        m['tests'] = qa
        m['preProcesses'] = procs(s)
        m['sentinels'] = {p:rh(s,REMOTE+p) for p in SENTINELS}
        reuse_backup = m['phase'] == 'rolled_back'
        if not reuse_backup:
            m['stage'] = REMOTE+'_ai_workbench/temp/oldtrek_renderer_fix_'+stamp()
            m['backup'] = REMOTE+'_ai_workbench/backups/oldtrek_renderer_fix_'+stamp()
        for r in m['files']:
            if rh(s,REMOTE+r['relative'])!=r['expected']:
                raise RuntimeError('PREFLIGHT_DRIFT:'+r['relative'])
            src=OUT/'candidate'/r['relative']
            if hashlib.sha256(src.read_bytes()).hexdigest()!=r['candidate']:
                raise RuntimeError('CANDIDATE_HASH')
            dst=m['stage']+'/'+r['relative']
            run(s,'mkdir -p '+shlex.quote(dst.rsplit('/',1)[0]))
            with s.open_sftp() as sf:
                sf.put(str(src),dst)
            if rh(s,dst)!=r['candidate']:
                raise RuntimeError('UPLOAD_HASH')
            if dst.endswith('.js'):
                run(s,'node --check '+shlex.quote(dst),30)
        if not reuse_backup:
            run(s,'test ! -e '+shlex.quote(m['backup'])+' && mkdir -p '+shlex.quote(m['backup']))
        for r in m['files']:
            dst=m['backup']+'/'+r['relative']
            if not reuse_backup:
                run(s,'mkdir -p '+shlex.quote(dst.rsplit('/',1)[0])+' && cp -p '+shlex.quote(REMOTE+r['relative'])+' '+shlex.quote(dst))
            if rh(s,dst)!=r['expected']:
                raise RuntimeError('BACKUP_HASH')
        m.update(phase='prepared',published=[])
        save(m)
        try:
            for r in m['files']:
                dst=REMOTE+r['relative']
                if rh(s,dst)!=r['expected']:
                    raise RuntimeError('PUBLISH_DRIFT:'+r['relative'])
                swap(s,m['stage']+'/'+r['relative'],dst,r['candidate'])
                m['published'].append(r['relative']);save(m)
            m['phase']='published';save(m)
            mainrow=m['files'][0]
            m['public']={}
            for base in ['http://103.116.104.165:81/','https://linhhoasu.lol/']:
                url=base+'js/main.min_drop200.js?v='+m['version']
                if base.startswith('https:'):
                    # The public edge rejects this desktop Python HTTP client.
                    # Read the same public URL using the VPS curl connection.
                    digest=run(s,'set -o pipefail; curl -fsS --max-time 45 '+shlex.quote(url)+' | sha256sum',50).split()[0]
                else:
                    with urllib.request.urlopen(url,timeout=45) as response:
                        digest=hashlib.sha256(response.read()).hexdigest()
                if digest!=mainrow['candidate']:
                    raise RuntimeError('SERVED_JS_HASH:'+base)
                if base.startswith('https:'):
                    index=run(s,'curl -fsS --max-time 30 '+shlex.quote(base+'index.html?v='+m['version']),35)
                else:
                    with urllib.request.urlopen(base+'index.html?v='+m['version'],timeout=30) as response:
                        index=response.read().decode('utf-8')
                if 'main.min_drop200.js?v='+m['version'] not in index or 'lhs-fulu-safe-v1.js?v=20261008_fulu_safe_v4' not in index:
                    raise RuntimeError('INDEX_MARKER:'+base)
                m['public'][base]={'mainHash':digest,'indexMarker':True,'fuluPreserved':True}
            m['postProcesses']=procs(s)
            if m['postProcesses']!=m['preProcesses']:
                raise RuntimeError('UNEXPECTED_PROCESS_CHANGE')
            if {p:rh(s,REMOTE+p) for p in SENTINELS}!=m['sentinels']:
                raise RuntimeError('UNRELATED_SOURCE_CHANGED')
            m['ready']={f'S{i}':ready(s,f'lhs-s100{i}',3) for i in range(1,8)}
            m['finalHashes']={r['relative']:rh(s,REMOTE+r['relative']) for r in m['files']}
            if any(m['finalHashes'][r['relative']]!=r['candidate'] for r in m['files']):
                raise RuntimeError('FINAL_HASH')
            m.update(phase='verified',result='PASS',restarts=0,productionPlayerWrites=0,verifiedAt=datetime.now(timezone.utc).isoformat())
            m.pop('lastError',None)
            save(m)
        except Exception:
            rollback(s,m)
            raise
        print(json.dumps({k:m[k] for k in ['phase','result','backup','public','restarts','productionPlayerWrites']}),flush=True)
    except Exception as error:
        m['lastError']=str(error);save(m);raise
    finally:
        s.close()


if __name__=='__main__':
    main()
