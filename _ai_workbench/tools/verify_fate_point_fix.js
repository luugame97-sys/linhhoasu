const path = require('path');
const config = require(path.join(process.cwd(), 'src/services/ConfigService'));
const fate = require(path.join(process.cwd(), 'src/handlers/fate'));
const playerService = require(path.join(process.cwd(), 'src/services/PlayerService'));

config.loadAllTables();
playerService.savePlayer = async () => true;

(async () => {
  const withBonus = { level: 33, items: { 99: 50 }, currencies: {}, fateInfo: { id: 1, planInfoMap: { '1': { skills: [] } } } };
  const withoutBonus = { level: 33, items: {}, currencies: {}, fateInfo: { id: 1, planInfoMap: { '1': { skills: [] } } } };
  const withCurios = { level: 33, items: {}, currencies: {}, other_attr_info: { curiosInfo: { curiosData: [{ id: 130611 }] } }, fateInfo: { id: 1, planInfoMap: { '1': { skills: [] } } } };
  const bonusResults = [];
  for (const skillId of [1, 2, 5, 8]) {
    const response = await fate.handleFateChooseSkill({ id: 1, skillId }, { userId: 'fate-contract', player: withBonus }, skillId);
    const packets = Array.isArray(response) ? response : [response];
    const ack = packets.find((packet) => packet && packet.tag === 3802);
    bonusResults.push({ skillId, result: ack && ack.data && ack.data.result });
  }
  const noBonusResults = [];
  for (const skillId of [1, 2, 5, 8]) {
    const response = await fate.handleFateChooseSkill({ id: 1, skillId }, { userId: 'fate-contract', player: withoutBonus }, skillId);
    const packets = Array.isArray(response) ? response : [response];
    const ack = packets.find((packet) => packet && packet.tag === 3802);
    noBonusResults.push({ skillId, result: ack && ack.data && ack.data.result });
  }
  const result = {
    result: 'ok',
    basePointsLevel33: fate.getTalentPoint(withoutBonus),
    bonusPointsLevel33: fate.getTalentPoint(withBonus),
    curiosPointsLevel33: fate.getTalentPoint(withCurios),
    bonusLimitRound1: fate.getTalentPointLimit(withBonus, 1),
    choiceWithBonus: bonusResults,
    choiceWithoutBonus: noBonusResults,
    item99After: withBonus.items[99],
    selectedSkills: withBonus.fateInfo.planInfoMap['1'].skills,
  };
  if (result.basePointsLevel33 !== 10 || result.bonusPointsLevel33 !== 60
    || result.curiosPointsLevel33 !== 16 || result.bonusLimitRound1 !== 140
    || result.choiceWithBonus.some((row) => row.result !== 0)
    || result.choiceWithoutBonus[3].result !== null
    || result.item99After !== 50) {
    throw new Error(JSON.stringify(result));
  }
  console.log(JSON.stringify(result, null, 2));
})().catch((error) => { console.error(error.stack || error.message || String(error)); process.exitCode = 1; });
