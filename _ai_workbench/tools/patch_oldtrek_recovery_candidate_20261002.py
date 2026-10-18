from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
PATH = ROOT / '_ai_workbench/temp/oldtrek_recovery_20261002/candidate/server/src/handlers/old-trek.js'


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected one match, got {count}')
    return text.replace(old, new)


def main() -> None:
    text = PATH.read_text(encoding='utf-8')
    text = replace_once(
        text,
        "  const destId = Math.max(0, toSafeInt(request.id, 0));\n\n  if (destId > 0) {",
        "  const destId = Math.max(0, toSafeInt(request.id, 0));\n  const expiredRecovery = recoverExpiredOldTrekEvent(info, player);\n\n  if (destId > 0) {",
        'snapshot recovery hook',
    )
    text = replace_once(
        text,
        "  if (JSON.stringify(info) !== JSON.stringify(session.oldTrekCAS?.oldTrekInfo)) await saveOldTrek(session);\n  return { tag: 7000, msgUid, data: info };",
        "  if (JSON.stringify(info) !== JSON.stringify(session.oldTrekCAS?.oldTrekInfo)) await saveOldTrek(session);\n  return { tag: 7000, msgUid, data: expiredRecovery ? { ...info, expiredRecovery } : info };",
        'snapshot recovery response',
    )
    text = replace_once(
        text,
        "        data = { result: 1, code: 'OLD_TREK_EVENT_PENDING', event: sailInfo.currentEvent, updateData: buildTrekUpdate(sailInfo.trekData), revision: info.stateRevision };",
        "        data = { result: 1, code: 'OLD_TREK_EVENT_PENDING', event: sailInfo.currentEvent, updateData: buildTrekUpdate(sailInfo.trekData), recovery: oldTrekRecoveryState(info), revision: info.stateRevision };",
        'pending recovery payload',
    )
    text = replace_once(
        text,
        "      const sailInfo = ensureSailInfo(info);\n      // A snapshot must not spawn a fresh encounter while recovering an arrival.\n      // 7001/7005 continue to own new event generation under the existing policy.\n      const passive = passiveTrekRewards(info);",
        "      const sailInfo = ensureSailInfo(info);\n      let recoveredSettlement = null;\n      if (expiredRecovery && !sailInfo.currentEvent && sailInfo.trekData) {\n        recoveredSettlement = settleArrivedOldTrek(info, player, sailInfo.trekData.uid);\n      }\n      // A snapshot must not spawn a fresh encounter while recovering an arrival.\n      // 7001/7005 continue to own new event generation under the existing policy.\n      const passive = passiveTrekRewards(info);",
        'expired settlement hook',
    )
    text = replace_once(
        text,
        "      sailInfo.offlineCache = { reward: [], event: {}, lose: [], robCount: 0, stable: 0 };\n      if (!sailInfo.trekData && info.endCache && info.lastEndCache) {",
        "      sailInfo.offlineCache = { reward: [], event: {}, lose: [], robCount: 0, stable: 0 };\n      if (recoveredSettlement && recoveredSettlement.status === 'settled') {\n        pushPackets.push({ tag: 7010, msgUid: 0, data: recoveredSettlement.settlement });\n      }\n      if (!sailInfo.trekData && info.endCache && info.lastEndCache) {",
        'expired settlement response',
    )
    text = replace_once(
        text,
        "  if (process.env.OLD_TREK_EVENT_ENGINE_ENABLED !== '1' || !event\n      || !Number.isFinite(event.deadline) || event.deadline <= 0 || event.deadline >= now",
        "  const deadline = Number(event && event.deadline);\n  if (process.env.OLD_TREK_EVENT_ENGINE_ENABLED !== '1' || !event\n      || !Number.isFinite(deadline) || deadline <= 0 || deadline >= now",
        'deadline normalization',
    )
    PATH.write_text(text, encoding='utf-8', newline='')
    print(PATH)


if __name__ == '__main__':
    main()
