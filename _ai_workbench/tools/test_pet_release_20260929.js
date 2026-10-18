'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const app = path.join(root, 'linhhoasu/lhs/newServer');
const source = fs.readFileSync(path.join(app, 'src/handlers/pet.js'), 'utf8');
const cfgService = require(path.join(app, 'src/services/ConfigService'));
const tables = cfgService.decodeTables(fs.readFileSync(path.join(root, '_ai_workbench/temp/pet_vusa_port_20260929/candidate/config_e5ac72c2.bin')));

function load() {
  const deps = {
    '../services/ConfigService': { get: (name) => tables[name] || {} },
    '../services/PlayerService': { savePlayer: async () => {}, savePlayerDeferred: async () => {} },
    '../logger': { warn() {}, info() {}, error() {} },
    '../services/MainTaskProgressService': {
      addPetComposeCount() { return false; }, addPetWashCount() { return false; }, refreshMainTaskProgress() { return false; },
    },
    './raid': { addRewardToPlayer(player, id, count) { player.items ||= {}; player.items[id] = (player.items[id] || 0) + count; } },
    './task': { buildActiveTaskUpdatePackets() { return []; } },
  };
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module, exports: module.exports,
    require: (key) => deps[key],
    process: { env: {} }, console, Date, Math,
  }, { filename: 'pet.js' });
  return module.exports;
}

function player(pets, item36 = 0, silver = 0) {
  return {
    items: { 36: item36 },
    currencies: { diamond: 0, gold: 0, silver },
    petInfo: { field: 16, nextUid: 100010, pets, unlockAtlas: [], rewardedAtlas: [], wishMap: {}, timeRecords: {} },
  };
}

function pet(uid, id, slot = 0, level = 1, locked = 0) {
  return { uid, id, level, exp: 0, slot, locked, lock: locked, passiveSkills: [], lockSkills: [] };
}

function packet(result, tag) {
  const list = Array.isArray(result) ? result : [result];
  return list.find((row) => row && row.tag === tag);
}

