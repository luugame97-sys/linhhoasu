import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from build_pet_resource_manifest_20260929 import parse, encode, sha

# Read current cn manifest
p = Path('linhhoasu/webgame/game/update/resource/default.res_cn_main_f70d4753.bin')
if not p.exists():
    p = Path('_ai_workbench/temp/pet_vusa_port_20260929/candidate/default.res_cn_main_f70d4753_pet_vusa_20260929.bin')

data = parse(p)
print('Current resources in cn manifest:', len(data['resources']))

# Find prefix for assets/atlas_ui/0_common/bm/lang_cn/
target_dir = 'assets/atlas_ui/0_common/bm/lang_cn/'
matching_prefixes = [i for i, pr in enumerate(data['prefixes']) if pr == target_dir]
print('Matching prefixes for bm/lang_cn:', matching_prefixes)

if not matching_prefixes:
    # Add prefix
    data['prefixes'].append(target_dir)
    prefix_idx = len(data['prefixes']) - 1
else:
    prefix_idx = matching_prefixes[0]

img_path = Path('linhhoasu/webgame/game/update/resource/assets/atlas_ui/0_common/bm/lang_cn/common_bm_quality_10_264c3006.png')
size = img_path.stat().st_size if img_path.exists() else 21980

# Check if common_bm_quality_10 already exists
existing = [r for r in data['resources'] if r['name'] == 'common_bm_quality_10']
if existing:
    print('Already exists:', existing)
else:
    new_res = {
        'name': 'common_bm_quality_10',
        'type_code': 0,
        'type': 'image',
        'prefix': prefix_idx,
        'url': 'assets/atlas_ui/0_common/bm/lang_cn/common_bm_quality_10_264c3006.png',
        'size': size
    }
    data['resources'].append(new_res)
    print('Added resource:', new_res)

# Encode
encoded = encode(data)
check = parse(encoded)
print('Verification check: total resources =', len(check['resources']))
check_m = [r for r in check['resources'] if r['name'] == 'common_bm_quality_10']
print('Found in check:', check_m)
assert len(check_m) == 1, 'VERIFICATION_FAILED'
print('Manifest encode PASS!')
