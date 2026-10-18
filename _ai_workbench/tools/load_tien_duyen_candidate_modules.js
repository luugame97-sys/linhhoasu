const path = require('path');

const root = path.resolve(
  process.env.TIEN_DUYEN_CANDIDATE_ROOT
  || path.join(__dirname, '../temp/tien_duyen_runtime_candidate_20260831_184500')
);
process.env.CONFIG_BIN_PATH = path.join(root, 'linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin');
process.env.NODE_ENV = 'production';
const src = path.join(root, 'linhhoasu/lhs/newServer/src');
const modules = [
  'services/Activity9Service',
  'services/RechargeBenefitService',
  'handlers/activity',
  'handlers/compat',
  'handlers/recharge',
  'handlers/account',
  'handlers/index',
];
for (const name of modules) {
  const loaded = require(path.join(src, name));
  if (!loaded || typeof loaded !== 'object') throw new Error(name + ' export invalid');
  console.log('loaded ' + name);
}
const config = require(path.join(src, 'services/ConfigService'));
const pay = config.get('PayConfig');
if (!pay || pay[10501].priceR !== 68 || pay[10502].priceR !== 68) {
  throw new Error('candidate server PayConfig price mismatch');
}
console.log(JSON.stringify({ result: 'ok', tables: Object.keys(config.loadAllTables()).length, priceR: { 10501: pay[10501].priceR, 10502: pay[10502].priceR } }));

