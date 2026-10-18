"""Apply the prepared reward edit and restart each game node with readiness gates."""
from pathlib import Path
import json
import sys
import time
from auction_ops_20261015 import connect, run

ROOT = Path(__file__).resolve().parents[2]
LOCAL = ROOT / '_ai_workbench/temp/cross_rival_top1_20261017/all_ranks'
REMOTE = '/linhhoasu/_ai_workbench/temp/cross_rival_top1_20261017/all_ranks'
NODE_SNAPSHOT = "node -e \"const cp=require('child_process');console.log(JSON.stringify(JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8',maxBuffer:8e6})).map(n=>({name:n.name,pid:n.pid,status:n.pm2_env.status,restarts:n.pm2_env.restart_time,port:n.pm2_env.HTTP_PORT,cwd:n.pm2_env.pm_cwd}))))\""

def save(name, value):
    (LOCAL / name).write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')

def main():
    sys.stdout.reconfigure(encoding='utf-8')
    c = connect()
    receipt = {'restarts': [], 'status': 'STARTING', 'directPlayerWrites': 0}
    try:
        with c.open_sftp() as s:
            s.put(str(ROOT / '_ai_workbench/tools/release_cross_rival_top1_20261017.js'), REMOTE + '/release.js')
        before = json.loads(run(c, NODE_SNAPSHOT))
        expected = json.loads((LOCAL / 'preflight.json').read_text(encoding='utf-8'))['nodes']
        by_name = {n['name']: n for n in before}
        deployment_path = LOCAL / 'deployment.json'
        resuming = deployment_path.exists()
        for n in expected:
            current = by_name[n['name']]
            original = current['pid'] == n['pid'] and current['restarts'] == n['restarts']
            already_restarted = resuming and current['pid'] != n['pid'] and current['restarts'] == n['restarts'] + 1
            assert original or already_restarted, 'PRE_APPLY_PROCESS_DRIFT:' + n['name']
            ready = json.loads(run(c, 'curl -fsS --max-time 5 http://127.0.0.1:' + str(n['port']) + '/ready'))
            assert ready['checks']['mongo'] and ready['checks']['redis'], 'PRE_READY:' + n['name']
        if resuming:
            applied = json.loads(deployment_path.read_text(encoding='utf-8'))
            assert applied['status'] == 'FILES_APPLIED', 'UNEXPECTED_DEPLOYMENT_STATUS'
            verify_hashes = "node -e \"const fs=require('fs'),crypto=require('crypto'),m=JSON.parse(fs.readFileSync('" + REMOTE + "/release.json','utf8'));for(const f of m.files)if(crypto.createHash('sha256').update(fs.readFileSync('/linhhoasu/'+f.relative)).digest('hex')!==f.after)throw Error('RESUME_HASH:'+f.relative);console.log('RESUME_HASH_PASS')\""
            assert 'RESUME_HASH_PASS' in run(c, verify_hashes)
        else:
            applied = json.loads(run(c, 'cd /linhhoasu/lhs/newServer && timeout 30s node ' + REMOTE + '/release.js apply', timeout=35))
            save('deployment.json', applied)
        receipt['backup'] = applied['backup']
        print(json.dumps({'status': applied['status'], 'backup': applied['backup']}), flush=True)
        for n in expected:
            name = n['name']
            assert name.startswith('lhs-s') and name[5:].isdigit()
            current = next(p for p in json.loads(run(c, NODE_SNAPSHOT)) if p['name'] == name)
            if current['restarts'] == n['restarts']:
                run(c, 'pm2 restart ' + name + ' >/dev/null', timeout=25)
            else:
                assert current['pid'] != n['pid'] and current['restarts'] == n['restarts'] + 1, 'RESUME_PROCESS_DRIFT:' + name
            ready = None
            for attempt in range(80):
                try:
                    body = json.loads(run(c, 'curl -fsS --max-time 3 http://127.0.0.1:' + str(n['port']) + '/ready', timeout=5))
                    if body.get('checks', {}).get('mongo') and body.get('checks', {}).get('redis'):
                        ready = body
                        break
                except RuntimeError:
                    pass
                time.sleep(0.5)
            assert ready, 'POST_READY:' + name
            current = next(p for p in json.loads(run(c, NODE_SNAPSHOT)) if p['name'] == name)
            assert current['status'] == 'online' and current['pid'] != n['pid'] and current['restarts'] == n['restarts'] + 1, 'RESTART_INVARIANT:' + name
            receipt['restarts'].append({'name': name, 'pid': current['pid'], 'restarts': current['restarts'], 'ready': ready})
            save('rollout.json', receipt)
            print(json.dumps({'server': name, 'ready': True, 'pid': current['pid']}), flush=True)
        run(c, 'pm2 save >/dev/null', timeout=15)
        final = json.loads(run(c, NODE_SNAPSHOT))
        targets = {n['name'] for n in expected}
        for n in before:
            if n['name'] in targets:
                continue
            current = next(p for p in final if p['name'] == n['name'])
            assert current['pid'] == n['pid'] and current['restarts'] == n['restarts'], 'OUT_OF_SCOPE_PROCESS_CHANGED:' + n['name']
        receipt['outsideProcessesUnchanged'] = True
        receipt['status'] = 'RESTARTED_9_OF_9'
        save('rollout.json', receipt)
        verified = json.loads(run(c, 'cd /linhhoasu/lhs/newServer && timeout 55s node ' + REMOTE + '/release.js verify', timeout=60))
        save('verification.json', verified)
        receipt['status'] = 'DEPLOYED_VERIFIED'
        print(json.dumps({'status': receipt['status'], 'ready': len(verified['runtime']), 'https': len(verified['https']), 'top1': verified['top1']}, ensure_ascii=False), flush=True)
    finally:
        save('rollout.json', receipt)
        c.close()

if __name__ == '__main__':
    main()
