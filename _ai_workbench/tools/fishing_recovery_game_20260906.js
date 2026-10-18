'use strict';
throw Error('WITHDRAWN: out-of-process recovery is not approved for execution; use locked in-process incident service.');
// Incident-only game-side executor. It never trusts a caller-supplied amount.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const assert = require('assert/strict');
const { MongoClient } = require('/linhhoasu/lhs/newServer/node_modules/mongodb');
const dotenv = require('/linhhoasu/lhs/newServer/node_modules/dotenv');
dotenv.config({ path: '/linhhoasu/lhs/newServer/.env' });

const action = process.argv[2];
const planPath = process.argv[3];
const backupDir = process.argv[4];
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
const rows = Array.isArray(plan.rows) ? plan.rows : [];
const INCIDENT = String(plan.incident || '');
const CODE = 'FISH_FREE_20260906';
const MARKER = 'fishingFreeRecovery20260906';
const identityDb = String(process.env.IDENTITY_MONGO_DB || 'lhs_s1001');
const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
const n = value => (Number.isFinite(Number(value)) ? Math.floor(Number(value)) : 0);
const clone = value => JSON.parse(JSON.stringify(value));
const safeId = value => String(value || '').trim();
const nonAdminRows = rows.filter(row => safeId(row.accountId) !== 'vanduc97');
const allTargets = new Map(rows.map(row => [safeId(row.userId), row]));
const banTargets = new Map(nonAdminRows.map(row => [safeId(row.accountId), row]));

function readEnvApiKey() {
  const key = String(process.env.API_KEY || 'lhs_internal_key').trim();
  if (!key) throw Error('INTERNAL_API_KEY_MISSING');
  return key;
}

function post(port, requestPath, body) {
  const apiKey = readEnvApiKey();
  const timestamp = Date.now();
  const nonce = crypto.randomBytes(16).toString('hex');
  const payload = JSON.stringify(body || {});
  const signature = crypto.createHmac('sha256', apiKey)
    .update(['POST', requestPath, String(timestamp), nonce, payload].join('\n'), 'utf8').digest('hex');
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: requestPath, method: 'POST', timeout: 15000,
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload),
        'x-api-key': apiKey, 'x-timestamp': String(timestamp), 'x-nonce': nonce, 'x-signature': signature } }, res => {
      let text = ''; res.setEncoding('utf8'); res.on('data', chunk => { text += chunk; });
      res.on('end', () => { try { const data = JSON.parse(text); resolve({ status: res.statusCode, data }); }
        catch (error) { reject(new Error('INTERNAL_API_INVALID_JSON_' + res.statusCode)); } });
    });
    req.on('timeout', () => req.destroy(new Error('INTERNAL_API_TIMEOUT'))); req.on('error', reject); req.end(payload);
  });
}

function gamePort(serverId) { return Number(serverId) === 1002 ? 8083 : 8080; }
function banBody(row) {
  return { accountId: row.accountId, durationSeconds: row.penaltySeconds, reason: 'Nhận vượt giới hạn gói miễn phí Đại hội câu cá.',
    code: CODE, by: 'owner-approved', dryRun: false, confirm: true, meta: { source: 'fishing-remediation', eventId: 6006,
      shopId: 11001400, exploitCount: row.recordedClaims - 1, exploitBaozi: row.amount, evidenceId: INCIDENT,
      title: 'Thiên Đạo Ban Lệnh' } };
}
function mailBody(row) {
  const isExempt = safeId(row.accountId) === 'vanduc97';
  const duration = row.penaltySeconds ? ` Tài khoản game và web bị khóa ${row.penaltySeconds / 60} phút.` : ' Tài khoản được miễn khóa theo yêu cầu quản trị.';
  return { userIds: [row.userId], title: 'Thông báo thu hồi Bánh Bao', sender: '0', attachments: [], expireDays: 30,
    content: `Đã thu hồi ${n(row.amount).toLocaleString('vi-VN')} Bánh Bao nhận vượt giới hạn gói miễn phí Đại hội câu cá ngày 06/09/2026.${duration} Mã đối soát: ${INCIDENT}.`,
    eventKey: `${INCIDENT}:${row.userId}` };
}

