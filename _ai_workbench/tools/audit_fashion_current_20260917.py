"""Read-only VPS inventory and RAM probe; write evidence only under local workbench."""
import hashlib
import json
import shlex
import sys
from pathlib import Path
from urllib.request import urlopen

sys.dont_write_bytecode = True
from snapshot_web_multiserver_20260906 import connect, run, WB

OUT = WB / 'temp/fashion_current_audit_20260917'
CLIENT = '/linhhoasu/webgame/game'
APP = '/linhhoasu/lhs/newServer'
FILES = ['index.html', 'js/main.min_drop100.js', 'js/lhs-fashion-gear-v1.js',
         'js/lhs-fashion-box-v1.js', 'js/lhs-fashion-content-v1.js',
         'js/lhs-fashion-choice-v1.js', 'js/lhs-fashion-day1-v1.js',
         'js/lhs-ranged-action-v1.js']

def sha(data):
    return hashlib.sha256(data).hexdigest()

def processes(ssh):
    js = "let t='';process.stdin.on('data',x=>t+=x).on('end',()=>console.log(JSON.stringify(JSON.parse(t).filter(p=>/^lhs-s100[1-4]$/.test(p.name)).map(p=>({name:p.name,pid:p.pid,cwd:p.pm2_env.pm_cwd,status:p.pm2_env.status,restarts:p.pm2_env.restart_time,started:p.pm2_env.pm_uptime,env:Object.fromEntries(Object.entries(p.pm2_env).filter(([k])=>/^(CONFIG_BIN_PATH|FASHION_.*_PATH|DROP_LEVEL_.*_ENABLED)$/.test(k)))})))));"
    return json.loads(run(ssh, 'pm2 jlist | node -e ' + shlex.quote(js)))

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    ssh = connect()
    try:
        before = processes(ssh)
        assert all(p['cwd'] == APP and p['status']=='online' for p in before) and len(before)==4
        manifest = {'processes':before, 'files':[], 'readOnly':True}
        with ssh.open_sftp() as sftp:
            for rel in FILES:
                data = sftp.open(CLIENT+'/'+rel, 'rb').read()
                target = OUT/'client'/rel
                target.parent.mkdir(parents=True,exist_ok=True)
                target.write_bytes(data)
                local = WB.parent/'linhhoasu/webgame/game'/rel
                public = urlopen('http://103.116.105.154:81/'+rel+'?audit=20260917',timeout=25).read()
                manifest['files'].append({'path':CLIENT+'/'+rel,'sha256':sha(data),'localMatch':local.exists() and sha(local.read_bytes())==sha(data),'httpMatch':sha(public)==sha(data),'bytes':len(data)})
            for rel in ['src/handlers/fashion.js','src/services/FashionBoxService.js','src/services/FashionTransactionService.js','src/services/RoleAppearanceService.js','src/services/RewardGrantService.js','src/services/ConfigService.js']:
                data=sftp.open(APP+'/'+rel,'rb').read()
                local=WB.parent/'linhhoasu/lhs/newServer'/rel
                manifest['files'].append({'path':APP+'/'+rel,'sha256':sha(data),'localMatch':local.exists() and sha(local.read_bytes())==sha(data),'bytes':len(data)})
        source=(WB/'tools/audit_fashion_current_20260917.js').read_text(encoding='utf-8')
        env={**before[0]['env'],'FEATURE_APP':APP}
        prefix=''.join('process.env['+json.dumps(k)+']='+json.dumps(v)+';\n' for k,v in env.items())
        audit=json.loads(run(ssh,'node -',prefix+source))
        (OUT/'probe.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        manifest['processesUnchanged']=before==processes(ssh)
        (OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        print(json.dumps({'output':str(OUT),'files':manifest['files'],'processesUnchanged':manifest['processesUnchanged'],'counts':audit['counts'],'passes':audit['passes'],'failures':audit['failures'],'mismatches':audit['mismatches'],'memorySaves':audit['memorySaves'],'networkAttempts':audit['networkAttempts']},ensure_ascii=False))
    finally:
        ssh.close()

def resources():
    import inspect
    import parse_resource_config as manifests
    import decode_bin_manifest as binary
    import inventory_fashion_resources_20260909 as inventory
    source = '\n'.join([
        'import json,struct,zlib,hashlib,re',
        'from pathlib import Path',
        'TYPE_NAMES='+repr(manifests.TYPE_NAMES),
        inspect.getsource(manifests.Reader).replace('class Reader:', 'class ResourceReader:'),
        inspect.getsource(manifests.parse).replace('reader = Reader(data)', 'reader = ResourceReader(data)'),
        inspect.getsource(binary.Reader),
        inspect.getsource(inventory.sha),
        inspect.getsource(inventory.packs),
        inspect.getsource(inventory.atlas_images),
        "base=Path('/linhhoasu/webgame/game/update/resource')",
        "rows={}; meta=[]",
        "for name in ['default.res_326514c1.bin','default.res_main_c669f2c0_fashion_candidate.bin','default.res_cn_main_f70d4753_fashion_candidate.bin']:\n p=base/name\n parsed=parse(p)\n assert parsed['bytes_used']==parsed['bytes_total']\n meta.append({'name':name,'sha256':sha(p.read_bytes()),'resources':parsed['resource_count']})\n rows.update({r['name']:r for r in parsed['resources']})",
        'packed,aliases=packs(base,rows)',
        "entries={k:{'pack':v['pack'],'sha256':v['sha256'],'images':atlas_images(v['payload']) if v['kind']=='atlas' else [],'bytes':len(v['payload'])} for k,v in packed.items()}",
        "missing=[{'name':k,'url':v['url']} for k,v in rows.items() if not (base/v['url']).is_file()]",
        "print(json.dumps({'manifests':meta,'registry':rows,'packed':entries,'aliases':aliases,'missingFiles':missing,'productionWrites':0},ensure_ascii=False))",
    ])
    ssh=connect()
    try:
        data=json.loads(run(ssh,'python3 -',source))
        (OUT/'resources.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        config_row=data['registry'].get('config_bin')
        assert config_row and config_row['url'].startswith('assets/')
        probe="const fs=require('fs'),crypto=require('crypto');const p=require.resolve('/linhhoasu/lhs/newServer/src/logger');require.cache[p]={id:p,filename:p,loaded:true,exports:{info(){},warn(){},error(){},debug(){}}};const c=require('/linhhoasu/lhs/newServer/src/services/ConfigService');const t=c.decodeTables(fs.readFileSync("+json.dumps('/linhhoasu/webgame/game/update/resource/'+config_row['url'])+"));console.log(JSON.stringify({hashes:Object.fromEntries(Object.entries(t).filter(([n])=>/^Fashion/.test(n)||['AppearanceConfig','AssetsConfig'].includes(n)).map(([k,v])=>[k,crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex')])),counts:{suits:Object.keys(t.FashionDressConfig).length,fashion:Object.keys(t.FashionConfig).length}}));"
        client=json.loads(run(ssh,'node -',probe))
        server=json.loads((OUT/'probe.json').read_text(encoding='utf-8'))
        client['configResource']=config_row
        client['matchingServer']={k:v==server['configHashes'].get(k) for k,v in client['hashes'].items()}
        (OUT/'client-config.json').write_text(json.dumps(client,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        print(json.dumps({'manifests':data['manifests'],'packed':len(data['packed']),'aliases':len(data['aliases']),'missingFiles':data['missingFiles'][:30],'missingFileCount':len(data['missingFiles']),'client':client},ensure_ascii=False))
    finally: ssh.close()

if __name__=='__main__':
    if len(sys.argv)>1 and sys.argv[1]=='resources': resources()
    else: main()
