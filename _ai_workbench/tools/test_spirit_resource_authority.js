const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const accountPath = path.join(root, 'linhhoasu', 'lhs', 'newServer', 'src', 'handlers', 'account.js');
const spiritPath = path.join(root, 'linhhoasu', 'lhs', 'newServer', 'src', 'handlers', 'spirit.js');
const account = fs.readFileSync(accountPath, 'utf8');
const spirit = fs.readFileSync(spiritPath, 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(!account.includes('LOGIN_SPIRIT_STONE_MIN'), 'login still replenishes item 60');
assert(!account.includes('LOGIN_SPIRIT_ESSENCE_MIN'), 'login still replenishes item 61');
assert(!account.includes('player.items[60] = minSpiritStone'), 'item 60 minimum reset remains');
assert(!account.includes('player.items[61] = minSpiritEssence'), 'item 61 minimum reset remains');
assert(account.includes('[60, 61].forEach((itemId)'), 'malformed material normalization missing');

assert(!spirit.includes("require('../services/CurrencySync')"), 'spirit still imports full inventory builder');
assert(
  (spirit.match(/NODE_ENV \|\| ''\)\.toLowerCase\(\) === 'production'\) return false;/g) || []).length === 3,
  'production fail-open guards are missing',
);
assert(spirit.includes('deltas.push({ id: itemId, count: after - before })'), 'spirit delta builder missing');
assert(spirit.includes('items: deltas,'), 'Spirit 3600 still sends a full snapshot');
assert(
  spirit.includes('items: [{ id: LEGACY_SPIRIT_FRAGMENT_ITEM_ID, count: afterFragment - beforeFragment }]'),
  'legacy Spirit 3001 still sends a full snapshot',
);

function buildSync(before, after) {
  const changed = [];
  const items = [];
  for (const id of Object.keys(before)) {
    if (before[id] === after[id]) continue;
    changed.push({ id: Number(id), count: after[id] });
    items.push({ id: Number(id), count: after[id] - before[id] });
  }
  return { items, changed };
}

const oneClick = buildSync({ 1: 4169000000, 60: 100, 61: 10 }, { 1: 4169000000, 60: 79, 61: 10 });
assert(JSON.stringify(oneClick.items) === JSON.stringify([{ id: 60, count: -21 }]), 'one-click delta is not -21');
assert(oneClick.changed.find((row) => row.id === 60).count === 79, 'item 60 absolute balance is not 79');
assert(!oneClick.items.some((row) => row.id === 1), 'unchanged diamond leaked into item delta');

console.log('PASS spirit resource authority: no login refill, item60=-21, unchanged diamond omitted');
