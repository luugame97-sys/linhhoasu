"""Deploy two selectable full-fashion chests with CAS backup and live fixture QA."""
import hashlib
import json
import shlex
import sys
from datetime import datetime, timezone
from pathlib import Path

from snapshot_web_multiserver_20260906 import connect
from release_huyenvu_daily_20260906 import hashes, pm2, ready, run, wait_ready
from deploy_farm_alchemy_20260908 import install_one

WB = Path(__file__).resolve().parents[1]
OUT = WB / 'temp/fashion_choice_release_20260912'
MANIFEST = OUT / 'release.json'
QA = WB / 'tools/qa_fashion_choice_live_20260912.js'
APP = '/linhhoasu/lhs/newServer'
TARGETS = [
    '/linhhoasu/lhs/newServer/src/services/ConfigService.js',
    '/linhhoasu/lhs/newServer/src/services/FashionBoxService.js',
    '/linhhoasu/lhs/update/resource/assets/fashion_choice_overlay.json',
    '/linhhoasu/webgame/game/js/lhs-fashion-choice-v1.js',
    '/linhhoasu/webgame/game/index.html',
]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def save(value):
    OUT.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def patch_config(text):
    old = """  const overlayPath = process.env.FASHION_CONTENT_OVERLAY_PATH
    || path.join(__dirname, '..', '..', '..', 'update', 'resource', 'assets', 'fashion_overlay.json');
  if (fs.existsSync(overlayPath)) {
    const overlay = JSON.parse(fs.readFileSync(overlayPath, 'utf8'));
    Object.entries(overlay).forEach(([tableName, rows]) => {
      if (!tables[tableName] || !rows || typeof rows !== 'object') return;
      Object.entries(rows).forEach(([id, row]) => { tables[tableName][id] = row; });
    });
  }"""
    new = """  const overlayPaths = [
    process.env.FASHION_CONTENT_OVERLAY_PATH
      || path.join(__dirname, '..', '..', '..', 'update', 'resource', 'assets', 'fashion_overlay.json'),
    process.env.FASHION_CHOICE_OVERLAY_PATH
      || path.join(__dirname, '..', '..', '..', 'update', 'resource', 'assets', 'fashion_choice_overlay.json'),
  ].filter(Boolean);
  overlayPaths.forEach((overlayPath) => {
    if (!fs.existsSync(overlayPath)) return;
    const overlay = JSON.parse(fs.readFileSync(overlayPath, 'utf8'));
    Object.entries(overlay).forEach(([tableName, rows]) => {
      if (!tables[tableName] || !rows || typeof rows !== 'object') return;
      Object.entries(rows).forEach(([id, row]) => { tables[tableName][id] = row; });
    });
  });"""
    if text.count(old) != 1:
        raise RuntimeError('CONFIG_ANCHOR_MISMATCH')
    return text.replace(old, new)


def patch_boxes(text):
    anchors = [
        ('const COMPONENTS = [29041, 29042, 29043, 29049];',
         'const COMPONENTS = [29041, 29042, 29043, 29049];\nconst CHOICE_BOX_IDS = new Set([99001, 99002]);'),
        ("  const a = config.get('AssetsConfig')?.[id], use = config.get('AssetsUseConfig')?.[id];\n  return a?.type === 100 && (a.useType === 105 || use?.type === 105);",
         "  const a = config.get('AssetsConfig')?.[id], use = config.get('AssetsUseConfig')?.[id];\n  if (CHOICE_BOX_IDS.has(Number(id))) return a?.type === 1 && a.useType === 104 && use?.type === 104;\n  return a?.type === 100 && (a.useType === 105 || use?.type === 105);"),
        ('function open(params, session, msgUid) {\n  const id = Number(params.itemId || params.id || params.index), count = params.count ?? 1;',
         """function openChoice(params, session, msgUid) {
  const id = Number(params.itemId || params.id || params.index), count = params.count ?? 1;
  const use = config.get('AssetsUseConfig')?.[id];
  const selects = params && params.selects;
  const keys = selects && typeof selects === 'object' && !Array.isArray(selects) ? Object.keys(selects) : [];
  if (!Number.isSafeInteger(id) || !CHOICE_BOX_IDS.has(id) || count !== 1 || keys.length !== 1) {
    return { tag: 1300, msgUid, data: { result: -1, code: 'FASHION_CHOICE_INVALID' } };
  }
  const index = Number(keys[0]);
  const selected = use && Array.isArray(use.rewards) && use.rewards[index];
  if (!Number.isSafeInteger(index) || selects[keys[0]] !== 1 || !selected || !isBox(Number(selected.id))) {
    return { tag: 1300, msgUid, data: { result: -1, code: 'FASHION_CHOICE_INVALID' } };
  }
  let rewards;
  try { rewards = rewardsFor(Number(selected.id), 1); } catch (_error) {
    return { tag: 1300, msgUid, data: { result: -1, code: 'FASHION_CHOICE_CONFIG_INVALID' } };
  }
  return require('./FashionTransactionService').run(1300, params, session, msgUid, async (_p, shadow) => {
    const player = shadow.player;
    if (!Number(player.items?.[id] || 0)) return { tag: 1300, msgUid, data: { result: -1, code: 'FASHION_BOX_NOT_ENOUGH' } };
    player.items[id] -= 1;
    const granted = require('../handlers/item').addRewardRowsToPlayer(player, rewards, 1);
    return [
      { tag: 1202, msgUid: 0, data: { result: 0, items: [{ id, count: -1 }, ...granted.itemDeltas], changed: [{ id, count: player.items[id] }, ...granted.changed] } },
      ...require('./RewardGrantService').buildAppearanceSyncPackets(player, granted.rewardInfo),
      { tag: 1300, msgUid, data: { result: 0, id, count: 1, selectedId: Number(selected.id), rewardInfo: granted.rewardInfo } },
    ];
  });
}

function open(params, session, msgUid) {
  const id = Number(params.itemId || params.id || params.index), count = params.count ?? 1;
  if (CHOICE_BOX_IDS.has(id)) return openChoice(params, session, msgUid);"""),
        ('module.exports = { BOX_ID, COMPONENTS, isBox, isCandidateBox, isUnsupportedBox, rewardsFor, open };',
         'module.exports = { BOX_ID, COMPONENTS, CHOICE_BOX_IDS, isBox, isCandidateBox, isUnsupportedBox, rewardsFor, open };'),
    ]
    for old, new in anchors:
        if text.count(old) != 1:
            raise RuntimeError('FASHION_BOX_ANCHOR_MISMATCH')
        text = text.replace(old, new)
    return text


