"""Build a candidate from the exact read-only production snapshot."""
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / '_ai_workbench/temp/artifact_forge_20261013/baseline'
OUT = ROOT / '_ai_workbench/temp/artifact_forge_20261013/candidate'

def replace_once(text, old, new):
    if text.count(old) != 1:
        raise RuntimeError('anchor count != 1: ' + old[:80])
    return text.replace(old, new, 1)

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    source = (BASE / 'artifact.js').read_text(encoding='utf-8')
    source = source.replace(
        "  return quality >= Math.max(6, toSafeInt(baseCfg.forgeQuality || baseCfg.quenchQuality, 6));",
        "  const forgeQuality = baseCfg.forgeQuality == null ? 6 : toSafeInt(baseCfg.forgeQuality, 6);\n  return quality >= Math.max(1, forgeQuality);",
        1,
    )
    cleanup_anchor = "// A private draft, economy and receipt commit atomically. No rejected request\n"
    cleanup = r'''async function cleanupExpiredRefreshCaches(userId) {
  return artifactLocks.run(userId, async () => {
    if (!userId) return { removed: 0 };
    await playerService.drainPendingSaves(userId);
    const original = await playerService.loadPlayer(userId);
    if (!original) return { removed: 0 };
    const draft = {
      ...original,
      artifactInfo: JSON.parse(JSON.stringify(original.artifactInfo || {})),
      other_attr_info: JSON.parse(JSON.stringify(original.other_attr_info || {})),
    };
    const info = ensureArtifactInfo(draft);
    const now = Date.now();
    const removed = [];
    for (const row of info.artifacts) {
      const cache = row && row.refreshCache;
      const age = cache && now - Number(cache.ts);
      if (cache && Number.isFinite(age) && age > 10 * 60 * 1000) {
        removed.push({ uid: toSafeInt(row.uid, 0), cacheTs: Number(cache.ts), at: now, reason: 'expired' });
        row.refreshCache = null;
      }
    }
    if (!removed.length) return { removed: 0 };
    const audit = Array.isArray(draft.other_attr_info.artifactRefreshCleanup)
      ? draft.other_attr_info.artifactRefreshCleanup : [];
    draft.other_attr_info.artifactRefreshCleanup = audit.concat(removed).slice(-64);
    const fields = ['artifactInfo', 'other_attr_info'];
    const expected = Object.fromEntries(fields.filter(key => Object.prototype.hasOwnProperty.call(original, key))
      .map(key => [key, original[key]]));
    const saved = await playerService.savePlayer(userId, draft, { returnSaved: false, onlyFields: fields, artifactCAS: { fields, expected } });
    if (!saved) throw new Error('ARTIFACT_REFRESH_CLEANUP_CONFLICT');
    return { removed: removed.length };
  });
}

'''
    source = replace_once(source, cleanup_anchor, cleanup + cleanup_anchor)
    start = source.index('async function handleArtifactForge(')
    end = source.index('// 穿戴 (tag:3502)', start)
    replacement = r'''async function operateForge(params, session, msgUid) {
  return artifactLocks.run(session && session.userId, async () => {
    let current = session && session.player;
    const uid = Number(params && params.uid);
    const answer = (result, code = '', replayed = false, extra = {}) => ({
      tag: 3501,
      msgUid,
      data: {
        result,
        code,
        replayed,
        requestId: params?.requestId || '',
        artifact: extra.artifact || null,
        itemCounts: [54].map(id => ({ id, count: getItemOrCurrencyCount(current, id) })),
      },
    });
    if (!session?.userId || !current) return answer(-1, 'ARTIFACT_SESSION_REQUIRED');
    if (!Number.isSafeInteger(uid) || uid <= 0) return answer(-1, 'ARTIFACT_INPUT_INVALID');
    if (!params.requestId) return answer(-1, 'ARTIFACT_CLIENT_RELOAD_REQUIRED');
    await playerService.drainPendingSaves(session.userId);
    const original = await playerService.loadPlayer(session.userId);
    if (!original) return answer(-1, 'ARTIFACT_SESSION_REQUIRED');
    current = original;
    if (artifactReceipts.read(original, 3501, params)) {
      const replay = artifactReceipts.read(original, 3501, params);
      return { tag: 3501, msgUid, data: { ...replay, replayed: true, requestId: params.requestId } };
    }
    const draft = {
      ...original,
      artifactInfo: JSON.parse(JSON.stringify(original.artifactInfo || {})),
      items: JSON.parse(JSON.stringify(original.items || {})),
      currencies: JSON.parse(JSON.stringify(original.currencies || {})),
      other_attr_info: JSON.parse(JSON.stringify(original.other_attr_info || {})),
    };
    const info = ensureArtifactInfo(draft);
    const artifact = findArtifactByUid(info, uid);
    if (!artifact) return answer(-1, 'ARTIFACT_NOT_FOUND', false, { artifact: null });
    const baseCfg = config.get('ArtifactBaseConfig') || {};
    const forgeMax = Math.max(1, toSafeInt(baseCfg.forgeCountMax, 7));
    const quality = getArtifactQualityById(artifact.id);
    const currentCount = Math.max(0, toSafeInt(artifact.count, 0));
    const now = Date.now();
    if (!isArtifactForgeQualityAllowed(quality)
      || Math.max(1, toSafeInt(artifact.attr && artifact.attr.level, 1)) < Math.max(1, toSafeInt(baseCfg.forgeLevel, 20))
      || currentCount >= forgeMax
      || (toSafeInt(artifact.forgeTime, 0) > 0 && toSafeInt(artifact.forgeTime, 0) <= now)
      || getArtifactFitSkillGroupId(artifact) <= 0) {
      return answer(-1, 'ARTIFACT_FORGE_INELIGIBLE', false, { artifact });
    }
    const nextCount = Math.min(forgeMax, currentCount + 1);
    const forgeCfg = (config.get('ArtifactForgeConfig') || {})[nextCount]
      || (config.get('ArtifactForgeConfig') || {})[String(nextCount)] || {};
    const consumeRow = getForgeConsumeRow(quality, currentCount);
    if (consumeRow && !hasEnoughItemOrCurrency(draft, consumeRow.id, consumeRow.count)) {
      return answer(-1, 'ARTIFACT_MATERIALS_NOT_ENOUGH', false, { artifact });
    }
    const beforeCounts = consumeRow ? buildBeforeCounts(draft, [consumeRow.id]) : {};
    if (consumeRow) consumeItemOrCurrency(draft, consumeRow.id, consumeRow.count);
    artifact.count = nextCount;
    if (toSafeInt(artifact.forgeTime, 0) <= 0) {
      artifact.forgeTime = now + Math.max(1, toSafeInt(baseCfg.forgeTimeMax, 86400)) * 1000;
    }
    const fitRate = Math.max(0, Math.min(100, toSafeInt(forgeCfg.fitRate, 0)));
    artifact.skillLv = updateForgeSkillLevel(artifact, forgeCfg, quality);
    artifact.skillGroup = pickArtifactSkillGroup(artifact, fitRate);
    const fitSkillCfg = getArtifactFitSkillConfig(artifact);
    artifact.eSkillGroup = Math.max(0, toSafeInt(fitSkillCfg.eSkillGroup || artifact.eSkillGroup, artifact.eSkillGroup || 0));
    syncAfterArtifactChange(info);
    const costIds = consumeRow ? [consumeRow.id] : [];
    const resultData = {
      result: 0,
      code: '',
      replayed: false,
      requestId: params.requestId,
      artifact,
      itemCounts: costIds.map(id => ({ id, count: getItemOrCurrencyCount(draft, id) })),
    };
    artifactReceipts.record(draft, 3501, params, resultData);
    const fields = ['artifactInfo', 'items', 'currencies', 'other_attr_info'];
    const expected = Object.fromEntries(fields.filter(key => Object.prototype.hasOwnProperty.call(original, key))
      .map(key => [key, original[key]]));
    let saved = false;
    try {
      saved = !!(await playerService.savePlayer(session.userId, draft, {
        returnSaved: false,
        onlyFields: fields,
        artifactCAS: { fields, expected },
      }));
    } catch (error) {
      logger.warn(`[Artifact] forge commit uncertain user=${session.userId || 'unknown'} uid=${uid} requestId=${params.requestId} code=${error.code || error.name}`);
    }
    if (!saved) {
      const fresh = await playerService.loadPlayer(session.userId).catch(() => null);
      if (fresh) {
        const receipt = artifactReceipts.read(fresh, 3501, params);
        if (receipt) return { tag: 3501, msgUid, data: { ...receipt, replayed: true, requestId: params.requestId } };
      }
      artifactRuntime.getWsServer()?.invalidatePlayerForMutation?.(session.userId);
      session.player = null;
      return answer(-1, 'ARTIFACT_SAVE_UNCONFIRMED');
    }
    fields.forEach(key => { original[key] = draft[key]; });
    session.player = original;
    logger.info(`[Artifact] forge server=${process.env.SERVER_ID || process.env.SERVER_NAME || 'unknown'} user=${session.userId || 'unknown'} uid=${uid} requestId=${params.requestId} latencyMs=0 costDelta=${costIds.join(',')} result=0`);
    const response = { tag: 3501, msgUid, data: resultData };
    const syncPacket = consumeRow ? buildItemSyncPacket(draft, beforeCounts, costIds) : null;
    return syncPacket ? [syncPacket, response] : response;
  });
}

async function handleArtifactForge(params, session, msgUid) {
  return operateForge(params, session, msgUid);
}

'''
    replacement = replacement.replace("async function handleArtifactQuenchRefreshConfirm(params, session, msgUid) {\n  return operateQuench(3507, params, session, msgUid, (_player, artifact) => {", "async function handleArtifactQuenchRefreshConfirm(params, session, msgUid) {\n  await cleanupExpiredRefreshCaches(session && session.userId);\n  return operateQuench(3507, params, session, msgUid, (_player, artifact) => {") if False else replacement
    source = source[:start] + replacement + source[end:]
    old_confirm = "async function handleArtifactQuenchRefreshConfirm(params, session, msgUid) {\n  return operateQuench(3507, params, session, msgUid, (_player, artifact) => {"
    new_confirm = "async function handleArtifactQuenchRefreshConfirm(params, session, msgUid) {\n  await cleanupExpiredRefreshCaches(session && session.userId);\n  return operateQuench(3507, params, session, msgUid, (_player, artifact) => {"
    source = replace_once(source, old_confirm, new_confirm)
    target = OUT / 'artifact.js'
    target.write_text(source, encoding='utf-8', newline='')
    (OUT / 'manifest.json').write_text(json.dumps({
        'sourceSha256': hashlib.sha256((BASE / 'artifact.js').read_bytes()).hexdigest(),
        'candidateSha256': hashlib.sha256(target.read_bytes()).hexdigest(),
        'result': 'CANDIDATE_ONLY', 'productionWrites': 0,
    }, indent=2) + '\n', encoding='utf-8')
    ws = (BASE / 'WSServer.js').read_text(encoding='utf-8')
    if ws.count('const SOCKET_SINGLE_FLIGHT_TAGS = new Set([3001, 3204, 3505, 3506, 3507]);') != 1:
        raise RuntimeError('WSServer single-flight anchor missing')
    ws = ws.replace('const SOCKET_SINGLE_FLIGHT_TAGS = new Set([3001, 3204, 3505, 3506, 3507]);',
                    'const SOCKET_SINGLE_FLIGHT_TAGS = new Set([3001, 3204, 3501, 3505, 3506, 3507]);', 1)
    (OUT / 'WSServer.js').write_text(ws, encoding='utf-8', newline='')
    print(target)

if __name__ == '__main__':
    main()
