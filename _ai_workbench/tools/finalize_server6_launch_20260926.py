"""Finish the already staged S6 launch after a client-side timeout."""
import json
import shlex
import sys
import time
from pathlib import Path

from snapshot_web_multiserver_20260906 import connect, run

APP = '/linhhoasu/lhs/newServer'
SID = 1006
OPEN = 1790424000000
PORTS = {'lhs-s1001': 8080, 'lhs-s1002': 8083, 'lhs-s1003': 8084,
         'lhs-s1004': 8085, 'lhs-s1005': 8086, 'lhs-s1006': 8087}


def node(ssh, source):
    return run(ssh, 'node -e ' + shlex.quote(source))


def ready(ssh, port):
    last = ''
    for _ in range(30):
        try:
            raw = run(ssh, f'curl -fsS --max-time 5 http://127.0.0.1:{port}/ready')
            last = json.loads(raw)
            if last.get('status') == 'ok' and last.get('checks') == {'mongo': True, 'redis': True}:
                return last
        except Exception as error:
            last = str(error)
        time.sleep(1)
    raise RuntimeError(f'NOT_READY:{port}:{last}')


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    ssh = connect()
    try:
        files = run(ssh, "test -s /linhhoasu/lhs/newServer/scripts/start-scheduled-bots-s6.js && node --check /linhhoasu/lhs/newServer/ecosystem.config.js && node --check /linhhoasu/lhs/newServer/scripts/start-scheduled-bots-s6.js && echo FILES_OK").strip()
        if files != 'FILES_OK':
            raise RuntimeError('S6_FILES_NOT_READY')
        ready(ssh, 8087)
        publish = "const {MongoClient}=require('" + APP + "/node_modules/mongodb');(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017');await c.connect();const db=c.db('lhs_s1001');const q=" + json.dumps({'serverId': SID, 'openTime': OPEN}, ensure_ascii=False) + ";const current=await db.collection('gameservers').findOne(q);if(current&&current.running===true&&current.status===1){console.log('S6_ALREADY_PUBLISHED_TIME_GATE_ACTIVE');await c.close();return;}const x=await db.collection('gameservers').updateOne({...q,running:false,status:0},{$set:{running:true,status:1}});const matched=Number(x.matchedCount ?? x.n ?? 0);if(matched!==1)throw Error('S6_CAS_PUBLISH_FAILED');await c.close();console.log('S6_PUBLISHED_TIME_GATE_ACTIVE')})().catch(e=>{console.error(e.message);process.exit(1)});"
        print(node(ssh, publish).strip(), flush=True)
        run(ssh, 'cd ' + APP + ' && pm2 start ecosystem.config.js --only lhs-real-bots-s6')
        run(ssh, 'nginx -t && nginx -s reload')
        for name, port in PORTS.items():
            item = ready(ssh, port)
            print(name + '_READY ' + json.dumps(item, ensure_ascii=False), flush=True)
        run(ssh, 'pm2 save')
        print('S6_FINALIZED', flush=True)
    finally:
        ssh.close()


if __name__ == '__main__':
    main()