def patch_index(data):
    old = b'\t\t"js/lhs-fashion-content-v1.js?v=20260909_fashion_content_v1",\n'
    new = old + b'\t\t"js/lhs-fashion-choice-v1.js?v=20260912_fashion_choice_v1",\n'
    if data.count(old) != 1:
        raise RuntimeError('INDEX_ANCHOR_MISMATCH')
    return data.replace(old, new)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    s = connect()
    try:
        with s.open_sftp() as f:
            live = {}
            for target in TARGETS:
                try:
                    live[target] = f.open(target, 'rb').read()
                except Exception:
                    live[target] = b''
        before = {target: (sha(data) if data else None) for target, data in live.items()}
        candidates = {
            TARGETS[0]: patch_config(live[TARGETS[0]].decode('utf-8')).encode('utf-8'),
            TARGETS[1]: patch_boxes(live[TARGETS[1]].decode('utf-8')).encode('utf-8'),
            TARGETS[2]: (WB.parent / 'linhhoasu/lhs/update/resource/assets/fashion_choice_overlay.json').read_bytes(),
            TARGETS[3]: (WB.parent / 'linhhoasu/webgame/game/js/lhs-fashion-choice-v1.js').read_bytes(),
            TARGETS[4]: patch_index(live[TARGETS[4]]),
        }
        stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
        stage = '/linhhoasu/_ai_workbench/temp/fashion_choice_' + stamp
        backup = '/linhhoasu/_ai_workbench/backups/fashion_choice_' + stamp
        run(s, 'install -d -m 700 ' + shlex.quote(stage) + ' ' + shlex.quote(backup))
        stage_paths = {target: stage + '/' + str(index) for index, target in enumerate(TARGETS)}
        with s.open_sftp() as f:
            for target, path in stage_paths.items():
                f.putfo(__import__('io').BytesIO(candidates[target]), path)
        staged = hashes(s, list(stage_paths.values()))
        assert all(staged[path] == sha(candidates[target]) for target, path in stage_paths.items())
        assert ready(s) == {'8080': 200, '8083': 200}
        state = pm2(s)
        manifest = {'status': 'STAGED', 'stage': stage, 'backup': backup, 'before': before,
                    'after': {target: sha(data) for target, data in candidates.items()},
                    'stagePaths': stage_paths, 'staged': staged, 'beforePm2': state,
                    'playerDataWrites': 0, 'productionSourceWrites': 0}
        save(manifest)
        for index, target in enumerate(TARGETS):
            if before[target]:
                run(s, 'cp -a -- ' + shlex.quote(target) + ' ' + shlex.quote(backup + '/' + str(index) + '.before'))
                assert hashes(s, [backup + '/' + str(index) + '.before'])[backup + '/' + str(index) + '.before'] == before[target]
        manifest['status'] = 'INSTALLING'; save(manifest)
        backend = TARGETS[:3]
        for target in TARGETS:
            install_one(s, stage_paths[target], target, before[target], sha(candidates[target]))
            manifest['productionSourceWrites'] += 1
            save(manifest)
            if target == backend[-1]:
                for name, port in [('lhs-s1002', 8083), ('lhs-s1001', 8080)]:
                    run(s, 'pm2 restart ' + name)
                    wait_ready(s, port)
        qa_path = stage + '/qa.js'
        with s.open_sftp() as f: f.put(str(QA), qa_path)
        run(s, 'node --check ' + shlex.quote(TARGETS[0]) + ' && node --check ' + shlex.quote(TARGETS[1]) + ' && node --check ' + shlex.quote(qa_path))
        qa = json.loads(run(s, 'node ' + shlex.quote(qa_path)).splitlines()[-1])
        assert qa['result'] == 'PASS' and qa['productionWrites'] == 0
        assert hashes(s, list(manifest['after'])) == manifest['after']
        assert ready(s) == {'8080': 200, '8083': 200}
        manifest.update(status='DEPLOYED', qa=qa, completedAt=datetime.now(timezone.utc).isoformat(), ready=ready(s))
        save(manifest)
        print(json.dumps({'status': manifest['status'], 'ids': [99001, 99002], 'backup': backup, 'qa': qa, 'ready': manifest['ready']}))
    finally:
        s.close()


if __name__ == '__main__':
    main()
