from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / '_ai_workbench/temp/artifact_quench_release_20261009/installed'
OUT = ROOT / '_ai_workbench/temp/artifact_quench_release_20261010/candidate'
OUT.mkdir(parents=True, exist_ok=True)

def replace_once(text, before, after):
    if text.count(before) != 1:
        raise RuntimeError('Unexpected source anchor: ' + before[:70])
    return text.replace(before, after, 1)

artifact = (BASE / 'artifact.js').read_text(encoding='utf-8')
artifact = replace_once(artifact, "const logger = require('../logger');", """const logger = require('../logger');
const artifactLocks = require('../services/PlayerMutationService');
const artifactReceipts = require('../services/FeatureReceiptService');
const artifactRuntime = require('../services/RuntimeBus');""")
artifact = replace_once(artifact, 'element: Math.max(1, toSafeInt(row.element, 1)),',
    'element: toSafeInt(row.quenchLv, 0) > 0 ? getValidElement(row.element, 1) : 0,')
artifact = replace_once(artifact, 'return map[group] || map[String(group)] ? group : 0;',
    'return map[group] || map[String(group)] ? group : 0;')
start = artifact.index('function getValidElement(')
end = artifact.index('function getArtifactSkillGroups(', start)
artifact = artifact[:start] + """function getValidElement(value, fallback = 0) {
  const parsed = Number(value == null ? fallback : value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 5 ? parsed : 0;
}

function getRandomElement() {
  return 1 + Math.floor(Math.random() * 5);
}

function isQuenchEligible(artifact, quenchCfg) {
  if (!artifact || !quenchCfg || !getArtifactCfg(artifact.id)) return false;
  const minQuality = Math.max(1, toSafeInt((config.get('ArtifactBaseConfig') || {}).quenchQuality, 7));
  return getArtifactQualityById(artifact.id) >= minQuality
    && toSafeInt(artifact.attr && artifact.attr.level, 0) >= toSafeInt(quenchCfg.level, 30)
    && toSafeInt(artifact.skillGroup, 0) > 0 && getArtifactFitSkillGroupId(artifact) > 0;
}

function elementSkillValid(artifact, group, level) {
  const row = (config.get('ArtifactElementSkillConfig') || {})[group]?.[level];
  return !!row && toSafeInt(row.type, 0) === getArtifactTypeById(artifact.id)
    && !!(config.get('SkillConfig') || {})[row.skillId];
}

function isRefreshCacheValid(artifact) {
  const cache = artifact && artifact.refreshCache;
  if (!cache || typeof cache !== 'object') return false;
  const age = Date.now() - Number(cache.ts);
  return Number.isFinite(age) && age >= 0 && age <= 10 * 60 * 1000
    && Number(cache.quenchLv) === Number(artifact.quenchLv)
    && getValidElement(cache.element) > 0
    && elementSkillValid(artifact, cache.eSkillGroup, artifact.quenchLv);
}

const cloneQuench = value => JSON.parse(JSON.stringify(value));

function adoptQuenchPlayer(session, player) {
  const canonical = artifactRuntime.getWsServer()?.getPlayerForMutation?.(session.userId) || session.player;
  if (canonical) Object.assign(canonical, player);
  session.player = canonical || player;
  session._itemListCache = null;
}

// A private draft, economy and receipt commit atomically. No rejected request
// can leave a debit in the live session for a later generic save to persist.
async function operateQuench(tag, params, session, msgUid, operation) {
  return artifactLocks.run(session && session.userId, async () => {
    let current = session && session.player;
    const uid = Number(params && params.uid);
    const answer = (result, code, replayed = false) => {
      const info = current ? ensureArtifactInfo(cloneQuench({ artifactInfo: current.artifactInfo })) : null;
      const row = info ? findArtifactByUid(info, uid) : null;
      return { tag, msgUid, data: { result, code, replayed, requestId: params?.requestId || '',
        artifact: row, itemCounts: [191, 192, 193, 194, 195, 196, 197, 198].map(id => ({ id, count: getItemOrCurrencyCount(current, id) })),
        ...(tag === 3506 ? { refreshCache: row?.refreshCache || null } : {}) } };
    };
    if (!session?.userId || !current) return answer(-1, 'ARTIFACT_SESSION_REQUIRED');
    if (!Number.isSafeInteger(uid) || uid <= 0) return answer(-1, 'ARTIFACT_INPUT_INVALID');
    if (!params.requestId) return answer(-1, 'ARTIFACT_CLIENT_RELOAD_REQUIRED');
    await playerService.drainPendingSaves(session.userId);
    const original = await playerService.loadPlayer(session.userId);
    if (!original) return answer(-1, 'ARTIFACT_SESSION_REQUIRED');
    current = original;
    adoptQuenchPlayer(session, original);
    try {
      if (params.requestId && artifactReceipts.read(original, tag, params)) return answer(0, '', true);
    } catch (_) { return answer(-1, 'ARTIFACT_RECEIPT_INVALID'); }
    const draft = { ...original,
      artifactInfo: cloneQuench(original.artifactInfo || {}),
      items: cloneQuench(original.items || {}),
      currencies: cloneQuench(original.currencies || {}),
    };
    if (Object.prototype.hasOwnProperty.call(original, 'other_attr_info')) {
      draft.other_attr_info = cloneQuench(original.other_attr_info || {});
    }
    const info = ensureArtifactInfo(draft);
    const row = findArtifactByUid(info, uid);
    if (!row) return answer(-1, 'ARTIFACT_NOT_FOUND');
    const outcome = operation(draft, row);
    if (outcome.code) return answer(-1, outcome.code);
    syncAfterArtifactChange(info);
    if (params.requestId) artifactReceipts.record(draft, tag, params, { uid, quenchLv: row.quenchLv });
    const fields = ['artifactInfo', 'items', 'currencies', 'other_attr_info']
      .filter(key => JSON.stringify(draft[key]) !== JSON.stringify(original[key]));
    const expected = {};
    fields.forEach(key => { if (Object.prototype.hasOwnProperty.call(original, key)) expected[key] = original[key]; });
    let saved = null;
    try {
      saved = await playerService.savePlayer(session.userId, draft, {
        returnSaved: false, onlyFields: fields, artifactCAS: { fields, expected },
      });
    } catch (error) {
      logger.warn(`[Artifact] commit uncertain tag=${tag} user=${session.userId} code=${error.code || error.name}`);
    }
    if (!saved) {
      const fresh = await playerService.loadPlayer(session.userId).catch(() => null);
      if (!fresh) {
        artifactRuntime.getWsServer()?.invalidatePlayerForMutation?.(session.userId);
        session.player = null;
        return answer(-1, 'ARTIFACT_SAVE_UNCONFIRMED');
      }
      current = fresh;
      adoptQuenchPlayer(session, fresh);
      try { if (params.requestId && artifactReceipts.read(fresh, tag, params)) return answer(0, '', true); } catch (_) {}
      return answer(-1, 'ARTIFACT_SAVE_CONFLICT');
    }
    fields.forEach(key => { original[key] = draft[key]; });
    current = original;
    adoptQuenchPlayer(session, original);
    const response = answer(0, '');
    const sync = buildItemSyncPacket(draft, outcome.beforeCounts || {}, outcome.costIds || []);
    return sync ? [sync, response] : response;
  });
}

// A selected element consumes its configured support stone. Zero means no
// support stone; upgrading an already quenched artifact preserves its element.
function quenchSelection(artifact, params, level, preserve = false) {
  const requested = Number(params?.element == null ? 0 : params.element);
  if (!Number.isSafeInteger(requested) || requested < 0 || requested > 5) return { code: 'ARTIFACT_ELEMENT_INVALID' };
  if (preserve) {
    const element = getValidElement(artifact.element);
    if (!element || requested && requested !== element) return { code: 'ARTIFACT_ELEMENT_INVALID' };
    const group = toSafeInt(artifact.eSkillGroup, 0);
    return elementSkillValid(artifact, group, level) ? { element, group, costs: [] }
      : { code: 'ARTIFACT_ELEMENT_SKILL_CONFIG_INVALID' };
  }
  const element = requested || getRandomElement();
  const group = getElementSkillGroup(artifact, element);
  if (!elementSkillValid(artifact, group, level)) return { code: 'ARTIFACT_ELEMENT_SKILL_CONFIG_INVALID' };
  const stone = requested ? (config.get('ArtifactBaseConfig') || {}).quenchSelectQuality?.[requested] : null;
  if (requested && (!stone || !Number.isSafeInteger(stone.id) || !(stone.count > 0))) {
    return { code: 'ARTIFACT_ELEMENT_SKILL_CONFIG_INVALID' };
  }
  return { element, group, costs: stone ? [stone] : [] };
}

""" + artifact[end:]
start = artifact.index('// 淬炼 (tag:3505)')
end = artifact.index('// 绑定灵珠到槽位 (tag:6400)', start)
artifact = artifact[:start] + """// 淬炼 (tag:3505)
async function handleArtifactQuench(params, session, msgUid) {
  return operateQuench(3505, params, session, msgUid, (player, artifact) => {
    const nextLevel = toSafeInt(artifact.quenchLv, 0) + 1;
    const next = (config.get('ArtifactQuenchConfig') || {})[nextLevel];
    if (!isQuenchEligible(artifact, next)) return { code: 'ARTIFACT_QUENCH_LOCKED' };
    const selection = quenchSelection(artifact, params, nextLevel, nextLevel > 1);
    if (selection.code) return selection;
    const costs = getQuenchEffectiveCosts(player, [...(next.consumes || []), ...selection.costs]);
    if (!costs || !allCostsAvailable(player, costs)) return { code: 'ARTIFACT_MATERIALS_NOT_ENOUGH' };
    const beforeCounts = buildBeforeCounts(player, costs);
    costs.forEach(cost => consumeItemOrCurrency(player, cost.id, cost.count));
    artifact.element = selection.element;
    artifact.eSkillGroup = selection.group;
    artifact.quenchLv = nextLevel;
    artifact.refreshCache = null;
    return { beforeCounts, costIds: costs.map(cost => cost.id) };
  });
}

// 淬炼刷新 (tag:3506)
async function handleArtifactQuenchRefresh(params, session, msgUid) {
  return operateQuench(3506, params, session, msgUid, (player, artifact) => {
    const level = toSafeInt(artifact.quenchLv, 0);
    const row = (config.get('ArtifactQuenchConfig') || {})[level];
    if (level <= 0 || !isQuenchEligible(artifact, row)) return { code: 'ARTIFACT_NOT_QUENCHED' };
    const selection = quenchSelection(artifact, params, level);
    if (selection.code) return selection;
    const costs = [...((config.get('ArtifactBaseConfig') || {}).resetConsume || []), ...selection.costs];
    if (!allCostsAvailable(player, costs)) return { code: 'ARTIFACT_MATERIALS_NOT_ENOUGH' };
    const beforeCounts = buildBeforeCounts(player, costs);
    costs.forEach(cost => consumeItemOrCurrency(player, cost.id, cost.count));
    artifact.refreshCache = { element: selection.element, eSkillGroup: selection.group, quenchLv: level, ts: Date.now() };
    return { beforeCounts, costIds: costs.map(cost => cost.id) };
  });
}

// 淬炼刷新确认 (tag:3507)
async function handleArtifactQuenchRefreshConfirm(params, session, msgUid) {
  return operateQuench(3507, params, session, msgUid, (_player, artifact) => {
    const level = toSafeInt(artifact.quenchLv, 0);
    const row = (config.get('ArtifactQuenchConfig') || {})[level];
    if (level <= 0 || !isQuenchEligible(artifact, row)) return { code: 'ARTIFACT_NOT_QUENCHED' };
    if (!isRefreshCacheValid(artifact)) return { code: 'ARTIFACT_REFRESH_EXPIRED' };
    artifact.element = artifact.refreshCache.element;
    artifact.eSkillGroup = artifact.refreshCache.eSkillGroup;
    artifact.refreshCache = null;
    return {};
  });
}

""" + artifact[end:]
(OUT / 'artifact.js').write_text(artifact, encoding='utf-8', newline='\n')

