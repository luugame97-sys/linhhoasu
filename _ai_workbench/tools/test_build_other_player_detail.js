const assert = require('assert');
const path = require('path');

process.env.APP_ENV = 'development';
process.env.SERVER_ID = '1001';

const basic = require('../../linhhoasu/lhs/newServer/src/handlers/basic');

const mockPlayer = {
  _id: '68c746e50e93ca914757ba3b',
  playerId: 'p_u_Wk_1001_1725514605',
  userId: 'u_test_123',
  name: 'TestHero',
  level: 80,
  roleInfo: { kungfuId: 4, stage: 5, stageId: 5, subJob: 1 },
  artifactInfo: {
    artifacts: [{ uid: 1, id: 23101, quenchLv: 1, attr: { level: 5, value: 500 } }],
    artifactMap: { 1: { uid: 1, id: 23101 } },
    orbInfo: { 1: 1 },
  },
  petInfo: {
    pets: [
      { id: 201, level: 30, slot: -1, passiveSkills: [1001, 1002] },
      { id: 202, level: 25, slot: -2, passiveSkills: [1003] },
      { id: 203, level: 20, slot: -3, passiveSkills: [] },
    ],
  },
  other_attr_info: {
    petSoulInfo: {
      petSouls: [
        { id: 301, star: 2, attrRatio: { 1: 5000 }, special: 1, life: 1 },
        { id: 302, star: 1, attrRatio: { 1: 4000 }, special: 0, life: 1 },
      ],
      dispatch: { 1: 301, 2: 302 },
    },
    valhallaInfo: {
      plan: 0,
      planInfo: [{ id: 0, equippedMap: { 0: 1 }, skillHeroIds: [] }],
      valhalla: [{ uid: 1, id: 26111, star: 1, attrUpgrades: [1, 0, 0] }],
    },
    valhallaFormationInfo: {
      attr: { 1: 1000, 2: 200 },
      skills: { 101: 2 },
    },
    bloodlineInfo: {
      wearUid: 1,
      dataList: [
        { uid: 1, id: 27341, tier: 2, score: 500, refineList: [{ star: 1, attrs: { 1: 100 } }] },
      ],
    },
    elfInfo: {
      fightPlan: 1,
      setMap: { 1: 501 },
      elfData: [{ id: 501, star: 2, awake: 1, weapon: {} }],
    },
    curiosInfo: {
      curiosData: [{ id: 401, lv: 2, star: 1 }],
    },
  },
};

console.log('Testing buildOtherPlayerDetail...');
const result = basic.buildOtherPlayerDetail(mockPlayer, { playerId: mockPlayer.playerId, serverId: 1001 });

// 1. Check artifact
assert.ok(result.artifact, 'artifact should not be null');
assert.strictEqual(typeof result.artifact, 'object', 'artifact should be an object');
assert.ok(result.artifact[1], 'artifact[1] must exist for client button');
assert.strictEqual(result.artifact[1].id, 23101, 'artifact[1].id should match');
console.log('Artifact check: PASS');

// 2. Check pet
assert.ok(result.pet, 'pet should not be null');
assert.ok(Array.isArray(result.pet), 'pet should be an array');
assert.ok(result.pet.length >= 1, 'pet array should have at least 1 active pet');
assert.strictEqual(result.pet[0].id, 201, 'primary pet ID should be 201');
assert.strictEqual(result.pet[0].level, 30, 'primary pet level should be 30');
console.log('Pet check: PASS');

// 3. Check petSoul
assert.ok(result.petSoul, 'petSoul should not be null');
assert.ok(Array.isArray(result.petSoul.petSouls), 'petSoul.petSouls should be an array');
assert.strictEqual(result.petSoul.petSouls[0].id, 301, 'petSoul 0 id should match');
assert.ok(result.petSoul.mainData, 'petSoul.mainData should exist');
assert.strictEqual(result.petSoul.mainData.id, 301, 'petSoul.mainData.id should match');
assert.strictEqual(typeof result.petSoul.attr, 'object', 'petSoul.attr should be an object');
console.log('PetSoul check: PASS');

// 4. Check valhalla
assert.ok(result.valhalla, 'valhalla should not be null');
assert.ok(Array.isArray(result.valhalla.skillShowInfo), 'valhalla.skillShowInfo should be an array');
assert.strictEqual(typeof result.valhalla.totalAttr, 'object', 'valhalla.totalAttr should be an object');
console.log('Valhalla check: PASS');

// 5. Check valhallaFormation
assert.ok(result.valhallaFormation, 'valhallaFormation should not be null');
assert.strictEqual(result.valhallaFormation.attr['1'], 1000);
assert.strictEqual(result.valhallaFormation.skills['101'], 2);
console.log('ValhallaFormation check: PASS');

// 6. Check bloodline
assert.ok(result.bloodline, 'bloodline should not be null');
assert.strictEqual(result.bloodline.id, 27341);
assert.strictEqual(result.bloodline.tierLv, 2);
assert.ok(Array.isArray(result.bloodline.refineList));
console.log('Bloodline check: PASS');

// 7. Check elf
assert.ok(result.elf, 'elf should not be null');
assert.strictEqual(result.elf.fightPlan, 1);
assert.ok(result.elf.setMap['1'], 'setMap[1] should exist');
assert.strictEqual(result.elf.setMap['1'].id, 501);
assert.strictEqual(result.elf.setMap['1'].awake, 1);
console.log('Elf check: PASS');

console.log('ALL CHECKS FOR STEP 1 PASSED SUCCESSFULLY!');
