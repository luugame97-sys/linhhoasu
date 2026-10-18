"""Read-only decode of local manifests/EUI; writes audit evidence, never assets."""
import json, zlib
from pathlib import Path
from parse_resource_config import parse
from decode_bin_manifest import decode
from decode_bin_manifest import Reader

WB = Path(__file__).resolve().parents[1]
ROOT = WB.parent / 'linhhoasu/webgame/game/update/resource'
OUT = WB / 'temp/fashion_rods_audit_20260908'

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    resources = []
    for name in ['default.res_326514c1.bin', 'default.res_main_c669f2c0.bin', 'default.res_cn_main_f70d4753.bin', 'default.res_tw_main_2ff8859f.bin']:
        for row in parse(ROOT / name)['resources']:
            resources.append({**row, 'manifest': name})
    index = {}
    for row in resources:
        for key in [row['name']] + row.get('subkeys', []):
            index.setdefault(key, []).append({k: row[k] for k in ['name', 'type', 'url', 'manifest']})
    # These packs dynamically register icon aliases / skeletons at startup.
    # A missing standalone manifest key alone is NOT a missing resource.
    packs = []
    for kind in ['plist', 'atlas', 'skel']:
        for alias in [kind + '_pack_bin', kind + '_lang_pack_bin']:
            for row in index.get(alias, []):
                if not (ROOT / row['url']).exists():
                    packs.append({'url': row['url'], 'kind': kind, 'localFileMissing': True})
                    continue
                raw = (ROOT / row['url']).read_bytes()
                try: raw = zlib.decompress(raw)
                except zlib.error: pass
                r = Reader(raw)
                count = 0
                while r.pos < len(r.data):
                    name = r.utf8(r.auto(False))
                    length = r.auto(False)
                    start = r.pos
                    key = name + {'plist': '_json', 'atlas': '_atlas', 'skel': '_skel'}[kind]
                    source = {'name': key, 'type': kind + '-pack-entry', 'url': row['url'], 'manifest': row['manifest']}
                    index.setdefault(key, []).append(source)
                    if kind == 'plist':
                        for _ in range(r.auto(False)):
                            frame = r.utf8(r.auto(False))
                            for _ in range(4): r.auto(False)
                            if r.u8():
                                r.auto(True); r.auto(True); r.auto(False); r.auto(False)
                            index.setdefault(frame, []).append({**source, 'sheetTexture': name + '_png'})
                    r.pos = start + length
                    count += 1
                packs.append({'url': row['url'], 'kind': kind, 'entries': count})
    (OUT / 'resource-index.json').write_text(json.dumps(index, ensure_ascii=False), encoding='utf-8')
    (OUT / 'packs.json').write_text(json.dumps(packs, indent=2), encoding='utf-8')
    eui = decode((ROOT / 'assets/cfg/gameEui_18e11b8e.bin').read_bytes())['value']
    selected = {k: v for k, v in eui.items() if k in ['FishRodPanelSkin', 'FishEquipItemSkin', 'EquipFashionItemSkin', 'SelectItemIconSkin', 'DisguiseFashionItemSkin']}
    (OUT / 'skins.json').write_text(json.dumps(selected, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'resourceKeys': len(index), 'skins': list(selected)}))

if __name__ == '__main__':
    main()