service = (BASE / 'PlayerService.js').read_text(encoding='utf-8')
anchor = '    if (options.cultivationCAS) {'
block = """    // Artifact quench: only its changed economy/state/receipt fields commit.
    if (options.artifactCAS) {
      const { fields, expected } = options.artifactCAS;
      const allowed = ['artifactInfo', 'items', 'currencies', 'other_attr_info'];
      if (!Array.isArray(fields) || !fields.length || fields.some(key => !allowed.includes(key))) {
        throw new Error('ARTIFACT_CAS_FIELDS_INVALID');
      }
      filter.$and = (filter.$and || []).concat(fields.map(key => ({
        [key]: Object.prototype.hasOwnProperty.call(expected, key) ? { $eq: expected[key] } : { $exists: false },
      })));
    }
"""
service = replace_once(service, anchor, block + anchor)
(OUT / 'PlayerService.js').write_text(service, encoding='utf-8', newline='\n')

battle = (BASE / 'BattleService.js').read_text(encoding='utf-8')
anchor = '      if (levelDelta > 0) addAttrs(base, addAttrsCfg, levelDelta);'
battle = replace_once(battle, anchor, anchor + """
      const skill = (config.get('ArtifactElementSkillConfig') || {})[artifact.eSkillGroup]?.[artifact.quenchLv];
      if (skill && toSafeInt(skill.type, 0) === toSafeInt(artifactType, 1)) {
        if (toSafeInt(skill.elementType, 0) === toSafeInt(artifact.element, 0)) {
          addAttrs(base, (config.get('ArtifactBaseConfig') || {}).quenchMatchAttrs);
        }
        // These elemental skills are passive attribute effects in the native
        // tables (behavior 4, effect 1). Do not approximate other effect types.
        const skillRow = getConfigRow('SkillConfig', skill.skillId);
        (skillRow?.actions || []).forEach(actionId => {
          const behavior = getConfigRow('SkillBehaviorConfig', actionId);
          const effect = getConfigRow('SkillEffectConfig', actionId);
          if (behavior?.type === 4 && effect?.type === 1 && Array.isArray(effect.args)) {
            addAttrs(base, { [effect.args[0]]: effect.args[1] });
          }
        });
      }""")
(OUT / 'BattleService.js').write_text(battle, encoding='utf-8', newline='\n')
print(OUT)