async function connect() { const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 10000 }); await client.connect(); return client; }
function playerCollection(client, serverId) { return client.db(`lhs_s${Number(serverId)}`).collection('players'); }
function accountCollection(client) { return client.db(identityDb).collection('accounts'); }
function marker(player) { return player?.moderation?.[MARKER] || null; }
function verifyPlayer(player, row) {
  if (!player || safeId(player.userId) !== row.userId || safeId(player.playerId) !== row.playerId || Number(player.serverId) !== Number(row.serverId)
      || safeId(player.accountId) !== safeId(row.accountId) || player.isBot === true) throw Error('PLAYER_IDENTITY_CHANGED_' + row.userId);
  const shop = n(player.shopInfo?.buyRecords?.[11001400]);
  const records = (player.rechargeInfo?.records || []).filter(r => Number(r.id) === 11001400).map(r => n(r.count));
  if (records.length !== 1 || records[0] !== shop || shop < n(row.recordedClaims)) throw Error('PLAYER_COUNTER_CHANGED_' + row.userId);
}
async function preflight(client) {
  const out = { players: [], accounts: [], bans: [], admin: null };
  for (const row of rows) {
    const p = await playerCollection(client, row.serverId).findOne({ userId: row.userId });
    verifyPlayer(p, row);
    if (marker(p)) throw Error('RECOVERY_MARKER_EXISTS_' + row.userId);
    if (!Number.isSafeInteger(n(p.items?.[4])) || n(p.items[4]) < n(row.amount)) throw Error('PLAYER_BAOZI_SHORTFALL_' + row.userId);
    const account = await accountCollection(client).findOne({ accountId: row.accountId });
    if (!account || !(account.roles || []).some(role => safeId(role.userId) === row.userId && Number(role.serverId) === Number(row.serverId))) throw Error('ACCOUNT_ROLE_MAP_CHANGED_' + row.accountId);
    if (safeId(row.accountId) !== 'vanduc97' && n(account.status) <= 0 && safeId(account.banCode) !== CODE) throw Error('UNRELATED_GAME_BAN_' + row.accountId);
    out.players.push({ row, before: { items: clone(p.items || {}), moderation: clone(p.moderation || {}), updatedAt: p.updatedAt || null } });
    out.accounts.push({ accountId: row.accountId, status: account.status, authVersion: account.authVersion || 1,
      banUntil: account.banUntil || null, banCode: account.banCode || '', banMeta: clone(account.banMeta || {}) });
  }
  const admin = await accountCollection(client).findOne({ accountId: 'vanduc97' });
  out.admin = admin ? { status: admin.status, authVersion: admin.authVersion || 1, banCode: admin.banCode || '', banUntil: admin.banUntil || null } : null;
  return out;
}
async function applyBans(client) {
  const out = [];
  for (const row of banTargets.values()) {
    const account = await accountCollection(client).findOne({ accountId: row.accountId });
    const old = (account.banHistory || []).find(entry => entry.code === CODE && entry.meta?.evidenceId === INCIDENT);
    if (old) { out.push({ accountId: row.accountId, replayed: true, until: new Date(old.until).getTime() }); continue; }
    const response = await post(gamePort(row.serverId), '/api/internal/account/ban', banBody(row));
    if (response.status !== 200 || !response.data?.success) throw Error('GAME_BAN_FAILED_' + row.accountId + '_' + (response.data?.error || response.status));
    out.push({ accountId: row.accountId, serverId: row.serverId, until: response.data.ban?.until || 0,
      revokedTokens: n(response.data.revokedTokens), kickedSessions: n(response.data.kickedSessions), replayed: false });
  }
  return out;
}
async function rollbackBans() {
  const out = [];
  for (const row of banTargets.values()) {
    try { const response = await post(gamePort(row.serverId), '/api/internal/account/unban', { accountId: row.accountId,
      reason: 'Rollback incident ' + INCIDENT, by: 'owner-approved', dryRun: false, confirm: true });
      out.push({ accountId: row.accountId, ok: response.status === 200 && response.data?.success });
    } catch (error) { out.push({ accountId: row.accountId, ok: false, error: error.message }); }
  }
  return out;
}
async function recoverPlayers(client) {
  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  const before = [], applied = [];
  try {
    for (const row of rows) {
      const collection = playerCollection(client, row.serverId), player = await collection.findOne({ userId: row.userId });
      verifyPlayer(player, row); if (marker(player)) throw Error('RECOVERY_MARKER_EXISTS_' + row.userId);
      const oldCount = n(player.items?.[4]); if (oldCount < n(row.amount)) throw Error('PLAYER_BAOZI_SHORTFALL_' + row.userId);
      before.push({ row, beforeItems: clone(player.items || {}), beforeModeration: clone(player.moderation || {}), beforeCount: oldCount });
      const receipt = { incident: INCIDENT, evidenceSha256: plan.evidenceSha256, accountId: row.accountId, userId: row.userId,
        playerId: row.playerId, serverId: row.serverId, amount: row.amount, before: oldCount, after: oldCount - row.amount,
        appliedAt: new Date().toISOString(), recordedClaims: row.recordedClaims, penaltySeconds: row.penaltySeconds };
      const update = await collection.updateOne({ _id: player._id, userId: row.userId, playerId: row.playerId,
        'items.4': oldCount, [`moderation.${MARKER}`]: { $exists: false } }, { $set: { 'items.4': receipt.after,
          [`moderation.${MARKER}`]: receipt, updatedAt: new Date() } });
      if (update.matchedCount !== 1) throw Error('PLAYER_STALE_' + row.userId);
      applied.push({ row, receipt });
    }
    fs.writeFileSync(path.join(backupDir, 'players-before.json'), JSON.stringify({ incident: INCIDENT, before }, null, 2), { mode: 0o600 });
    return { applied, beforeCount: before.length };
  } catch (error) {
    for (const item of applied.reverse()) {
      try { await playerCollection(client, item.row.serverId).updateOne({ userId: item.row.userId, playerId: item.row.playerId,
        [`moderation.${MARKER}.incident`]: INCIDENT, 'items.4': item.receipt.after }, { $set: { items: before.find(x => x.row.userId === item.row.userId).beforeItems,
          moderation: before.find(x => x.row.userId === item.row.userId).beforeModeration, updatedAt: new Date() }, $unset: { [`moderation.${MARKER}`]: '' } }); } catch (_) {}
    }
    throw error;
  }
}
async function rollbackPlayers(client) {
  const file = path.join(backupDir, 'players-before.json'); if (!fs.existsSync(file)) return { restored: 0, issues: ['BACKUP_MISSING'] };
  const before = JSON.parse(fs.readFileSync(file, 'utf8')).before || []; const issues = []; let restored = 0;
  for (const item of before) {
    const row = item.row; const result = await playerCollection(client, row.serverId).updateOne({ userId: row.userId, playerId: row.playerId,
      [`moderation.${MARKER}.incident`]: INCIDENT, 'items.4': n(item.beforeCount) - n(row.amount) }, { $set: { items: item.beforeItems,
        moderation: item.beforeModeration, updatedAt: new Date() }, $unset: { [`moderation.${MARKER}`]: '' } });
    if (result.matchedCount === 1) restored++; else issues.push(row.userId);
  }
  return { restored, issues };
}
async function sendMails() {
  const sent = [];
  for (const row of rows) {
    const response = await post(gamePort(row.serverId), '/api/internal/mail/send', mailBody(row));
    if (response.status !== 200 || !response.data?.success) throw Error('NOTICE_MAIL_FAILED_' + row.userId + '_' + (response.data?.error || response.status));
    sent.push({ userId: row.userId, eventKey: mailBody(row).eventKey, idempotent: response.data.idempotent === true });
  }
  return sent;
}
async function deleteMails(client) {
  const keys = rows.map(row => `${INCIDENT}:${row.userId}`); let deleted = 0;
  for (const serverId of [1001, 1002]) { const result = await client.db(`lhs_s${serverId}`).collection('mails').deleteMany({ eventKey: { $in: keys } }); deleted += n(result.deletedCount); }
  return { deleted };
}
async function verify(client) {
  const players = [], accounts = [], mails = [];
  for (const row of rows) {
    const p = await playerCollection(client, row.serverId).findOne({ userId: row.userId }); verifyPlayer(p, row); const rec = marker(p); if (!rec || rec.incident !== INCIDENT || n(p.items?.[4]) !== n(rec.after)) throw Error('RECOVERY_VERIFY_FAILED_' + row.userId);
    players.push({ userId: row.userId, item4: n(p.items?.[4]), recovered: n(rec.amount), marker: INCIDENT });
    const a = await accountCollection(client).findOne({ accountId: row.accountId }); accounts.push({ accountId: row.accountId, status: a.status, banCode: a.banCode || '', banUntil: a.banUntil || null, exempt: row.accountId === 'vanduc97' });
    const mail = await client.db(`lhs_s${row.serverId}`).collection('mails').findOne({ userId: row.userId, eventKey: `${INCIDENT}:${row.userId}` }); mails.push({ userId: row.userId, exists: !!mail });
  }
  for (const row of nonAdminRows) { const a = accounts.find(x => x.accountId === row.accountId); if (n(a.status) > 0 || a.banCode !== CODE) throw Error('BAN_VERIFY_FAILED_' + row.accountId); }
  const admin = accounts.find(x => x.accountId === 'vanduc97'); if (!admin || n(admin.status) <= 0 || admin.banCode === CODE) throw Error('ADMIN_EXCLUSION_FAILED');
  if (mails.some(m => !m.exists)) throw Error('NOTICE_VERIFY_FAILED');
  return { players, accounts, mails };
}

(async () => {
  assert(['preflight','ban','unban','recover','rollback','mail','delete-mails','verify'].includes(action), 'ACTION_INVALID');
  const client = await connect();
  try {
    let result;
    if (action === 'preflight') result = await preflight(client);
    else if (action === 'ban') result = await applyBans(client);
    else if (action === 'unban') result = await rollbackBans();
    else if (action === 'recover') result = await recoverPlayers(client);
    else if (action === 'rollback') result = await rollbackPlayers(client);
    else if (action === 'mail') result = await sendMails();
    else if (action === 'delete-mails') result = await deleteMails(client);
    else result = await verify(client);
    console.log(JSON.stringify({ result: 'PASS', action, incident: INCIDENT, data: result }));
  } catch (error) { console.error(error.stack || String(error)); process.exitCode = 1; }
  finally { await client.close(); }
})();
