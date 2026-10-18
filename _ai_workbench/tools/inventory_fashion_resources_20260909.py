"""Compare fashion resource graphs and extract exact CN pack entries, no live writes."""
import hashlib
import json
import re
import zlib
from pathlib import Path

from decode_bin_manifest import Reader
from parse_resource_config import parse
from recover_cn_fashion_20260909 import OUT, WB, registry, write_json


def sha(data):
    return hashlib.sha256(data).hexdigest()


def packs(root, rows):
    entries, aliases = {}, {}
    for kind in ['atlas', 'skel', 'plist']:
        for suffix in ['', '_lang']:
            row = rows.get(kind + suffix + '_pack_bin')
            if not row:
                continue
            raw = (root / row['url']).read_bytes()
            try:
                raw = zlib.decompress(raw)
            except zlib.error:
                pass
            reader = Reader(raw)
            while reader.pos < len(raw):
                start = reader.pos
                name = reader.utf8(reader.auto(False))
                length = reader.auto(False)
                payload_start = reader.pos
                payload = reader.bytes(length)
                key = name + {'atlas': '_atlas', 'skel': '_skel', 'plist': '_json'}[kind]
                entry = {'name': key, 'kind': kind, 'pack': row['url'], 'payload': payload,
                         'chunk': raw[start:reader.pos], 'sha256': sha(payload), 'offset': payload_start}
                entries[key] = entry
                if kind == 'plist':
                    r = Reader(payload)
                    for _ in range(r.auto(False)):
                        frame = r.utf8(r.auto(False))
                        for _ in range(4):
                            r.auto(False)
                        if r.u8():
                            r.auto(True); r.auto(True); r.auto(False); r.auto(False)
                        aliases[frame] = {'packKey': key, 'texture': name + '_png'}
                    assert r.pos == len(payload), key
            assert reader.pos == len(raw)
    return entries, aliases


def atlas_images(payload):
    r, images = Reader(payload), []
    while True:
        length = r.auto(False)
        if not length:
            break
        images.append(r.utf8(length) + '_png')
        r.auto(False); r.auto(False); r.u8()
        trimmed = r.auto(False)
        index = 0
        while True:
            length = r.auto(False)
            if not length:
                break
            r.utf8(length); r.u8()
            for _ in range(4):
                r.auto(False)
            if index < trimmed:
                for _ in range(4):
                    r.auto(False)
            index += 1
    assert r.pos == len(payload)
    return images


def resolve(strings, rows, packed, aliases):
    files, chunks, unresolved, seen = set(), set(), [], set()
    queue = []
    for value in strings:
        candidates = [value + suffix for suffix in ['', '_png', '_jpg', '_mp3', '_skel', '_atlas']]
        found = [key for key in candidates if key in rows or key in packed or key in aliases]
        if not found and re.match(r'^(sp_|icon_|head_|yr_|tcly_|attack_|ui_)', value):
            unresolved.append(value)
        queue += found
        # Native equipment can load extra back/head pieces dynamically.
        if value.startswith('sp_equip_'):
            queue += [key for part in ['_b', '_h'] for key in [value + part + '_skel', value + part + '_atlas'] if key in rows or key in packed]
    while queue:
        key = queue.pop()
        if key in seen:
            continue
        seen.add(key)
        if key in aliases:
            queue += [aliases[key]['packKey'], aliases[key]['texture']]
        if key in packed:
            entry = packed[key]
            chunks.add(key)
            if entry['kind'] == 'atlas':
                queue += atlas_images(entry['payload'])
        elif key in rows and rows[key]['type'] != 'ktx':
            files.add(key)
        elif key not in aliases:
            unresolved.append(key)
    return files, chunks, sorted(set(unresolved))


