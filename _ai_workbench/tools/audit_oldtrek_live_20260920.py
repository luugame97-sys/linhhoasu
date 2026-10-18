"""Read-only live inventory and isolated RAM reproduction, no production writes."""
import difflib
import hashlib
import json
from pathlib import Path
import sys

from snapshot_web_multiserver_20260906 import connect, run

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench/temp/oldtrek_live_audit_20260920.json'
APP = '/linhhoasu/lhs/newServer'
FILES = [
    'src/handlers/old-trek.js', 'src/services/OldTrekScheduleService.js',
    'src/handlers/bid-king.js', 'src/handlers/compat.js', 'src/net/WSServer.js',
    'src/services/PlayerService.js', 'src/handlers/fish-soul.js',
]

def node(ssh, source):
    output = run(ssh, 'cd ' + APP + ' && node', source)
    return json.loads(output)

def main():
    ssh = connect()
    try:
        evidence = {'readOnly': True, 'productionPlayerWrites': 0, 'files': {}, 'differences': {}}
        with ssh.open_sftp() as sftp:
            for rel in FILES:
                with sftp.open(APP + '/' + rel, 'rb') as stream:
                    remote = stream.read()
                local = (ROOT / 'linhhoasu/lhs/newServer' / rel).read_bytes()
                evidence['files'][rel] = {'liveSha256': hashlib.sha256(remote).hexdigest(),
                    'localSha256': hashlib.sha256(local).hexdigest(), 'equal': remote == local}
                if remote != local:
                    evidence['differences'][rel] = ''.join(difflib.unified_diff(
                        remote.decode('utf-8-sig').splitlines(True), local.decode('utf-8-sig').splitlines(True),
                        fromfile='live/' + rel, tofile='local/' + rel))[:7000]
            with sftp.open('/linhhoasu/webgame/game/js/main.min_drop100.js', 'rb') as stream:
                remote = stream.read()
            local = (ROOT / 'linhhoasu/webgame/game/js/main.min_drop100.js').read_bytes()
            evidence['client'] = {'liveSha256': hashlib.sha256(remote).hexdigest(),
                'localSha256': hashlib.sha256(local).hexdigest(), 'equal': remote == local}
            # Exact OldTrek routing and refreshed compat function only, no environment secrets.
            with sftp.open(APP + '/src/handlers/index.js', 'rb') as stream:
                index = stream.read().decode('utf-8-sig')
            evidence['routes'] = index[index.index('  router.register(7000'):index.index('  router.register(11000')]
        evidence['runtime'] = node(ssh, r'''
const cp=require('child_process'),fs=require('fs');
const pms=JSON.parse(cp.execSync('pm2 jlist',{encoding:'utf8'})).filter(x=>/^lhs-s100[1-5]$/.test(x.name));
const lp=require.resolve('./src/logger');require.cache[lp]={id:lp,filename:lp,loaded:true,exports:{info(){},warn(){},debug(){},error(){}}};
const cfg=require('./src/services/ConfigService'),crypto=require('crypto');
const localDirs=fs.readdirSync('src/services').filter(x=>/OldTrek|BidKing/.test(x));
const schedule=require('./src/services/OldTrekScheduleService').getSchedule();
const tableHashes={};for(const name of fs.readdirSync('scripts/_tables_dump').filter(x=>/^OldTrek.*\.json$/.test(x)).map(x=>x.slice(0,-5)))tableHashes[name]=crypto.createHash('sha256').update(JSON.stringify(cfg.get(name))).digest('hex');
const mongoose=require('mongoose');
(async()=>{const dbs=[];const live=[];
for(const pm of pms){
 const uri=pm.pm2_env.MONGO_URI||pm.pm2_env.env?.MONGO_URI;if(!uri)throw Error('MONGO_URI_MISSING');
 const conn=await mongoose.createConnection(uri,{autoIndex:false,autoCreate:false,serverSelectionTimeoutMS:5000}).asPromise();
 const col=conn.db.collection('players');const withInfo={'other_attr_info.oldTrekInfo':{$exists:true}};
 const summary={server:pm.name,total:await col.countDocuments({}),withInfo:await col.countDocuments(withInfo),sailing:await col.countDocuments({'other_attr_info.oldTrekInfo.sailing':true}),events:await col.countDocuments({'other_attr_info.oldTrekInfo.sailInfo.currentEvent':{$ne:null}})};
 const rows=await col.find({'other_attr_info.oldTrekInfo.sailing':true},{projection:{_id:0,name:1,'other_attr_info.oldTrekInfo.lv':1,'other_attr_info.oldTrekInfo.exp':1,'other_attr_info.oldTrekInfo.sailInfo':1,'other_attr_info.oldTrekInfo.taskRecord':1}}).limit(10).toArray();
 dbs.push(summary);live.push({server:pm.name,rows});await conn.close();
}
console.log(JSON.stringify({at:new Date().toISOString(),processes:pms.map(p=>({name:p.name,status:p.pm2_env.status,pid:p.pid,restarts:p.pm2_env.restart_time,cwd:p.pm2_env.pm_cwd})),schedule,localServices:localDirs,tableHashes,dbs,live}));
})().catch(e=>{console.error(e.message);process.exitCode=1});
''')
        # Reuse exact diagnostic with only workspace/output paths adapted; all game writes remain mocks.
        harness = (ROOT / '_ai_workbench/tools/audit_oldtrek_contract_20260920.js').read_text(encoding='utf-8')
        harness = harness.replace("const root = path.resolve(__dirname, '../..');", "const root = '/';")
        harness = harness.replace("  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\\n');", "  // No remote evidence file write.")
        evidence['reproduction'] = node(ssh, harness)
        OUT.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(json.dumps({'output': str(OUT), 'files': evidence['files'], 'differences': evidence['differences'],
            'client': evidence['client'], 'runtimeAt': evidence['runtime']['at'], 'dbs': evidence['runtime']['dbs'],
            'reproduced': evidence['reproduction']['reproduced'], 'harnessFailed': evidence['reproduction']['harnessFailed']}, ensure_ascii=False, indent=2))
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
