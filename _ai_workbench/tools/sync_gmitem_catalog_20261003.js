'use strict';
// Read-only inventory. Stub the application logger to avoid retention/pruning.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const crypto = require('node:crypto');
const APP = '/linhhoasu/lhs/newServer';
const GM = '/linhhoasu/webgame/gm/assets/item/gmitem.txt';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const baseline = fs.readFileSync(GM), catalog = {};
for (const line of baseline.toString('utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
  const p = line.split(';'), id = Number(p.length >= 4 ? p[1] : p[0]);
  if (Number.isSafeInteger(id) && id > 0) catalog[id] = p.length >= 4 ? p[2] : p[1];
}
const quiet = { info() {}, warn() {}, error() {}, debug() {} };
const logger = require.resolve(path.join(APP, 'src/logger'));
require.cache[logger] = { id: logger, filename: logger, loaded: true, exports: quiet };
const config = require(path.join(APP, 'src/services/ConfigService'));
const langPath = '/linhhoasu/webgame/game/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin';
const langData = fs.readFileSync(langPath), lang = config.decodeTables(langData).LanguageConfig;
const env = require(path.join(APP, 'node_modules/dotenv')).parse(fs.readFileSync(path.join(APP, '.env')));
const nodes = JSON.parse(cp.execFileSync('pm2', ['jlist'], {encoding:'utf8',maxBuffer:8e6}))
  .filter(n => /^lhs-s100[1-7]$/.test(n.name)).sort((a,b) => a.name.localeCompare(b.name));
const worker = `
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const l=require.resolve('./src/logger');require.cache[l]={id:l,filename:l,loaded:true,exports:{info(){},warn(){},error(){},debug(){}}};
const c=require('./src/services/ConfigService'),t=c.loadAllTables(),a=t.AssetsConfig;
const gm=JSON.parse(process.env.GM_CATALOG_IDS),missing=Object.values(a).filter(r=>Number.isSafeInteger(r.id)&&r.id>0&&!gm[r.id]);
const sourcePaths=Object.keys(require.cache).filter(p=>p.startsWith(process.cwd()+'/src/config/')||p.endsWith('/src/services/ConfigService.js'));
const paths=[process.env.CONFIG_BIN_PATH||'/linhhoasu/lhs/update/resource/assets/excel/config_fashion_20260909.bin',...['FASHION_CONTENT_OVERLAY_PATH','FASHION_CHOICE_OVERLAY_PATH','FASHION_CHOICE_STARS_OVERLAY_PATH'].map(k=>process.env[k]).filter(Boolean),...sourcePaths];
const sources=Object.fromEntries([...new Set(paths)].filter(p=>fs.existsSync(p)).map(p=>[p,sha(fs.readFileSync(p))]));
console.log(JSON.stringify({assetHash:sha(JSON.stringify(a)),assets:Object.keys(a).length,positive:Object.values(a).filter(r=>r.id>0).length,missing,nonPositive:Object.values(a).filter(r=>r.id<=0).map(r=>({id:r.id,name:r.name,type:r.type})),sources,gem10:a[100097]||null,gem10Shop:t.ShopConfig?.[10000007]||null}));
`;
const reports=[];
for(const node of nodes){
  const strings=Object.fromEntries(Object.entries({...env,...node.pm2_env}).filter(([k,v])=>typeof v==='string'||typeof v==='number').map(([k,v])=>[k,String(v)]));
  const raw=cp.execFileSync('node',['-e',worker],{cwd:APP,env:{...process.env,...strings,GM_CATALOG_IDS:JSON.stringify(Object.fromEntries(Object.keys(catalog).map(id=>[id,true])))},encoding:'utf8',timeout:20000,maxBuffer:8e6});
  const result=JSON.parse(raw.trim());
  result.missing=result.missing.map(row=>({...row,language:lang[row.name]||null,description:lang[row.desc]||null}));
  reports.push({node:node.name,status:node.pm2_env.status,pid:node.pid,restarts:node.pm2_env.restart_time,...result});
}
console.log(JSON.stringify({at:new Date().toISOString(),readOnly:true,catalogHash:sha(baseline),catalogCount:Object.keys(catalog).length,languagePath:langPath,languageHash:sha(langData),reports}));
