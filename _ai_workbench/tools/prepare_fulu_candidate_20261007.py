from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / '_ai_workbench/temp/event_goal_20261007/fulu'
source = (ROOT / 'before/handlers/activity.js').read_text(encoding='utf-8')
target = ROOT / 'candidate/handlers/activity.js'
if target.exists():
    raise SystemExit('Candidate already exists; refusing to overwrite reviewed edits')
target.parent.mkdir(parents=True, exist_ok=True)
needle = 'async function handleActivityOperate(params = {}, session = {}, msgUid) {\n'
assert source.count(needle) == 1
source = source.replace(needle, needle + '''  if (getActivityTypeById(Number(params.id)) === 52) {
    return require('../services/Activity52Service').operate(params, session, msgUid, {
      configService, findActivityRow, isActivityWindowOpen, operateFulu,
      buildRewardInfo, buildActivityUpdatePacket, buildFuluDrawPacket,
      buildActivityDropPacket, buildRewardItemSync, rewardGrant,
    });
  }
''')
target.write_text(source, encoding='utf-8', newline='\n')
player_source = (ROOT / 'before/services/PlayerService.js').read_text(encoding='utf-8')
needle = '    if (options.cultivationCAS) {'
assert player_source.count(needle) == 1
player_source = player_source.replace(needle, '''    // Activity52 commits only changed fields and guards the exact pre-mutation
    // values of every affected reward/economy/progress field.
    if (options.activity52CAS) {
      const { fields, expected } = options.activity52CAS;
      if (!Array.isArray(fields) || !fields.length || fields.some(key => !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key))) {
        throw new Error('FULU_CAS_FIELDS_INVALID');
      }
      filter.$and = (filter.$and || []).concat(fields.map(key => ({
        [key]: Object.prototype.hasOwnProperty.call(expected, key) ? { $eq: expected[key] } : { $exists: false },
      })));
    }
''' + needle)
player_target = ROOT / 'candidate/services/PlayerService.js'
player_target.parent.mkdir(parents=True, exist_ok=True)
player_target.write_text(player_source, encoding='utf-8', newline='\n')
