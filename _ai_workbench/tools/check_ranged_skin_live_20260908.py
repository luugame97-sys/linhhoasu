"""Read-only hashes, narrow config digests and bounded aggregate log tails."""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from snapshot_web_multiserver_20260906 import WB, connect
from release_huyenvu_daily_20260906 import run, hashes, ready, pm2

OUT = WB / 'temp/ranged_skin_stutter_20260908'


def main():
    ssh = connect()
    try:
        before = pm2(ssh)
        relative = [
            'linhhoasu/webgame/game/js/main.min_a6195824.js',
            'linhhoasu/webgame/game/index.html',
            'linhhoasu/webgame/game/js/lhs-fashion-gear-v1.js',
            'linhhoasu/lhs/newServer/src/handlers/box.js',
        ]
        remote = hashes(ssh, ['/' + path for path in relative])
        matched = {path: remote['/' + path] == hashlib.sha256((WB.parent / path).read_bytes()).hexdigest() for path in relative}
        config_js = "const c=require('/linhhoasu/lhs/newServer/src/services/ConfigService'),h=require('crypto');console.log(JSON.stringify(Object.fromEntries(['FashionConfig','AppearanceConfig','EffectConfig'].map(n=>[n,h.createHash('sha256').update(JSON.stringify(c.get(n))).digest('hex')]))));"
        config_hashes = json.loads(run(ssh, 'node -', config_js).strip().splitlines()[-1])
        log_js = r"""const fs=require('fs'),out=[];
for(const server of ['lhs-s1001','lhs-s1002'])for(const kind of ['error','out']){
 const path='/root/.pm2/logs/'+server+'-'+kind+'.log';if(!fs.existsSync(path))continue;
 const size=fs.statSync(path).size,length=Math.min(size,262144),buffer=Buffer.alloc(length),fd=fs.openSync(path,'r');
 fs.readSync(fd,buffer,0,length,size-length);fs.closeSync(fd);
 const text=buffer.toString('utf8'),lines=text.split('\n');if(size>length)lines.shift();
 const patterns={exceptions:/TypeError|ReferenceError|uncaught exception|unhandled rejection/,missingModule:/Cannot find module/,openDenied:/\[Box\] open denied/,tooFar:/\[Box\].*reason=too_far/,claimFailure:/\[Box\].*(claim.*expir|claim.*fail|pending_reward)/i,saveFailure:/\[Box\].*save failed/,rewards:/\[Box\] reward/,mongooseWarning:/reserved schema/};
 out.push({server,kind,tailBytes:length,counts:Object.fromEntries(Object.entries(patterns).map(([name,re])=>[name,lines.filter(x=>re.test(x)).length]))});
}console.log(JSON.stringify(out));"""
        logs = json.loads(run(ssh, 'node -', log_js))
        audit = json.loads((OUT / 'audit.json').read_text(encoding='utf-8'))
        result = {'at': datetime.now(timezone.utc).isoformat(), 'readOnly': True,
                  'filesMatch': matched, 'remoteHashes': remote,
                  'configTableHashes': config_hashes,
                  'configMatchesLocalAudit': config_hashes == audit['configTableHashes'],
                  'ready': ready(ssh), 'pm2Unchanged': pm2(ssh) == before,
                  'logTailAggregates': logs, 'productionWrites': 0,
                  'caveat': 'Server log tails are not a player browser trace and cannot prove or exclude a client animation stall.'}
        assert all(matched.values()) and result['configMatchesLocalAudit']
        (OUT / 'live.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(json.dumps(result))
    finally:
        ssh.close()


if __name__ == '__main__':
    main()