def main():
    rows, _ = registry()
    cn_packs, cn_aliases = packs(OUT / 'raw', rows)
    local_root = WB.parent / 'linhhoasu/webgame/game/update/resource'
    local_rows = {}
    for name in ['default.res_326514c1.bin', 'default.res_main_c669f2c0.bin', 'default.res_cn_main_f70d4753.bin']:
        parsed = parse(local_root / name)
        assert parsed['bytes_used'] == parsed['bytes_total']
        local_rows.update({row['name']: row for row in parsed['resources']})
    vn_packs, vn_aliases = packs(local_root, local_rows)
    refs = json.loads((OUT / 'resource-inputs.json').read_text(encoding='utf-8'))
    all_files, all_chunks, unresolved = resolve(refs['all'], rows, cn_packs, cn_aliases)
    delta_files, delta_chunks, delta_unresolved = resolve(refs['delta'], rows, cn_packs, cn_aliases)
    file_rows, pack_rows = [], []
    for key in sorted(all_files):
        cn, vn = rows[key], local_rows.get(key)
        state = 'new-key' if not vn else 'changed-url' if cn['url'] != vn['url'] else 'same-url'
        exists = (local_root / cn['url']).is_file()
        if state != 'same-url' or not exists:
            delta_files.add(key)
        file_rows.append({'name': key, 'type': cn['type'], 'cnUrl': cn['url'], 'vnUrl': vn['url'] if vn else None,
                          'state': state, 'cnPathExistsLocally': exists, 'selected': key in delta_files})
    for key in sorted(all_chunks):
        cn, vn = cn_packs[key], vn_packs.get(key)
        state = 'new-key' if not vn else 'changed-payload' if cn['sha256'] != vn['sha256'] else 'same-payload'
        if state != 'same-payload':
            delta_chunks.add(key)
        pack_rows.append({'name': key, 'kind': cn['kind'], 'cnPack': cn['pack'], 'sha256': cn['sha256'], 'bytes': len(cn['payload']),
                          'state': state, 'selected': key in delta_chunks})
    # Changed atlas payloads may introduce pages not reachable from row deltas.
    for key in delta_chunks:
        entry = cn_packs[key]
        if entry['kind'] == 'atlas':
            for image in atlas_images(entry['payload']):
                assert image in rows, 'ATLAS_TEXTURE_NOT_IN_MANIFEST: ' + image
                delta_files.add(image)
    selected_dir = OUT / 'selected-packs'
    selected_dir.mkdir(exist_ok=True)
    exported = []
    for kind in ['atlas', 'skel', 'plist']:
        keys = sorted(key for key in delta_chunks if cn_packs[key]['kind'] == kind)
        if not keys:
            continue
        raw = b''.join(cn_packs[key]['chunk'] for key in keys)
        compressed = zlib.compress(raw, 9)
        target = selected_dir / (kind + '_fashion_selected.bin')
        target.write_bytes(compressed)
        assert zlib.decompress(target.read_bytes()) == raw
        if kind == 'skel':
            for key in keys:
                assert len(zlib.decompress(cn_packs[key]['payload'])) > 0
        exported.append({'path': str(target.relative_to(OUT)), 'kind': kind, 'entries': len(keys), 'bytes': len(compressed), 'sha256': sha(compressed)})
    def counts(values):
        result = {}
        for row in values:
            result[row['state']] = result.get(row['state'], 0) + 1
        return result
    result = {'fileCounts': counts(file_rows), 'packCounts': counts(pack_rows), 'files': file_rows, 'packEntries': pack_rows,
              'selectedFiles': len(delta_files), 'selectedPackEntries': len(delta_chunks), 'exportedPacks': exported,
              'unresolvedConfigStrings': unresolved, 'unresolvedDeltaStrings': delta_unresolved,
              'notes': ['Global comparison checks manifests/packed payloads, not every bitmap on disk.',
                        'Unresolved config strings can be optional or native placeholders; they require render-path review.',
                        'Selected packs contain original entry bytes; merge entries, never replace global live packs.']}
    write_json(OUT / 'resource-audit.json', result)
    write_json(OUT / 'asset-selection.json', sorted(delta_files))
    print(json.dumps({k: result[k] for k in ['fileCounts', 'packCounts', 'selectedFiles', 'selectedPackEntries', 'exportedPacks', 'unresolvedDeltaStrings']}))


if __name__ == '__main__':
    main()
