"""Read-only remote verification: hashes and anonymized inventory; no upload/restart."""
from __future__ import annotations

import hashlib
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[2]
WB = ROOT / '_ai_workbench'
APP = ROOT / 'linhhoasu/lhs/newServer'


def execute(ssh, source):
    stdin, stdout, stderr = ssh.exec_command('node -', timeout=90)
    stdin.write(source)
    stdin.flush()
    stdin.channel.shutdown_write()
    result = stdout.read().decode('utf-8')
    errors = stderr.read().decode('utf-8', 'replace')
    if stdout.channel.recv_exit_status() != 0:
        raise RuntimeError(errors[-3000:])
    return result


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    credentials = Path(os.environ.get('LHS_PROD_CREDENTIAL_FILE', WB / 'VPS103.116.105.154.txt')).read_text(encoding='utf-8-sig').splitlines()
    fixture = json.loads((WB / 'temp/items_recheck_fixture_20260905.json').read_text(encoding='utf-8'))
    confirmed = sorted(row['id'] for row in fixture['rows'] if row['status'] == 'LOI_DA_XAC_NHAN')
    manifest_script = r"""
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root='/linhhoasu/lhs/newServer'; const hashes={};
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
 const p=path.join(dir,entry.name);if(entry.isDirectory())walk(p);
 else if(entry.isFile()&&p.endsWith('.js'))hashes[path.relative(root,p)]=hash(p);
}}
walk(root+'/src');
for(const name of ['package.json','package-lock.json'])hashes[name]=hash(root+'/'+name);
const config='/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin';
const lang='/linhhoasu/webgame/game/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin';
console.log(JSON.stringify({hashes,config:{path:config,sha256:hash(config)},lang:{path:lang,sha256:hash(lang)}}));
"""
    runtime_script = (WB / 'tools/audit_usable_item_runtime_remote_20260905.js').read_text(encoding='utf-8')
    old = "JSON.parse(fs.readFileSync(process.env.USABLE_ITEM_IDS_PATH, 'utf8'))"
    assert runtime_script.count(old) == 1
    runtime_script = runtime_script.replace(old, json.dumps(confirmed))
    fixture_source = (WB / 'tools/audit_all_usable_items_20260905.js').read_text(encoding='utf-8')
    fixture_source = fixture_source.replace("  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });", '')
    output_line = "  fs.writeFileSync(OUTPUT, `${JSON.stringify(payload, null, 2)}\\n`);"
    assert fixture_source.count(output_line) == 1
    fixture_source = fixture_source.replace(output_line, '  globalThis.__auditFixture = payload;')
    entrypoint = "main().catch((error) => {\n  console.error(error.stack || String(error));\n  process.exitCode = 1;\n});"
    assert fixture_source.count(entrypoint) == 1
    fixture_source = fixture_source.replace(entrypoint, 'module.exports = main;')
    catalog_source = (WB / 'tools/audit_item_catalog_20260905.js').read_text(encoding='utf-8')
    catalog_source = catalog_source.replace("const fixture = JSON.parse(fs.readFileSync(path.join(WB, 'temp/items_recheck_fixture_20260905.json'), 'utf8'));", 'const fixture = globalThis.__auditFixture;')
    catalog_write = "fs.writeFileSync(path.join(WB,'temp/item_catalog_recheck_20260905.json'),JSON.stringify(payload,null,2)+'\\n');"
    assert catalog_source.count(catalog_write) == 1
    catalog_source = catalog_source.replace(catalog_write, 'globalThis.__catalogAudit = payload;')
    offline_script = r"""
process.env.NODE_ENV='audit'; process.env.LOG_DIR='';
process.env.LHS_APP_ROOT='/linhhoasu/lhs/newServer';
process.env.LHS_CONFIG_PATH='/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin';
process.env.LHS_LANG_PATH='/linhhoasu/webgame/game/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin';
const Module=require('module'),fs=require('fs');
for(const method of ['writeFileSync','appendFileSync','mkdirSync','unlinkSync','rmSync','renameSync','createWriteStream']){
 fs[method]=()=>{throw new Error('READ_ONLY_GUARD:'+method);};
}
const log=console.log;console.log=()=>{};
function compile(source,name){const m=new Module(name,module);m.filename=name;m.paths=Module._nodeModulePaths('/linhhoasu/lhs/newServer');m._compile(source,name);return m.exports;}
(async()=>{
 const main=compile(FIXTURE_SOURCE,'/linhhoasu/_ai_workbench/tools/audit_all_usable_items_20260905.js');
 await main();
 compile(CATALOG_SOURCE,'/linhhoasu/_ai_workbench/tools/audit_item_catalog_20260905.js');
 log('RECHECK_REMOTE='+JSON.stringify({fixture:globalThis.__auditFixture,catalog:globalThis.__catalogAudit}));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
""".replace('FIXTURE_SOURCE', json.dumps(fixture_source)).replace('CATALOG_SOURCE', json.dumps(catalog_source))
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    ssh.connect(credentials[0].strip(), username='root', password=credentials[2], look_for_keys=False, allow_agent=False, timeout=20)
    try:
        before = json.loads(execute(ssh, manifest_script))
        remote_result = execute(ssh, offline_script)
        remote_audit = json.loads(remote_result.split('RECHECK_REMOTE=', 1)[1].splitlines()[0])
        for key, filename in [('fixture', 'items_recheck_production_fixture_20260905.json'), ('catalog', 'item_catalog_production_recheck_20260905.json')]:
            (WB / 'temp' / filename).write_text(json.dumps(remote_audit[key], ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        actual_confirmed = sorted(row['id'] for row in remote_audit['fixture']['rows'] if row['status'] == 'LOI_DA_XAC_NHAN')
        assert confirmed == actual_confirmed, 'Production failure IDs differ; regenerate the runtime scope before audit'
        expanded_ids = sorted(set(confirmed) | {row['id'] for row in remote_audit['catalog']['nativeMisroutes']} | {row['id'] for row in remote_audit['catalog']['syntheticOutputs']} | {row['id'] for row in remote_audit['catalog']['indirect']})
        runtime_script = runtime_script.replace('new Set(' + json.dumps(confirmed) + '.map(Number))', 'new Set(' + json.dumps(expanded_ids) + '.map(Number))')
        runtime_output = execute(ssh, runtime_script)
        runtime = json.loads(runtime_output.split('USABLE_ITEM_RUNTIME=', 1)[1].splitlines()[0])
        after = json.loads(execute(ssh, manifest_script))
    finally:
        ssh.close()
    mismatches = []
    local_hashes = {}
    for relative, remote_hash in before['hashes'].items():
        local = APP / relative
        local_hash = hashlib.sha256(local.read_bytes()).hexdigest() if local.exists() else None
        local_hashes[relative] = local_hash
        if local_hash != remote_hash:
            mismatches.append(relative)
    local_only = sorted(str(p.relative_to(APP)).replace('\\', '/') for p in (APP / 'src').rglob('*.js') if str(p.relative_to(APP)).replace('\\', '/') not in before['hashes'])
    for key, relative in [('config', 'linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin'), ('lang', 'linhhoasu/webgame/game/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin')]:
        local_hash = hashlib.sha256((ROOT / relative).read_bytes()).hexdigest()
        before[key]['localSha256'] = local_hash
        before[key]['matchesLocal'] = local_hash == before[key]['sha256']
    unchanged = after['hashes'] == before['hashes'] and all(after[k]['sha256'] == before[k]['sha256'] for k in ['config', 'lang'])
    payload = {'generatedAt': datetime.now(timezone.utc).isoformat(), 'readOnly': True,
               'remoteFilesWritten': 0, 'databaseWrites': 0, 'sourceUnchangedDuringAudit': unchanged,
               'manifest': before, 'localHashes': local_hashes, 'mismatches': mismatches,
               'localOnlySourceFiles': local_only, 'runtime': runtime}
    target = WB / 'temp/items_recheck_live_20260905.json'
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'evidence': str(target), 'remoteFiles': len(before['hashes']), 'mismatches': mismatches,
                      'localOnlySourceFiles': local_only, 'configMatch': before['config']['matchesLocal'],
                      'langMatch': before['lang']['matchesLocal'], 'unchanged': unchanged,
                      'productionFixture': remote_audit['fixture']['summary'], 'productionCatalog': remote_audit['catalog']['summary'],
                      'runtime': {key: {field: value[field] for field in ['humanCount', 'affectedHumans', 'humanItems', 'unclaimedMailItems', 'activeCodeItems']} for key,value in runtime['databases'].items()}}, ensure_ascii=False))


if __name__ == '__main__':
    main()
