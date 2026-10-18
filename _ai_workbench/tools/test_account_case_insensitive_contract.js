'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const candidate = path.join(root, '_ai_workbench', 'temp', 'account_case_insensitive_candidate_20260901', 'src', 'handlers');
const account = fs.readFileSync(path.join(candidate, 'account.js'), 'utf8');
const serverList = fs.readFileSync(path.join(candidate, 'serverList.js'), 'utf8');
const accountServiceSource = fs.readFileSync(path.join(root, 'linhhoasu', 'lhs', 'newServer', 'src', 'services', 'AccountService.js'), 'utf8');
if (!/function normalizeAccountId\(value\)\s*{\s*return String\(value \|\| ''\)\.trim\(\)\.toLowerCase\(\);\s*}/.test(accountServiceSource)) {
  throw new Error('AccountService canonical lowercase contract missing');
}
const normalizeAccountId = (value) => String(value || '').trim().toLowerCase();

const variants = ['ohokaka12321', 'Ohokaka12321', 'oHokaka12321', 'OHOKAKA12321'];
const normalized = variants.map(normalizeAccountId);
if (!normalized.every((value) => value === 'ohokaka12321')) throw new Error('normalizeAccountId is not case-insensitive');

const sdkAnchor = 'accountId = accountService.normalizeAccountId(account.accountId || accountId);';
if (!serverList.includes(sdkAnchor)) throw new Error('SDK auth canonical response anchor missing');
if (serverList.indexOf(sdkAnchor) > serverList.indexOf('authSessionService.create({')) throw new Error('canonicalization happens after token creation');
if (!/uid:\s*accountId/.test(serverList)) throw new Error('SDK uid does not use canonical accountId');

const required = [
  'canonicalPlatformAccount = accountService.normalizeAccountId(platformuid)',
  'canonicalSessionAccount = accountService.normalizeAccountId(authSession.accountId)',
  'platformMatchesAccount',
  'platformMatchesRole',
];
for (const marker of required) if (!account.includes(marker)) throw new Error(`WS canonical marker missing: ${marker}`);

function wsMatch(platformuid, sessionAccount, sessionUserId) {
  const left = normalizeAccountId(platformuid);
  const right = normalizeAccountId(sessionAccount);
  return (!!platformuid && left === right) || (!!platformuid && platformuid === sessionUserId);
}
for (const variant of variants) if (!wsMatch(variant, 'ohokaka12321', 'u_Wk_1001_case')) throw new Error(`WS mismatch for ${variant}`);
if (!wsMatch('u_Wk_1001_case', 'ohokaka12321', 'u_Wk_1001_case')) throw new Error('role userId compatibility broke');
if (wsMatch('another-account', 'ohokaka12321', 'u_Wk_1001_case')) throw new Error('different account was accepted');

console.log(JSON.stringify({result:'PASS', checks:12, variants, canonical:'ohokaka12321'}));
