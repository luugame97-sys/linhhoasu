"""Guarded alchemy-only rollout; fixture tests never connect to player databases."""
import hashlib, json, shlex, sys
from pathlib import Path
from datetime import datetime, timezone
from snapshot_web_multiserver_20260906 import connect, run, WB
from release_huyenvu_daily_20260906 import hashes, pm2, ready, wait_ready
APP = '/linhhoasu/lhs/newServer'
GAME = '/linhhoasu/webgame/game'
OUT = WB / 'reports/alchemy_release_20260907.json'
def sha(data): return hashlib.sha256(data).hexdigest()
def norm(data): return data.decode('utf-8-sig').replace('\r', '')
def main():
    action = sys.argv[1] if len(sys.argv) > 1 else 'stage'
    s = connect()
    try:
        files = [
            (WB.parent/'linhhoasu/lhs/newServer/src/services/AlchemyCraftService.js', APP+'/src/services/AlchemyCraftService.js'),
            (WB.parent/'linhhoasu/webgame/game/js/lhs-alchemy-v1.js', GAME+'/js/lhs-alchemy-v1.js'),
            (WB.parent/'linhhoasu/webgame/game/index.html', GAME+'/index.html'),
            (WB.parent/'linhhoasu/lhs/newServer/src/handlers/alchemy.js', APP+'/src/handlers/alchemy.js'),
        ]
        if action == 'stage':
            baseline = hashes(s, [target for _, target in files])
            assert baseline[files[0][1]] is None and baseline[files[1][1]] is None, 'EXISTING_NEW_FILE'
            with s.open_sftp() as f:
                for name, target in [('alchemy.js', files[3][1]), ('index.html', files[2][1])]:
                    raw = f.open(target, 'rb').read()
                    expected = norm((WB/'backups/alchemy_fix_20260907'/name).read_bytes())
                    if name == 'alchemy.js':
                        # Verified existing live optimization, retained by the candidate.
                        expected = expected.replace('savePlayer(session.userId, player);', 'savePlayer(session.userId, player, { returnSaved: false });')
                    assert norm(raw) == expected, 'BASELINE_DRIFT_'+name
            stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
            stage = '/linhhoasu/_ai_workbench/temp/alchemy_'+stamp
            run(s, f'install -d -m 700 {stage}/src/services {stage}/src/handlers {stage}/scripts')
            with s.open_sftp() as f:
                for i, (local, _) in enumerate(files): f.put(str(local), stage+'/'+str(i))
                f.put(str(files[0][0]), stage+'/src/services/AlchemyCraftService.js')
                f.put(str(files[3][0]), stage+'/src/handlers/alchemy.js')
                f.put(str(WB.parent/'linhhoasu/lhs/newServer/scripts/test-alchemy-craft.js'), stage+'/scripts/test-alchemy-craft.js')
            env = f'ALCHEMY_SOURCE_ROOT={stage} ALCHEMY_RUNTIME_ROOT={APP} ALCHEMY_MAIN={GAME}/js/main.min_a6195824.js ALCHEMY_PATCH={stage}/1'
            tests = run(s, env+' node '+stage+'/scripts/test-alchemy-craft.js')
            assert '"result":"PASS"' in tests, 'STAGING_TEST_FAIL'
            for i in [0,1,3]: run(s, f'node --check < {stage}/{i}')
            report = {'status':'STAGED','stage':stage,'baseline':baseline,'expected':{t:sha(p.read_bytes()) for p,t in files},'tests':tests,'beforePm2':pm2(s),'ready':ready(s)}
            OUT.write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
            print(json.dumps(report)); return
        assert action == 'deploy'
        report = json.loads(OUT.read_text(encoding='utf-8')); stage = report['stage']
        assert report['status'] == 'STAGED'
        assert hashes(s, list(report['baseline'])) == report['baseline'], 'PREINSTALL_DRIFT'
        assert report['expected'] == {t:sha(p.read_bytes()) for p,t in files}, 'CANDIDATE_DRIFT'
        assert ready(s) == {'8080':200,'8083':200}
        backup = stage.replace('/temp/', '/backups/')
        run(s, f'install -d -m 700 {backup}')
        for i, (_, target) in enumerate(files):
            assert hashes(s,[stage+'/'+str(i)])[stage+'/'+str(i)] == report['expected'][target]
            if report['baseline'][target]: run(s, f'cp -a {target} {backup}/{i}')
        installed, restarted = [], []
        before = pm2(s)
        try:
            for i, (_, target) in enumerate(files):
                run(s, f'install -m 644 {stage}/{i} {target}')
                installed.append((i,target))
            assert hashes(s, list(report['expected'])) == report['expected']
            for name, port in [('lhs-s1002',8083),('lhs-s1001',8080)]:
                restarted.append(name); run(s, 'pm2 restart '+name); wait_ready(s, port)
                print(json.dumps({'restarted':name,'ready':port}),flush=True)
            after = pm2(s)
            assert [p for p in before if p['name'] not in restarted] == [p for p in after if p['name'] not in restarted], 'UNRELATED_PROCESS_DRIFT'
            assert ready(s) == {'8080':200,'8083':200}
            for url, target in [('/',GAME+'/index.html'),('/js/lhs-alchemy-v1.js',GAME+'/js/lhs-alchemy-v1.js')]:
                actual = run(s, 'curl -fsS --max-time 15 '+shlex.quote('http://127.0.0.1:81'+url)+' | sha256sum').split()[0]
                assert actual == report['expected'][target], 'SERVED_DRIFT'
            report.update(status='DEPLOYED', backup=backup, afterPm2=after, ready=ready(s), restarted=restarted)
        except Exception:
            for i,target in reversed(installed):
                if report['baseline'][target]: run(s, f'install -m 644 {backup}/{i} {target}')
                else: run(s, f'mv {target} {backup}/{i}.rolled-back-new')
            for name in restarted: run(s, 'pm2 restart '+name)
            report.update(status='ROLLED_BACK',backup=backup)
            OUT.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
            raise
        OUT.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
        print(json.dumps({'status':report['status'],'backup':backup,'ready':report['ready']}))
    finally: s.close()
if __name__ == '__main__': main()
