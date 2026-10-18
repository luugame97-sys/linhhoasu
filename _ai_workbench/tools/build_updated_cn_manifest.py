import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from build_pet_resource_manifest_20260929 import parse, encode

# Read existing manifest
p = Path('linhhoasu/webgame/game/update/resource/default.res_cn_main_f70d4753.bin')
if not p.exists():
    p = Path('_ai_workbench/temp/pet_vusa_port_20260929/candidate/default.res_cn_main_f70d4753_pet_vusa_20260929.bin')

manifest = parse(p)

target_prefix = 'assets/atlas_ui/0_common/bm/lang_cn/'
if target_prefix not in manifest['prefixes']:
    manifest['prefixes'].append(target_prefix)
    prefix_idx = len(manifest['prefixes']) - 1
else:
    prefix_idx = manifest['prefixes'].index(target_prefix)

img_file = Path('linhhoasu/webgame/game/update/resource/assets/atlas_ui/0_common/bm/lang_cn/common_bm_quality_10_264c3006.png')
size = img_file.stat().st_size if img_file.exists() else 21980

# Check existing
existing = [r for r in manifest['resources'] if r['name'] == 'common_bm_quality_10']
if not existing:
    manifest['resources'].append({
        'name': 'common_bm_quality_10',
        'type_code': 0,
        'type': 'image',
        'prefix': prefix_idx,
        'url': 'assets/atlas_ui/0_common/bm/lang_cn/common_bm_quality_10_264c3006.png',
        'size': size
    })

encoded = encode(manifest)
check = parse(encoded)
assert any(r['name'] == 'common_bm_quality_10' for r in check['resources']), 'CHECK_FAILED'

# Write to target local paths
out1 = Path('linhhoasu/webgame/game/update/resource/default.res_cn_main_f70d4753_pet_vusa_20260929.bin')
out1.write_bytes(encoded)
print('Saved to:', out1, f'({len(encoded)} bytes, {len(check["resources"])} resources)')

out2 = Path('_ai_workbench/temp/pet_vusa_port_20260929/release_simple/client/update/resource/default.res_cn_main_f70d4753_pet_vusa_20260929.bin')
if out2.parent.exists():
    out2.write_bytes(encoded)
    print('Saved to:', out2)
