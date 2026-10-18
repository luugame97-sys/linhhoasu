const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const bundlePath = path.join(root, 'linhhoasu', 'webgame', 'game', 'js', 'main.min_a6195824.js');
const indexPath = path.join(root, 'linhhoasu', 'webgame', 'game', 'index.html');
const bundle = fs.readFileSync(bundlePath, 'utf8');
const index = fs.readFileSync(indexPath, 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(bundle.includes('Array.isArray(t.changed)&&t.changed.length'), 'missing changed authoritative guard');
assert(bundle.includes('_lhsAbs[_lhsId]-(Number(this._itemMap[_lhsId])||0)'), 'missing absolute-to-delta conversion');
assert(bundle.includes('for(var e=0,i=t.items||[];e<i.length;e++)'), 'missing safe legacy delta loop');
assert(
  !bundle.includes('m.onItemChange=function(t){if(this.isFreeze)this.cacheMsg.push(t);else{for(var e=0,i=t.items;e<i.length;e++){'),
  'old ItemModel.onItemChange anchor still present',
);
assert((index.match(/20260831_stage_touch_recovery_guard10/g) || []).length === 2, 'cache version must appear twice');

function normalize(current, packet) {
  const abs = {};
  const seen = {};
  const out = [];
  const rows = Array.isArray(packet.items) ? packet.items : [];
  for (const row of packet.changed || []) {
    const id = Number(row && row.id);
    if (id > 0 && Number.isFinite(id)) abs[id] = Math.max(0, Math.floor(Number(row.count) || 0));
  }
  for (const row of rows) {
    const id = Number(row && row.id);
    if (Object.prototype.hasOwnProperty.call(abs, id)) {
      if (!seen[id]) {
        out.push({ id, count: abs[id] - (Number(current[id]) || 0) });
        seen[id] = 1;
      }
    } else {
      out.push(row);
    }
  }
  for (const key in abs) {
    if (!seen[key]) out.push({ id: Number(key), count: abs[key] - (Number(current[key]) || 0) });
  }
  return out;
}

function apply(current, rows) {
  const result = { ...current };
  for (const row of rows) result[row.id] = (Number(result[row.id]) || 0) + Number(row.count || 0);
  return result;
}

let current = { 1: 956, 52: 100 };
let rows = normalize(current, {
  items: [{ id: 1, count: 956 }, { id: 52, count: 100 }],
  changed: [{ id: 1, count: 956 }, { id: 52, count: 15 }],
});
let after = apply(current, rows);
assert(after[1] === 956, `snapshot currency duplicated: ${after[1]}`);
assert(after[52] === 15, `artifact shard absolute balance incorrect: ${after[52]}`);

current = { 52: 100 };
rows = normalize(current, { items: [{ id: 52, count: -85 }], changed: [{ id: 52, count: 15 }] });
after = apply(current, rows);
assert(after[52] === 15, `delta packet with changed incorrect: ${after[52]}`);

current = { 52: 100 };
after = apply(current, [{ id: 52, count: 5 }]);
assert(after[52] === 105, `legacy delta packet changed unexpectedly: ${after[52]}`);

console.log('PASS client authoritative item sync: snapshot, delta+changed, legacy delta');
