from pathlib import Path

root = Path(__file__).resolve().parents[2] / '_ai_workbench/temp/event_goal_20261007/fulu'
def edit(name, changes):
    target = root / 'candidate' / name
    if target.exists():
        raise RuntimeError('Refusing existing candidate: ' + name)
    source = (root / 'before' / name).read_text(encoding='utf-8')
    for old, new, count in changes:
        if source.count(old) != count:
            raise RuntimeError('Anchor mismatch: ' + name + ' ' + old[:60])
        source = source.replace(old, new)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(source, encoding='utf-8', newline='\n')

edit('handlers/task.js', [
    ('async function handleClaimTaskReward(params, session, msgUid) {', '''async function handleClaimTaskReward(params, session, msgUid) {
  const fuluClaim = await require('../services/Activity52TaskService').claim(params, session, msgUid);
  if (fuluClaim) return fuluClaim;''', 1),
    ('async function handleClaimTaskRewardCompat(params, session, msgUid) {', '''async function handleClaimTaskRewardCompat(params, session, msgUid) {
  const fuluClaim = await require('../services/Activity52TaskService').claim(params, session, msgUid);
  if (fuluClaim) return fuluClaim;''', 1),
])
edit('handlers/playerPayload.js', [
    ('  recordTaskNormalizeNs(nowNs() - perfStartNs);', '''  require('../services/Activity52TaskService').sync(playerInput, taskInfo);
  recordTaskNormalizeNs(nowNs() - perfStartNs);''', 1),
    ('  const retainedCompletedTaskIds = new Set();', '''  const retainedCompletedTaskIds = new Set(require('../services/Activity52TaskService').IDS);''', 1),
])
edit('services/SideTaskProgressService.js', [
    ('  const { tasks, roots } = graph(), info = ensureInfo(player); let changed = false;', '''  const fuluChanged = require('./Activity52TaskService').recordProgress(player, activeId, delta, options);
  const { tasks, roots } = graph(), info = ensureInfo(player); let changed = fuluChanged;''', 1),
])
edit('services/MainTaskProgressService.js', [
    ('function refreshMainTaskProgress(player = {}) {', '''function refreshMainTaskProgress(player = {}) {
  const fuluChanged = require('./Activity52TaskService').refresh(player);''', 1),
    ('  let changed = canonicalChanged || needsStructurePersistence;', '  let changed = canonicalChanged || needsStructurePersistence || fuluChanged;', 1),
])