async function runTests() {
  const handler = load();
  console.log('--- STARTING PET RELEASE TESTS ---');

  // Test 1: Phóng sinh pet phẩm 2 (Lục) level 1 -> nhận 5.000 bạc
  {
    const p = player([pet(1, 82101, 0, 1)], 0, 0);
    const res = await handler.handlePetRelease({ uid: 1 }, { userId: 'u1', player: p }, 101);
    const r = packet(res, 3315);
    assert.equal(r.data.result, 0);
    assert.equal(r.data.silver, 5000);
    assert.equal(r.data.refundFruit, 0);
    assert.equal(p.currencies.silver, 5000);
    assert.equal(p.petInfo.pets.length, 0);
    console.log('Test 1 PASS: Phóng sinh phẩm 2 nhận 5.000 bạc');
  }

  // Test 2: Phóng sinh pet phẩm 7 (Hoàng Kim) level 1 -> nhận 500.000 bạc
  {
    const p = player([pet(2, 87101, 0, 1)], 0, 0);
    const res = await handler.handlePetRelease({ uid: 2 }, { userId: 'u1', player: p }, 102);
    const r = packet(res, 3315);
    assert.equal(r.data.result, 0);
    assert.equal(r.data.silver, 500000);
    assert.equal(p.currencies.silver, 500000);
    assert.equal(p.petInfo.pets.length, 0);
    console.log('Test 2 PASS: Phóng sinh phẩm 7 nhận 500.000 bạc');
  }

  // Test 3: Phóng sinh pet phẩm 9 (Thần Thú) level 1 -> nhận 2.000.000 bạc
  {
    const p = player([pet(3, 89101, 0, 1)], 0, 0);
    const res = await handler.handlePetRelease({ uid: 3 }, { userId: 'u1', player: p }, 103);
    const r = packet(res, 3315);
    assert.equal(r.data.result, 0);
    assert.equal(r.data.silver, 2000000);
    assert.equal(p.currencies.silver, 2000000);
    assert.equal(p.petInfo.pets.length, 0);
    console.log('Test 3 PASS: Phóng sinh phẩm 9 nhận 2.000.000 bạc');
  }

  // Test 4: Phóng sinh pet phẩm 10 (Hỗn Độn) level 1 -> nhận 10.000.000 bạc
  {
    const p = player([pet(4, 810101, 0, 1)], 0, 0);
    const res = await handler.handlePetRelease({ uid: 4 }, { userId: 'u1', player: p }, 104);
    const r = packet(res, 3315);
    assert.equal(r.data.result, 0);
    assert.equal(r.data.silver, 10000000);
    assert.equal(p.currencies.silver, 10000000);
    assert.equal(p.petInfo.pets.length, 0);
    console.log('Test 4 PASS: Phóng sinh phẩm 10 nhận 10.000.000 bạc');
  }

  // Test 5: Phóng sinh pet phẩm 2 level 5 -> hoàn trả đúng số Quả Linh đã tiêu
  {
    // Phẩm 2: base 5, add 3
    // lv1->lv2: 5 + 3*0 = 5
    // lv2->lv3: 5 + 3*1 = 8
    // lv3->lv4: 5 + 3*2 = 11
    // lv4->lv5: 5 + 3*3 = 14
    // Tổng = 5 + 8 + 11 + 14 = 38 Quả Linh
    const p = player([pet(5, 82101, 0, 5)], 10, 0);
    const res = await handler.handlePetRelease({ uid: 5 }, { userId: 'u1', player: p }, 105);
    const r = packet(res, 3315);
    assert.equal(r.data.result, 0);
    assert.equal(r.data.silver, 5000);
    assert.equal(r.data.refundFruit, 38);
    assert.equal(p.items[36], 10 + 38);
    assert.equal(p.currencies.silver, 5000);
    assert.equal(p.petInfo.pets.length, 0);
    console.log('Test 5 PASS: Phóng sinh pet level 5 hoàn trả 38 Quả Linh');
  }

  // Test 6: Chặn phóng sinh pet đang khóa
  {
    const p = player([pet(6, 82101, 0, 1, 1)], 0, 0);
    const res = await handler.handlePetRelease({ uid: 6 }, { userId: 'u1', player: p }, 106);
    const r = packet(res, 3315);
    assert.equal(r.data.result, -1);
    assert.match(r.data.msg, /khóa/);
    assert.equal(p.petInfo.pets.length, 1);
    console.log('Test 6 PASS: Chặn phóng sinh pet bị khóa');
  }

  // Test 7: Chặn phóng sinh pet đang xuất chiến (slot = -1)
  {
    const p = player([pet(7, 82101, -1, 1, 0)], 0, 0);
    const res = await handler.handlePetRelease({ uid: 7 }, { userId: 'u1', player: p }, 107);
    const r = packet(res, 3315);
    assert.equal(r.data.result, -1);
    assert.match(r.data.msg, /xuất chiến/);
    assert.equal(p.petInfo.pets.length, 1);
    console.log('Test 7 PASS: Chặn phóng sinh pet đang xuất chiến');
  }

  // Test 8: Chặn phóng sinh pet đang liên kết Hồn Thú
  {
    const targetPet = pet(8, 87101, 0, 1, 0);
    const p = player([targetPet], 0, 0);
    p.petSoulInfo = { petSouls: [{ id: 280301, petUid: 8 }] };
    const res = await handler.handlePetRelease({ uid: 8 }, { userId: 'u1', player: p }, 108);
    const r = packet(res, 3315);
    assert.equal(r.data.result, -1);
    assert.match(r.data.msg, /Hồn Thú/);
    assert.equal(p.petInfo.pets.length, 1);
    console.log('Test 8 PASS: Chặn phóng sinh pet đang liên kết Hồn Thú');
  }

  console.log('--- ALL 8 TESTS PASSED SUCCESSFULLY ---');
}

runTests().catch((e) => {
  console.error(e.stack || e);
  process.exit(1);
});
