import hashlib, json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench/temp/drop200_original_20261007'
OLD = ROOT / '_ai_workbench/temp/drop200_20261007'
BASE = OLD / 'baseline'
LOCAL = ROOT / 'linhhoasu'
CAN = OUT / 'candidate'

def put(rel, data):
    target = CAN / rel; target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(data)

def replace_once(text, old, new):
    if text.count(old) != 1: raise RuntimeError('pattern not unique: ' + old[:80])
    return text.replace(old, new)

def current_after():
    state = json.loads((OLD / 'release.json').read_text(encoding='utf-8'))
    return {row['remote']: row['after'] for row in state['files']}

def main():
    before = {'/linhhoasu/'+rel:digest for rel,digest in json.loads((OUT/'baseline_hashes.json').read_text(encoding='utf-8')).items()}
    files = []
    # Server policy and Yêu Vương catalog.
    for rel in ['lhs/newServer/src/config/dropLevel100.js', 'lhs/newServer/src/config/demonBossDrop200.js']:
        source = LOCAL / rel; put(rel, source.read_bytes()); files.append(rel)
    # Current ConfigService has the previously deployed shop/pet overlays; add
    # only the new boss overlay require and keep every unrelated consumer.
    rel = 'lhs/newServer/src/services/ConfigService.js'
    s = (OUT / 'baseline' / rel).read_text(encoding='utf-8')
    if "require('../config/demonBossDrop200').apply(tables);" not in s:
        s = replace_once(s, "require('../config/roleLevel2000').apply(tables);", "require('../config/roleLevel2000').apply(tables);\n  require('../config/demonBossDrop200').apply(tables);")
    put(rel, s.encode('utf-8')); files.append(rel)
    # Exact pre-drop200 source for old gameplay, with only the generic Q46+
    # template guard needed by qualities 100..199.
    rel = 'lhs/newServer/src/handlers/box.js'; s = (BASE / rel).read_text(encoding='utf-8')
    old = "if (q >= 46 && configService.get('DropLevelExtensionConfig')?.maxLevel === 100) {"
    new = "const dropExtension = configService.get('DropLevelExtensionConfig') || {};\n  if (q >= 46 && q <= Math.max(46, toSafeInt(dropExtension.maxLevel, 0))) {"
    s = replace_once(s, old, new); s = s.replace("throw new Error('DROP100_TEMPLATE_INVALID:' + q + ':' + st);", "throw new Error('DROP_EXTENSION_TEMPLATE_INVALID:' + q + ':' + st);")
    put(rel, s.encode('utf-8')); files.append(rel)
    # Keep the robust confirmed-save tier wrapper; it does not alter gameplay.
    for rel in ['lhs/newServer/src/handlers/compat.js', 'lhs/newServer/src/services/DropTierMutationService.js']:
        source = LOCAL / rel; put(rel, source.read_bytes()); files.append(rel)
    # Exact live pre-drop200 services, with no timer policy or sale aggregation.
    for rel in ['lhs/newServer/src/services/DropLevel46Service.js', 'lhs/newServer/src/services/EquipService.js', 'lhs/newServer/src/handlers/account.js']:
        put(rel, (BASE / rel).read_bytes()); files.append(rel)
    # Inline level/tier/boss client generated from the original main snapshot.
    rel = 'webgame/game/js/main.min_drop200.js'; put(rel, (LOCAL / rel).read_bytes()); files.append(rel)
    rel = 'webgame/game/js/lhs-box-tier100-v1.js'; put(rel, (LOCAL / rel).read_bytes()); files.append(rel)
    rel = 'webgame/game/index.html'; s = (OUT/'baseline'/rel).read_text(encoding='utf-8')
    s = s.replace('20261007_drop200_v1', '20261007_original_v1')
    s = s.replace('20261007_box_tier200_v1', '20261007_box_tier200_original_v1')
    put(rel, s.encode('utf-8')); files.append(rel)
    # Add a client-side data module only if the native inline patch cannot see
    # a stage row; it is harmless and loaded before main, but main already owns
    # the UI wrappers.
    # No standalone demon addon is referenced to avoid duplicate native hooks.
    entries=[]
    for rel in files:
        remote='/linhhoasu/'+rel
        entries.append({'local':'candidate/'+rel,'remote':remote,'before':before.get(remote),
                        **({'public_url':'https://linhhoasu.lol/'+rel.removeprefix('webgame/game/')+'?v=20261007_original_v1'} if rel.startswith('webgame/game/js/') else {})})
    tests=['test_original_drop200_20261007.js','test_original_drop200_handlers_20261007.js','test_demon_drop200_handlers_original.js','test_demon_drop200_native_original.js']
    for test in tests: (OUT / test).write_bytes((ROOT / '_ai_workbench/tools' / test).read_bytes() if (ROOT / '_ai_workbench/tools' / test).exists() else (OUT / test).read_bytes())
    (OUT / 'candidate_files.json').write_text(json.dumps({'files':entries,'tests':[{'local':t,'env':{'CONFIG_BIN_PATH':'/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin'}} for t in tests]},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'files':len(entries),'tests':len(tests)}))

if __name__ == '__main__': main()
