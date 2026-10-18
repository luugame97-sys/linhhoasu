import hashlib, json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench/temp/drop200_20261007'
BASE = OUT / 'baseline'
LOCAL = ROOT / 'linhhoasu'
CAN = OUT / 'candidate'

def put(rel, data):
    target = CAN / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)

def replace_once(text, before, after):
    assert text.count(before) == 1, before[:90]
    return text.replace(before, after)

def main():
    baseline = json.loads((OUT / 'baseline.json').read_text(encoding='utf-8'))
    rels = ['lhs/newServer/src/config/dropLevel100.js',
            'lhs/newServer/src/services/DropProgressionTimingService.js',
            'lhs/newServer/src/services/DropTierMutationService.js',
            'lhs/newServer/src/services/DropCompactSaleService.js',
            'lhs/newServer/src/services/EquipService.js',
            'lhs/newServer/src/handlers/box.js',
            'lhs/newServer/src/handlers/compat.js',
            'lhs/newServer/src/services/DropLevel46Service.js',
            'webgame/game/js/main.min_drop200.js',
            'webgame/game/js/lhs-box-tier100-v1.js']
    for rel in rels:
        put(rel, (LOCAL / rel).read_bytes())
    rel = 'lhs/newServer/src/handlers/account.js'
    s = (BASE / rel).read_bytes().decode('utf-8')
    s = replace_once(s, '  const boxLevelSettled = settleLoginBoxLevel(player);',
                     "  const dropTimingChanged = require('../services/DropProgressionTimingService').migratePlayer(player);\n  const boxLevelSettled = settleLoginBoxLevel(player);")
    s = replace_once(s, 'if (botIdentityChanged || loginBaoziChanged || boxLevelSettled',
                     'if (botIdentityChanged || loginBaoziChanged || dropTimingChanged || boxLevelSettled')
    put(rel, s.encode('utf-8')); rels.append(rel)
    rel = 'webgame/game/index.html'
    s = (BASE / rel).read_bytes().decode('utf-8')
    s = replace_once(s, 'js/main.min_drop100.js?v=20260930_reg_domain_v1', 'js/main.min_drop200.js?v=20261007_drop200_v1')
    s = replace_once(s, 'js/lhs-box-tier100-v1.js?v=20260922_box_tier100_v2', 'js/lhs-box-tier100-v1.js?v=20261007_box_tier200_v1')
    put(rel, s.encode('utf-8')); rels.append(rel)
    files = []
    for rel in rels:
        row = {'local': 'candidate/' + rel, 'remote': '/linhhoasu/' + rel,
               'before': baseline.get(rel, {}).get('sha256')}
        if rel.startswith('webgame/game/js/'):
            row['public_url'] = 'https://linhhoasu.lol/' + rel.removeprefix('webgame/game/') + '?v=20261007_drop200_v1'
        files.append(row)
    tests = []
    for name in ['test_drop200_20261007.js', 'test_drop200_handlers_20261007.js',
                 'test_drop200_tier_20261007.js', 'test_drop_progression_timing_20261007.js',
                 'test_drop_tier_mutation_20261007.js']:
        src = ROOT / '_ai_workbench/tools' / name
        (OUT / name).write_bytes(src.read_bytes())
        tests.append({'local': name, 'env': {'CONFIG_BIN_PATH': '/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin'}})
    (OUT / 'candidate_files.json').write_text(json.dumps({'files': files, 'tests': tests}, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'files': len(files), 'tests': len(tests)}))

if __name__ == '__main__':
    main()
