const assert = require('assert');
const path = require('path');

const SERVER_ROOT = path.resolve(__dirname, '../../linhhoasu/lhs/newServer');
process.chdir(SERVER_ROOT);

const config = require(path.join(SERVER_ROOT, 'src/services/ConfigService'));
const farmShop = require(path.join(SERVER_ROOT, 'src/services/FarmShopService'));
const farmDay = require(path.join(SERVER_ROOT, 'src/services/FarmDayService'));
const gameDay = require(path.join(SERVER_ROOT, 'src/services/GameDayService'));

console.log('1. Testing Config loading...');
const shopConfig = config.get('ShopConfig');
assert(shopConfig, 'ShopConfig must be loaded');

const tab1DailyItems = Object.values(shopConfig).filter(g => g.tab === 1 && g.limitType === 1);
console.log(`Found ${tab1DailyItems.length} Tab 1 daily limit items.`);
assert(tab1DailyItems.length === 16, 'Expected 16 Tab 1 daily limit items');

console.log('2. Testing FarmShopService.getShopDayKey and getShopWeekKey...');
const now = new Date('2026-09-20T13:30:00Z').getTime(); // 20:30 GMT+7 = 21:30 GMT+8
const dayKeyNow = farmShop.getShopDayKey(now);
const weekKeyNow = farmShop.getShopWeekKey(now);
console.log(`DayKey at 20:30 GMT+7: ${dayKeyNow}, WeekKey: ${weekKeyNow}`);

// At 23:00 GMT+7 (16:00 UTC = 00:00 GMT+8 next day)
const midnightGmt8 = new Date('2026-09-20T16:00:00Z').getTime();
const dayKeyNext = farmShop.getShopDayKey(midnightGmt8);
assert.strictEqual(dayKeyNext, dayKeyNow + 1, 'DayKey must increment at 23:00 GMT+7 (00:00 GMT+8)');
console.log('DayKey increments exactly at midnight GMT+8: PASS');

console.log('3. Testing FarmShopService.resetDay with past purchase (Scenario: Sói)...');
const mockPlayerSoi = {
  shopInfo: {
    farmShopDay: 20260914,
    lastBuyTime: new Date('2026-09-14T01:31:06Z').getTime(),
    buyRecords: {
      1000002: 99,
      1000004: 2,
      1000007: 5,
    }
  },
  rechargeInfo: {
    records: [
      { id: 1000002, count: 99 },
      { id: 1000004, count: 2 },
      { id: 1000007, count: 5 },
      { id: 9999999, count: 1 } // some non-daily record
    ]
  },
  other_attr_info: {
    farmGameDay: 20260914
  }
};

assert(farmShop.needsReset(mockPlayerSoi, now), 'needsReset must be true for past player');
assert(farmDay.shouldSync(mockPlayerSoi, now), 'shouldSync must be true for past player');

const changed = farmDay.prepare(mockPlayerSoi, now);
assert(changed, 'prepare must return true');
assert.strictEqual(mockPlayerSoi.shopInfo.buyRecords[1000002], undefined, 'buyRecords 1000002 must be deleted');
assert.strictEqual(mockPlayerSoi.shopInfo.buyRecords[1000004], undefined, 'buyRecords 1000004 must be deleted');
assert.strictEqual(mockPlayerSoi.shopInfo.buyRecords[1000007], undefined, 'buyRecords 1000007 must be deleted');

const rec1000002 = mockPlayerSoi.rechargeInfo.records.find(r => r.id === 1000002);
assert.strictEqual(rec1000002.count, 0, 'rechargeInfo 1000002 count must be 0');
const rec1000004 = mockPlayerSoi.rechargeInfo.records.find(r => r.id === 1000004);
assert.strictEqual(rec1000004.count, 0, 'rechargeInfo 1000004 count must be 0');
const rec999 = mockPlayerSoi.rechargeInfo.records.find(r => r.id === 9999999);
assert.strictEqual(rec999.count, 1, 'non-daily record must be preserved');

console.log('Past purchase reset: PASS');

console.log('4. Testing FarmShopService.resetDay with today purchase and midnight rollover...');
const mockPlayerToday = {
  shopInfo: {
    shopDayKey: dayKeyNow,
    farmShopDay: 20260920,
    lastBuyTime: now,
    buyRecords: {
      1000007: 1 // Talo bought 1 today
    }
  },
  rechargeInfo: {
    records: [
      { id: 1000007, count: 1 }
    ]
  },
  other_attr_info: {
    farmGameDay: 20260920
  }
};

// Before midnight: should NOT reset
assert(!farmShop.needsReset(mockPlayerToday, now), 'needsReset must be false before midnight');
assert(!farmDay.shouldSync(mockPlayerToday, now), 'shouldSync must be false before midnight');

// After midnight GMT+8 (23:00 GMT+7)
assert(farmShop.needsReset(mockPlayerToday, midnightGmt8), 'needsReset must be true after midnight GMT+8');
assert(farmDay.shouldSync(mockPlayerToday, midnightGmt8), 'shouldSync must be true after midnight GMT+8');

const midnightChanged = farmDay.prepare(mockPlayerToday, midnightGmt8);
assert(midnightChanged, 'prepare must return true at midnight');
assert.strictEqual(mockPlayerToday.shopInfo.buyRecords[1000007], undefined, '1000007 must be deleted after midnight');
assert.strictEqual(mockPlayerToday.rechargeInfo.records.find(r => r.id === 1000007).count, 0, '1000007 count must be 0 after midnight');

console.log('Today purchase and midnight rollover: PASS');

console.log('ALL UNIT TESTS PASSED 100%!');
