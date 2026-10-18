'use strict';
const fs = require('fs');
const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');
const env = { ...dotenv.parse(fs.readFileSync('.env')), ...process.env };
(async () => {
  const processes = JSON.parse(require('node:child_process').execFileSync('pm2', ['jlist'], { encoding: 'utf8', maxBuffer: 5e6 }))
    .filter(p => /^lhs-s100[1-6]$/.test(p.name));
  const found = [];
  for (const sid of [1001,1002,1003,1004,1005,1006]) {
    const proc = processes.find(p => p.name === 'lhs-s' + String(sid).padStart(4, '0'));
    const procEnv = { ...env, ...(proc && proc.pm2_env && proc.pm2_env.env || {}) };
    const uri = String(procEnv.MONGO_URI || 'mongodb://127.0.0.1:27017/lhs_db').replace(/lhs_s1001$/, 'lhs_s' + sid);
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 4000, socketTimeoutMS: 10000, maxPoolSize: 1 });
    try {
      await client.connect();
      const rows = await client.db().collection('players').find(
        { $or: [{ name: 'Talo' }, { name: 'talo' }, { userId: 'u_Wk_1001_d7b1ec_1787996263464' }] },
        { projection: { _id: 0, userId: 1, playerId: 1, name: 1, level: 1, items: 1, currencies: 1, 'other_attr_info.oldTrekInfo': 1 }, maxTimeMS: 5000 },
      ).limit(4).toArray();
      if (rows.length) found.push({ sid, rows });
    } catch (error) {
      found.push({ sid, error: error.message });
    } finally {
      await client.close().catch(() => {});
    }
  }
  console.log(JSON.stringify({ readOnly: true, directPlayerWrites: 0, found }));
})().catch((error) => { console.error(error.stack); process.exitCode = 1; });
