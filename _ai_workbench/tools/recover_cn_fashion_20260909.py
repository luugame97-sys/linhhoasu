"""Fetch only manifest-listed public CN fashion resources into the workbench."""
import concurrent.futures
import hashlib
import json
import re
import sys
import urllib.request
import zlib
from pathlib import Path

from parse_resource_config import parse

WB = Path(__file__).resolve().parents[1]
OUT = WB / 'temp/fashion_cn_recovery_20260909'
REFERENCE = WB / 'temp/cn_origin_70000001_20260831'
BASE = 'https://lhsupdate.guangzhougy.com/update/resource/'


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def registry():
    rows = {}
    inputs = []
    current = json.loads((OUT / 'current-build.json').read_text(encoding='utf-8')) if (OUT / 'current-build.json').exists() else None
    for name in current['manifests'] if current else ['default.res_main_e6b9a080.bin', 'default.res_cn_main_5b670eb9.bin']:
        path = OUT / 'raw' / name if current else REFERENCE / 'resource' / name
        result = parse(path)
        assert result['bytes_total'] == result['bytes_used']
        rows.update({row['name']: row for row in result['resources']})
        inputs.append({'path': str(path), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'resources': len(result['resources'])})
    return rows, inputs


def fetch(row):
    rel = row['url']
    assert not rel.startswith('/') and '..' not in Path(rel).parts and ':' not in rel
    target = OUT / 'raw' / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    url = row.get('base', BASE) + rel
    actual = target
    expected = re.search(r'_([0-9a-f]{1,8})\.[a-z]+$', rel)
    local = WB.parent / 'linhhoasu/webgame/game/update/resource' / rel
    storage = 'downloaded'
    if target.exists():
        data = target.read_bytes()
        cached = True
        storage = 'download-cache'
    elif row.get('allowLocalReuse') and expected and local.is_file() and (zlib.crc32(local.read_bytes()) & 0xffffffff) == int(expected.group(1), 16):
        data = local.read_bytes()
        actual, cached, storage = local, True, 'existing-local-CRC-verified'
    else:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=45) as response:
            assert response.status == 200
            data = response.read(32 * 1024 * 1024 + 1)
        assert 0 < len(data) <= 32 * 1024 * 1024
        assert not data.lstrip().lower().startswith((b'<!doctype html', b'<html'))
        cached = False
    if expected:
        assert zlib.crc32(data) & 0xffffffff == int(expected.group(1), 16), 'RESOURCE_CRC_MISMATCH: ' + rel
    if not cached:
        target.write_bytes(data)
    return {'name': row['name'], 'url': url, 'path': str(target.relative_to(OUT)),
            'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(),
            'manifestSize': row.get('size'), 'cached': cached, 'storedAt': str(actual), 'storage': storage}


def main():
    action = sys.argv[1] if len(sys.argv) > 1 else 'config'
    if action == 'refresh':
        current = json.loads((OUT / 'cn-entrypoint.json').read_text(encoding='utf-8'))
        source = (OUT / 'cn-entrypoint.txt').read_text(encoding='utf-8')
        static = re.search(r'var JS_URL_PREFIX\s*=\s*"(https://[^"\s]+/)"', source).group(1)
        wanted = [{'name': name, 'url': name, 'base': static} for name in current['js'] if '/main.' in name or '/start.' in name]
        wanted += [{'name': name, 'url': name} for name in current['manifests']]
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            files = list(pool.map(fetch, wanted))
        current['files'] = files
        write_json(OUT / 'current-build.json', current)
        print(json.dumps({'action': action, 'files': len(files), 'bytes': sum(r['bytes'] for r in files), 'manifests': current['manifests']}))
        return
    rows, inputs = registry()
    if action == 'config':
        wanted = [rows['config_bin'], rows['config_lang_bin']]
    elif action == 'packs':
        wanted = [rows[kind + suffix + '_pack_bin'] for kind in ['atlas', 'skel', 'plist'] for suffix in ['', '_lang']]
    elif action == 'assets':
        names = json.loads((OUT / 'asset-selection.json').read_text(encoding='utf-8'))
        wanted = [{**rows[name], 'allowLocalReuse': True} for name in names]
    else:
        raise ValueError('action must be config, packs or assets')
    results, errors = [], []
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        jobs = {pool.submit(fetch, row): row for row in wanted}
        for future in concurrent.futures.as_completed(jobs):
            row = jobs[future]
            try:
                results.append(future.result())
            except Exception as error:
                errors.append({'name': row['name'], 'url': BASE + row['url'], 'error': str(error)})
    result = {'action': action, 'base': BASE, 'referenceManifests': inputs,
              'files': sorted(results, key=lambda row: row['name']), 'errors': errors}
    write_json(OUT / (action + '-download.json'), result)
    if action == 'config':
        write_json(OUT / 'resource-index.json', rows)
    print(json.dumps({'action': action, 'collected': len(results), 'reusedLocal': sum(r.get('storage')=='existing-local-CRC-verified' for r in results), 'bytes': sum(r['bytes'] for r in results), 'errors': errors}))
    if errors:
        sys.exit(1)


if __name__ == '__main__':
    main()
