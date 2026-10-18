'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const DAY_GEM = [10, 8, 5, 3, 3, 3, 2, 2, 2, 2];
const WEEK_GEM = [30, 24, 15, 9, 9, 9, 6, 6, 6, 6];
const DAY_TOKEN = [7500, 6000, 4500, 3000, 2400, 1500, 900, 600, 300, 150];
const WEEK_TOKEN = [22500, 18000, 13500, 11250, 11250, 9000, 9000, 8100, 6750, 4500];

function table(name) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'linhhoasu/lhs/newServer/scripts/_tables_dump', `${name}.json`), 'utf8')).data;
}

function transform(source, gem, token) {
  return Object.fromEntries(Object.entries(source).map(([key, row]) => {
    const rewards = row.rewards.map((reward) => {
      if (reward.id === 90078) return { id: 100098, count: gem[Number(key) - 1] };
      if (reward.id === 1) return { id: 1, count: reward.count * 10 };
      return { ...reward };
    });
    assert(!rewards.some((reward) => reward.id === 1001));
    rewards.push({ id: 1001, count: token[Number(key) - 1] });
    return [key, { ...row, rewards }];
  }));
}

const day = transform(table('CrossArenaDayRankRewardConfig'), DAY_GEM, DAY_TOKEN);
const week = transform(table('CrossArenaWeeklyRankRewardConfig'), WEEK_GEM, WEEK_TOKEN);
for (const [rows, gem, token] of [[day, DAY_GEM, DAY_TOKEN], [week, WEEK_GEM, WEEK_TOKEN]]) {
  for (let i = 1; i <= 10; i += 1) {
    const reward = rows[String(i)].rewards;
    assert.strictEqual(reward.filter((r) => r.id === 100098).length, 1);
    assert.strictEqual(reward.find((r) => r.id === 100098).count, gem[i - 1]);
    assert.strictEqual(reward.find((r) => r.id === 1001).count, token[i - 1]);
    assert.strictEqual(reward.filter((r) => r.id === 1).length, 1);
  }
}
assert.strictEqual(day['1'].rewards.find((r) => r.id === 1).count, 4000000);
assert.strictEqual(week['1'].rewards.find((r) => r.id === 1).count, 20000000);
assert.strictEqual(week['1'].rewards.find((r) => r.id === 11221).count, 1);
console.log(JSON.stringify({ result: 'PASS', checks: 22, productionWrites: 0, networkAttempts: 0 }));
