'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../../linhhoasu/lhs/newServer/scripts/_tables_dump');
const Config = require(path.resolve(__dirname, '../../linhhoasu/lhs/newServer/src/services/ConfigService'));
const pay = Config.get('PayConfig') || {};
const shop = Config.get('ShopConfig') || {};
const shopIds = new Set(Object.values(shop).map((r) => Number(r && (r.payId || r.payid || r.rechargeId)) || 0));
const payIds = Object.keys(pay).map(Number).filter(Number.isFinite);
const refs = new Map(payIds.map((id) => [id, []]));
function walk(value, table, pathText) {
  if (Array.isArray(value)) return value.forEach((v, i) => walk(v, table, `${pathText}[${i}]`));
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (/payid|rechargeid|productid|shopid/i.test(key)) {
      const id = Number(child);
      if (refs.has(id)) refs.get(id).push({ table, path: `${pathText}.${key}`, key, value: child });
    }
    walk(child, table, `${pathText}.${key}`);
  }
}
for (const id of payIds) walk(pay[id], 'PayConfig', String(id));
for (const file of fs.readdirSync(root).filter((f) => f.endsWith('.json'))) {
  try { walk(JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')), file.slice(0, -5), '$'); } catch (_) {}
}
const out = payIds.sort((a, b) => a - b).map((id) => ({ id, price: pay[id], shopLinked: shopIds.has(id), refs: refs.get(id) }));
const outPath = path.resolve(__dirname, '../temp/pay_id_config_refs.json');
fs.writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify({ outPath, count: out.length, noShop: out.filter((x) => !x.shopLinked).length, noRefs: out.filter((x) => !x.shopLinked && x.refs.length === 0).length }, null, 2));
