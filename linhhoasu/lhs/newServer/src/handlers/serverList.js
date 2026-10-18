const logger = require('../logger');
const accountService = require('../services/AccountService');
const authSessionService = require('../services/AuthSessionService');
const configService = require('../services/ConfigService');
const playerService = require('../services/PlayerService');
const serverConfigService = require('../services/ServerConfigService');
const serverAccessService = require('../services/ServerAccessService');
const accountBanService = require('../services/AccountBanService');
const noticeService = require('../services/NoticeService');

const DEFAULT_REGISTER_PATH = '/register.html';
const DAZHUZAI_LINKAGE = Object.freeze({
  index: 7,
  start: 1788517080000,
  end: 1820053080000,
});

async function listAllServers() {
  return serverConfigService.listAllServers();
}

function selectNewestOpenServer(servers = [], now = Date.now()) {
  // Keep the scheduled newest server visible in the “server mới” banner before
  // its opening time; entry/access gates still enforce SERVER_NOT_OPEN.
  return servers.filter(row => row && Number(row.serverId) > 0 && row.running !== false
    && Number(row.status) > 0)
    .sort((a, b) => Number(b.openTime || 0) - Number(a.openTime || 0)
      || Number(b.serverId) - Number(a.serverId))[0] || null;
}

async function buildNewestServerData(req, now = Date.now()) {
  const latest = selectNewestOpenServer(await listAllServers(), now);
  return latest ? buildServerData(latest.serverId, req, now) : null;
}

async function handleGetLatestServer(_params = {}, req) {
  const now = Date.now();
  const data = await buildNewestServerData(req, now);
  return { ret: 0, serverTime: now, newServerName: data ? data.serverName : '', newServerData: data };
}

async function buildServerData(serverIdInput, req, now = Date.now(), roleSummary = null) {
  const serverId = Number(serverIdInput) || Number(process.env.DEFAULT_SERVER_ID) || 1001;
  const serverCfg = (await serverConfigService.findServerConfig(serverId)) || {};
  const endpoint = buildWsEndpoint(req, serverId);
  const isNew = !!serverCfg.isNew;

  const data = {
    serverId,
    pageId: Number(serverCfg.pageId) || Math.floor(serverId / 1000) || 1,
    pageName: String(serverCfg.pageName || ''),
    serverName: String(serverCfg.serverName || `大区${serverId}`),
    url: endpoint.url,
    host: endpoint.host,
    port: endpoint.port,
    status: normalizeServerStatus(serverCfg.status, 1),
    state: serverAccessService.resolveServerEntryState(serverCfg, now),
    running: serverCfg.running !== false ? 1 : 0,
    openTime: Number(serverCfg.openTime) || (now - 86400000 * (isNew ? 3 : 30)),
    rechargeArea: Number(serverCfg.rechargeArea) || 1,
    isNew: isNew ? 1 : 0,
    isRecommend: serverCfg.isRecommend ? 1 : 0,
  };

  if (roleSummary) {
    data.roleId = roleSummary.roleId;
    data.userId = roleSummary.userId;
    data.playerId = roleSummary.playerId;
    data.roleName = roleSummary.name;
    data.name = roleSummary.name;
    data.level = roleSummary.level;
    data.exp = roleSummary.exp;
    data.lastLoginTime = roleSummary.lastLoginTime;
    data.createTime = roleSummary.createTime;
    data.role = roleSummary;
  }

  return data;
}

function buildRoleCreateOptions() {
  const roleGenderCfg = configService.get('RoleGenderConfig') || {};
  const options = [];
  const seen = new Set();

  Object.keys(roleGenderCfg).forEach((kungfuKey) => {
    const group = roleGenderCfg[kungfuKey];
    if (!group || typeof group !== 'object' || Array.isArray(group)) return;

    Object.keys(group).forEach((subJobKey) => {
      const row = group[subJobKey];
      if (!row || Number(row.ifShow) !== 1) return;

      const kungfuId = Number(row.id) || Number(kungfuKey) || 4;
      const subJob = Number(row.gender);
      const safeSubJob = Number.isFinite(subJob) ? subJob : (Number(subJobKey) || 0);
      const optionKey = `${kungfuId}_${safeSubJob}`;
      if (seen.has(optionKey)) return;
      seen.add(optionKey);

      options.push({
        key: optionKey,
        kungfuId,
        subJob: safeSubJob,
        label: `角色${kungfuId}${safeSubJob === 1 ? '·女' : '·男'}`,
      });
    });
  });

  options.sort((a, b) => {
    if (a.kungfuId === b.kungfuId) return a.subJob - b.subJob;
    return a.kungfuId - b.kungfuId;
  });

  if (options.length > 0) return options;
  return [
    {
      key: '4_0',
      kungfuId: 4,
      subJob: 0,
      label: '默认角色',
    },
  ];
}

function firstHeaderValue(v) {
  if (!v) return '';
  if (Array.isArray(v)) return String(v[0] || '').trim();
  return String(v).split(',')[0].trim();
}

function normalizeHost(rawHost) {
  let host = String(rawHost || '').trim();
  if (!host) return '';
  host = host.replace(/^https?:\/\//i, '');
  host = host.split('/')[0];
  if (host.startsWith('[')) {
    const end = host.indexOf(']');
    if (end !== -1) {
      host = host.slice(1, end);
    }
  } else if (host.includes(':')) {
    host = host.split(':')[0];
  }
  if (host === 'localhost' || host === '::1') {
    return '127.0.0.1';
  }
  return host;
}

function resolvePublicHost(req) {
  const byEnv = normalizeHost(process.env.SERVER_PUBLIC_HOST);
  if (byEnv) return byEnv;

  const forwardedHost = normalizeHost(firstHeaderValue(req && req.headers && req.headers['x-forwarded-host']));
  if (forwardedHost) return forwardedHost;

  const reqHost = normalizeHost((req && req.hostname) || (req && req.headers && req.headers.host));
  if (reqHost) return reqHost;

  const byServerHost = normalizeHost(process.env.SERVER_HOST);
  if (byServerHost) return byServerHost;

  return '127.0.0.1';
}

function resolvePublicWsPort(serverIdInput = 0, req = null) {
  const publicHost = resolvePublicHost(req);
  const forwardedProto = firstHeaderValue(req && req.headers && req.headers['x-forwarded-proto']).toLowerCase();
  // Nginx terminates TLS/HTTP for the domain and proxies to the internal
  // game node. Return the public listener, not the internal WS_PUBLIC_PORT=81,
  // otherwise an HTTPS client is sent to a Cloudflare-unsupported :81 socket.
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(publicHost)) {
    if (forwardedProto === 'https') return 443;
    if (forwardedProto === 'http') return 80;
  }
  const serverId = Number(serverIdInput) || Number(process.env.SERVER_ID) || 0;
  const perServerPort = Number.parseInt(process.env[`WS_PUBLIC_PORT_${serverId}`] || '', 10);
  if (Number.isFinite(perServerPort) && perServerPort > 0) return perServerPort;

  const wsPublicPort = Number.parseInt(process.env.WS_PUBLIC_PORT || '', 10);
  if (Number.isFinite(wsPublicPort) && wsPublicPort > 0) return wsPublicPort;

  const wsPort = Number.parseInt(process.env.WS_PORT || '', 10);
  if (Number.isFinite(wsPort) && wsPort > 0) return wsPort;

  return 9200;
}

function resolvePublicWsPath(serverIdInput = 0) {
  const serverId = Number(serverIdInput) || Number(process.env.SERVER_ID) || 0;
  const perServerPath = String(process.env[`WS_PUBLIC_PATH_${serverId}`] || '').trim();
  if (perServerPath) return perServerPath.startsWith('/') ? perServerPath : `/${perServerPath}`;
  const defaultPath = String(process.env.WS_PUBLIC_PATH || '').trim();
  if (!defaultPath) return '';
  return defaultPath.startsWith('/') ? defaultPath : `/${defaultPath}`;
}

function buildWsEndpoint(req, serverIdInput = 0) {
  const host = resolvePublicHost(req);
  const port = resolvePublicWsPort(serverIdInput, req);
  const path = resolvePublicWsPath(serverIdInput);
  return {
    host,
    port,
    url: `${host}:${port}${path}`,
  };
}

function readTextParam(params = {}, keys = []) {
  for (const key of keys) {
    if (!(key in params)) continue;
    const value = String(params[key] || '').trim();
    if (value) return value;
  }
  return '';
}

function parseServerId(params = {}) {
  return Number(params.serverId) || Number(params.serverid) || Number(process.env.DEFAULT_SERVER_ID) || 1001;
}

function normalizeServerStatus(value, fallback = 1) {
  const status = Number(value);
  if (Number.isFinite(status) && status >= 0) return Math.floor(status);
  const safeFallback = Number(fallback);
  return Number.isFinite(safeFallback) && safeFallback >= 0 ? Math.floor(safeFallback) : 1;
}

function isUserClientValidationEnabled() {
  return String(process.env.USER_CLIENT_VALIDATION_ENABLED || '0') === '1';
}

function isInviteRegistrationRequired() {
  return String(process.env.REQUIRE_INVITE_REGISTER || '0') === '1';
}

function getRegisterUrl(req) {
  const configured = String(process.env.REGISTER_URL || '').trim();
  if (configured) return configured;

  const host = resolvePublicHost(req);
  if (host && !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    return `https://${host}${DEFAULT_REGISTER_PATH}`;
  }
  const safeHost = host.includes(':') ? `[${host}]` : host;
  const port = Number.parseInt(process.env.REGISTER_PUBLIC_PORT || '', 10) || 18081;
  return `http://${safeHost}:${port}${DEFAULT_REGISTER_PATH}`;
}

function buildRoleSummary(role = {}) {
  const player = role && role.__player && typeof role.__player === 'object'
    ? role.__player
    : {};
  return {
    roleId: String(role.roleId || ''),
    userId: String(role.userId || ''),
    playerId: String(player.playerId || role.playerId || ''),
    serverId: Number(role.serverId) || 0,
    serverName: String(player.serverName || role.serverName || ''),
    name: String(player.name || role.name || ''),
    level: Math.max(0, Number(player.level) || Number(role.level) || 0),
    exp: Math.max(0, Number(player.exp) || Number(role.exp) || 0),
    createTime: Number(role.createTime) || Number(player.createTime) || 0,
    lastLoginTime: Number(role.lastLoginTime) || 0,
    roleInfo: player.roleInfo && typeof player.roleInfo === 'object' ? player.roleInfo : {},
  };
}

function buildRolesPayload(roles = [], serverId) {
  const sid = Number(serverId) || 0;
  const list = Array.isArray(roles) ? roles : [];
  const filtered = sid > 0
    ? list.filter((r) => Number(r && r.serverId) === sid)
    : list;
  return filtered.map((role, idx) => {
    const summary = buildRoleSummary(role);
    return {
      ...summary,
      serverId: summary.serverId || sid || 0,
      roleIndex: idx,
    };
  });
}

function attachPlayerToRole(role = {}, player = {}) {
  const enriched = { ...(role && typeof role === 'object' ? role : {}) };
  Object.defineProperty(enriched, '__player', {
    value: player,
    enumerable: false,
    configurable: true,
  });
  return enriched;
}

async function resolvePlayableRoles(accountInput, serverId) {
  const account = accountInput && accountInput.toObject
    ? accountInput.toObject()
    : (accountInput || {});
  const sid = Number(serverId) || 0;
  const roles = Array.isArray(account.roles) ? account.roles : [];
  const sameServerRoles = sid > 0
    ? roles.filter((role) => Number(role && role.serverId) === sid)
    : roles.slice();

  if (sameServerRoles.length <= 0) {
    return {
      playableRoles: [],
      staleRoles: [],
    };
  }

  const probes = await Promise.all(sameServerRoles.map(async (role) => {
    const userId = String(role && role.userId || '').trim();
    const player = userId ? await playerService.loadPlayer(userId) : null;
    return {
      role: player ? attachPlayerToRole(role, player) : role,
      playable: !!player,
    };
  }));

  const playableRoles = [];
  const staleRoles = [];
  probes.forEach((entry) => {
    if (entry.playable) playableRoles.push(entry.role);
    else staleRoles.push(entry.role);
  });

  return {
    playableRoles,
    staleRoles,
  };
}

async function reloadAccountRoleState(accountId) {
  const refreshedAccount = accountId ? await accountService.findAccount(accountId) : null;
  const roleState = await resolvePlayableRoles(refreshedAccount, 0);
  return {
    account: refreshedAccount,
    ...roleState,
  };
}

async function buildRecentLoginServers(roles = [], req, now = Date.now()) {
  const byServer = new Map();
  (Array.isArray(roles) ? roles : []).forEach((role) => {
    const summary = buildRoleSummary(role);
    const serverId = Number(summary.serverId) || 0;
    if (serverId <= 0) return;
    if (!(Number(summary.lastLoginTime) > 0)) return;
    const prev = byServer.get(serverId);
    const prevTime = prev ? Math.max(Number(prev.lastLoginTime) || 0, Number(prev.createTime) || 0) : -1;
    const nextTime = Math.max(Number(summary.lastLoginTime) || 0, Number(summary.createTime) || 0);
    if (!prev || nextTime >= prevTime) byServer.set(serverId, summary);
  });

  const summaries = Array.from(byServer.values()).sort((a, b) => {
    const bTime = Math.max(Number(b.lastLoginTime) || 0, Number(b.createTime) || 0);
    const aTime = Math.max(Number(a.lastLoginTime) || 0, Number(a.createTime) || 0);
    return bTime - aTime;
  });

  return Promise.all(summaries.map((summary) => buildServerData(summary.serverId, req, now, summary)));
}

function recentRolesFromAccount(accountInput) {
  const account = accountInput && accountInput.toObject
    ? accountInput.toObject()
    : (accountInput || {});
  return Array.isArray(account.roles) ? account.roles : [];
}

function uniqueTextList(values = []) {
  const set = new Set();
  const result = [];
  for (const raw of values) {
    const text = String(raw || '').trim();
    if (!text || text === '0' || set.has(text)) continue;
    set.add(text);
    result.push(text);
  }
  return result;
}

function buildLegacyBindCandidates(params = {}, accountId = '', accountInput = {}) {
  const normalizedAccountId = String(accountId || '').trim();
  const account = accountInput && accountInput.toObject
    ? accountInput.toObject()
    : (accountInput || {});
  const hasExistingRoles = Array.isArray(account.roles) && account.roles.length > 0;
  const explicitCandidates = uniqueTextList([
    params.legacyUserId,
    params.bindUserId,
  ]);
  if (hasExistingRoles) return explicitCandidates;

  // Passive platformuid binding can accidentally attach an old archive to a new
  // server selection. Keep it opt-in; explicit legacy/bind ids still work.
  if (String(process.env.ALLOW_PASSIVE_LEGACY_ROLE_BIND || '0') !== '1') {
    return explicitCandidates;
  }

  const passiveCandidates = uniqueTextList([
    params.platformuid,
    params.userId,
  ]).filter((candidate) => candidate !== normalizedAccountId);

  return uniqueTextList([
    ...explicitCandidates,
    ...passiveCandidates,
  ]);
}

async function handleGetServerPages() {
  return {
    ret: 0,
    serverTime: Date.now(),
    pages: await serverConfigService.listServerPages(),
  };
}

async function resolveServerListAccount(params = {}) {
  const sessionToken = readTextParam(params, ['userToken', 'authToken']);
  if (sessionToken) {
    const session = await authSessionService.get(sessionToken);
    if (!session || !session.accountId) return { account: null, ban: null };
    const account = await accountService.findAccount(session.accountId);
    if (!account) return { account: null, ban: null };
    const ban = await accountBanService.resolveAccountBanState(account);
    if (ban.banned) return { account: null, ban, bannedAccount: account };
    const currentAuthVersion = Math.max(1, Number(account.authVersion) || 1);
    if (Number(session.authVersion) !== currentAuthVersion) return { account: null, ban: null };
    return { account, ban: null };
  }
  const accountId = readTextParam(params, ['uid', 'strAccount', 'account', 'openId', 'userName', 'username']);
  const password = readTextParam(params, ['token', 'strPassword', 'password', 'pwd', 'pass']);
  if (!accountId || !password) return { account: null, ban: null };
  const auth = await accountService.authenticateAccountDetailed(accountId, password);
  return { account: auth.account || null, ban: auth.ban || null, bannedAccount: auth.bannedAccount || null, code: auth.code, message: auth.message };
}

async function handleGetServerDetail(params = {}, req) {
  const now = Date.now();
  const pageId = Number(params.pageId) || 1;
  if (pageId === -1) {
    const resolved = await resolveServerListAccount(params);
    if (!resolved.account) {
      return {
        ret: -1,
        serverTime: now,
        servers: [],
        code: resolved.ban ? (resolved.ban.permanent ? 'ACCOUNT_BANNED' : 'ACCOUNT_TEMP_BANNED') : (resolved.code || 'AUTH_FAILED'),
        errInfo: resolved.message || 'Tài khoản hoặc mật khẩu không đúng',
        ban: resolved.ban ? accountBanService.buildBanView(resolved.bannedAccount, resolved.ban) : undefined,
      };
    }

    const account = resolved.account;
    const { playableRoles } = await resolvePlayableRoles(account, 0);
    return {
      ret: 0,
      serverTime: now,
      // Recent roles are account metadata and may live on another server DB.
      servers: await buildRecentLoginServers(recentRolesFromAccount(account), req, now),
    };
  }

  const serverConfigs = await serverConfigService.listServersByPage(pageId);
  const servers = serverConfigs.map((s) => {
    const endpoint = buildWsEndpoint(req, s.serverId);
    return {
      serverId: s.serverId,
      pageId: s.pageId,
      pageName: s.pageName,
      serverName: s.serverName,
      url: endpoint.url,
      host: endpoint.host,
      port: endpoint.port,
      status: normalizeServerStatus(s.status, 1),
      state: serverAccessService.resolveServerEntryState(s, now),
      running: s.running !== false ? 1 : 0,
      openTime: Number(s.openTime) || (now - 86400000 * 30),
      rechargeArea: Number(s.rechargeArea) || 1,
      isNew: s.isNew ? 1 : 0,
      isRecommend: s.isRecommend ? 1 : 0,
    };
  });

  return {
    ret: 0,
    serverTime: now,
    servers,
  };
}

async function handleSDKAuth(params = {}, req) {
  try {
    const now = Date.now();
    const allowAutoRegister = false;
    const explicitServerId = Number(params.serverId || params.serverid) || 0;
    let serverId = parseServerId(params);
    const access = await serverAccessService.resolveServerAccess(serverId, now);
    if (!access.ok) {
      return {
        ret: -1,
        result: -1,
        serverTime: now,
        code: access.code,
        openTime: access.openTime,
        errInfo: 'Server chưa mở',
      };
    }

    const requestedAccountId = readTextParam(params, ['uid', 'strAccount', 'account', 'openId', 'userName']);
    const requestedPassword = readTextParam(params, ['token', 'strPassword', 'password', 'pwd', 'pass']);
    const requestedInviteCode = readTextParam(params, ['inviteCode', 'invite_code', 'invite', 'code']);
    let accountId = requestedAccountId;
    let password = requestedPassword;
    let issuedCredentials = null;

    if (!accountId || !password) {
      return {
        ret: -1,
        serverTime: now,
        errInfo: 'account or password is empty',
      };
    }

    const loginState = await accountService.ensureAccountForLogin(accountId, password, {
      allowAutoRegister,
      inviteCode: requestedInviteCode,
    });
    let account = loginState.account;
    if (!account) {
      return {
        ret: -1,
        serverTime: now,
        code: loginState.code || 'AUTH_FAILED',
        errInfo: loginState.message || 'Tài khoản hoặc mật khẩu không đúng',
        ban: loginState.ban ? accountBanService.buildBanView(null, loginState.ban) : undefined,
      };
    }
    // Account IDs are case-insensitive everywhere. Keep the original input
    // only for password verification, then use the canonical stored value for
    // auth tokens, SDK response `uid` and the following WebSocket handshake.
    accountId = accountService.normalizeAccountId(account.accountId || accountId);

    const legacyCandidates = buildLegacyBindCandidates(params, accountId, account);
    for (const userIdCandidate of legacyCandidates) {
      await accountService.bindLegacyPlayerRole(accountId, {
        password,
        serverId,
        userId: userIdCandidate,
        name: params.firstName,
      });
    }

    account = await accountService.findAccount(accountId);
    let allRoleState = await resolvePlayableRoles(account, 0);
    let playableRoles = allRoleState.playableRoles.filter((role) => Number(role && role.serverId) === serverId);
    const staleRoles = allRoleState.staleRoles.filter((role) => Number(role && role.serverId) === serverId);
    if (staleRoles.length > 0) {
      const staleSummary = staleRoles
        .map((role) => `${String(role && role.roleId || '')}:${String(role && role.userId || '')}`)
        .join(',');
      logger.warn(`[ServerList] skip stale role metadata during sdk auth account=${accountId} serverId=${serverId} stale=${staleSummary}`);
    }

    let selectedRole = accountService.pickRole({
      ...(account && account.toObject ? account.toObject() : (account || {})),
      roles: playableRoles,
    }, {
      serverId,
      roleId: params.roleId,
      roleIndex: params.roleIndex,
      sameServerOnly: true,
    });
    if (!selectedRole) {
      const created = await accountService.createRole(accountId, {
        password,
        serverId,
        name: params.firstName,
        firstName: params.firstName,
        inviteCode: requestedInviteCode,
        reuseExisting: false,
        deferRoleSelection: true,
      }) || {};
      const createdRoleId = created.role && created.role.roleId;
      const refreshed = await reloadAccountRoleState(accountId);
      account = refreshed.account;
      allRoleState = {
        playableRoles: refreshed.playableRoles,
        staleRoles: refreshed.staleRoles,
      };
      playableRoles = allRoleState.playableRoles.filter((role) => Number(role && role.serverId) === serverId);
      selectedRole = playableRoles.find((role) => String(role && role.roleId) === String(createdRoleId))
        || accountService.pickRole({
          ...(account && account.toObject ? account.toObject() : (account || {})),
          roles: playableRoles,
        }, {
          serverId,
          sameServerOnly: true,
        });
    }

    let userId = '';
    let userToken = '';
    let activeRoleId = '';
    if (selectedRole) {
      const tokenPack = await authSessionService.create({
        accountId,
        roleId: selectedRole.roleId,
        userId: selectedRole.userId,
        serverId,
        serverName: selectedRole.serverName || '',
        serverSwitched: false,
        authVersion: Math.max(1, Number(account && account.authVersion) || 1),
        loginTime: now,
      }) || {};
      // SDK authentication precedes server selection; do not overwrite login history here.
      const refreshed = await reloadAccountRoleState(accountId);
      account = refreshed.account;
      allRoleState = {
        playableRoles: refreshed.playableRoles,
        staleRoles: refreshed.staleRoles,
      };
      playableRoles = allRoleState.playableRoles.filter((role) => Number(role && role.serverId) === serverId);
      selectedRole = accountService.pickRole({
        ...(account && account.toObject ? account.toObject() : (account || {})),
        roles: playableRoles,
      }, {
        serverId,
        roleId: params.roleId,
        roleIndex: params.roleIndex,
        sameServerOnly: true,
      }) || selectedRole;

      userId = selectedRole.userId;
      userToken = tokenPack.token || '';
      activeRoleId = selectedRole.roleId;
    }

    const selectedServerData = await buildServerData(serverId, req, now, selectedRole ? buildRoleSummary(selectedRole) : null);
    const roles = buildRolesPayload(playableRoles, serverId);
    const allRoles = buildRolesPayload(allRoleState.playableRoles, 0);
    const recentLoginServers = await buildRecentLoginServers(recentRolesFromAccount(account), req, now);
    const newestServerData = await buildNewestServerData(req, now) || selectedServerData;

    return {
      ret: 0,
      serverTime: now,
      userId,
      userToken,
      userID: userId,
      uid: accountId,
      strAccount: issuedCredentials ? issuedCredentials.accountId : '',
      strPassword: issuedCredentials ? issuedCredentials.password : '',
      unionId: '',
      age: 25,
      onlineTime: 0,
      dayOnlineTime: 0,
      totalInfullNum: 0,
      monthInfullNum: 0,
      cancellation: 0,
      regDate: '2025-01-01',
      activeDate: new Date().toISOString().slice(0, 10),
      newReg: loginState.newlyCreated ? 1 : 0,
      newServerName: newestServerData.serverName,
      isGM: 0,
      zfbShortcut: 0,
      channelId: 1,
      clueToken: '',
      bindPhone: 0,
      exGameAds: '',
      isStreamer: 0,
      defaultServerData: recentLoginServers[0] || selectedServerData,
      newServerData: newestServerData,
      roles,
      allRoles,
      recentLoginServers,
      recentServers: recentLoginServers,
      activeRoleId,
      needCreateRole: selectedRole ? 0 : 1,
      roleCreateOptions: buildRoleCreateOptions(),
      canPlayToday: 1,
      canPlayBeginTime: 0,
      canPlayEndTime: 0,
      noInfull: 0,
      errInfo: '',
    };
  } catch (err) {
    logger.error(`[ServerList] handleSDKAuth failed: ${err && err.stack ? err.stack : (err && err.message ? err.message : err)}`);
    return {
      ret: -1,
      serverTime: Date.now(),
      errInfo: 'server busy',
    };
  }
}

function handleReqParams(params = {}) {
  const keyList = Array.isArray(params.keyList) ? params.keyList.map(String) : [];
  const param = {};

  if (keyList.length === 0 || keyList.includes('linkage')) {
    param.linkage = JSON.stringify(DAZHUZAI_LINKAGE);
  }

  noticeService.populateNoticeParams(param, keyList);

  return {
    ret: 0,
    serverTime: Date.now(),
    param,
    // Kept for older local clients that used the plural response field.
    params: param,
  };
}

async function handleRegisterAccount(params = {}, req) {
  const now = Date.now();
  const accountId = readTextParam(params, ['strAccount', 'account', 'uid', 'openId', 'userName', 'username']);
  const password = readTextParam(params, ['strPassword', 'password', 'pwd', 'token', 'pass']);
  const confirmPassword = readTextParam(params, ['confirmPassword', 'passwordConfirm', 'rePassword', 'repass']);
  const inviteCode = readTextParam(params, ['inviteCode', 'invite_code', 'invite', 'code']);

  if (isInviteRegistrationRequired() && !inviteCode) {
    return {
      ret: -1,
      result: -1,
      serverTime: now,
      code: 'INVITE_CODE_REQUIRED',
      registerUrl: getRegisterUrl(req),
      errInfo: '请通过代理邀请链接注册',
    };
  }

  try {
    const account = inviteCode
      ? await accountService.createRegisteredAccount(
        accountId,
        password,
        confirmPassword || password,
        { inviteCode }
      )
      : await accountService.createRegisteredAccount(
        accountId,
        password,
        confirmPassword || password
      );
    return {
      ret: 0,
      result: 0,
      serverTime: now,
      uid: account.accountId,
      strAccount: account.accountId,
      inviteCode: account.inviteCode || '',
      needCreateRole: 1,
      roleCreateOptions: buildRoleCreateOptions(),
      errInfo: '',
    };
  } catch (err) {
    const code = err && (err.code || err.message);
    const isExists = String(code) === 'ACCOUNT_EXISTS';
    return {
      ret: -1,
      result: -1,
      serverTime: now,
      code: isExists ? 'ACCOUNT_EXISTS' : String(code || 'REGISTER_FAILED'),
      errInfo: isExists ? '账号已存在' : (err.message || '注册失败'),
    };
  }
}

async function handleGetRandomAccount(_params = {}, req) {
  const now = Date.now();
  if (isInviteRegistrationRequired()) {
    return {
      ret: -1,
      serverTime: now,
      code: 'RANDOM_REGISTER_DISABLED',
      registerUrl: getRegisterUrl(req),
      errInfo: '随机注册已关闭，请通过代理邀请链接注册',
    };
  }
  const { accountId, password } = await accountService.createRandomAccount();
  return {
    ret: 0,
    serverTime: now,
    strAccount: accountId,
    strPassword: password,
    errInfo: '',
  };
}

function hasExplicitRoleSelection(params = {}, roleName = '') {
  if (String(roleName || '').trim()) return true;
  const kungfuId = Number(params.kungfuId);
  const subJob = Number(params.subJob);
  return (Number.isFinite(kungfuId) && kungfuId > 0)
    || (Number.isFinite(subJob) && subJob > 0);
}

function buildAccountOnlyRegistrationResponse(account) {
  const accountId = String(account && account.accountId || '').trim();
  return {
    ret: 0,
    result: 0,
    serverTime: Date.now(),
    uid: accountId,
    userID: accountId,
    strAccount: accountId,
    inviteCode: String(account && account.inviteCode || ''),
    roles: [],
    activeRoleId: '',
    needCreateRole: 1,
    roleCreateOptions: buildRoleCreateOptions(),
    errInfo: '',
  };
}

async function handleCreateRoleByAccount(params = {}) {
  const now = Date.now();
  const accountId = readTextParam(params, ['strAccount', 'account', 'uid', 'openId', 'userName']);
  const password = readTextParam(params, ['strPassword', 'password', 'pwd', 'token', 'pass']);
  const serverId = parseServerId(params);
  const roleName = readTextParam(params, ['roleName', 'name', 'firstName']);
  const inviteCode = readTextParam(params, ['inviteCode', 'invite_code', 'invite', 'code']);
  const kungfuId = Number(params.kungfuId);
  const subJob = Number(params.subJob);

  const access = await serverAccessService.resolveServerAccess(serverId, now);
  if (!access.ok) {
    return {
      ret: -1,
      result: -1,
      serverTime: now,
      code: access.code,
      openTime: access.openTime,
      roles: [],
      errInfo: 'Server chưa mở',
    };
  }

  if (!accountId || !password) {
    return {
      ret: -1,
      serverTime: now,
      errInfo: 'account or password is empty',
    };
  }

  try {
    // Native registration uses protocol 2818 to create only the account. The
    // following SDK auth (2820) creates a role placeholder with kungfuId=0 and
    // supplies the auth session; RoleCreateView later confirms tag 3100.
    let existingAccount = await accountService.findAccount(accountId);
    if (!existingAccount) {
      const account = await accountService.createRegisteredAccount(
        accountId,
        password,
        password,
        inviteCode ? { inviteCode } : {}
      );
      return buildAccountOnlyRegistrationResponse(account);
    }
    const authenticated = await accountService.authenticateAccountDetailed(accountId, password);
    if (!authenticated || !authenticated.account) {
      throw new Error('AUTH_FAILED');
    }
    existingAccount = authenticated.account;
    if (!hasExplicitRoleSelection(params, roleName)
      && (!Array.isArray(existingAccount.roles) || existingAccount.roles.length === 0)) {
      return buildAccountOnlyRegistrationResponse(existingAccount);
    }
    const result = await accountService.createRole(accountId, {
      password,
      serverId,
      name: roleName,
      firstName: params.firstName,
      kungfuId,
      subJob,
      inviteCode,
      resetExisting: true,
    });
    return {
      ret: 0,
      serverTime: now,
      result: 0,
      roles: buildRolesPayload(result.roles, serverId),
      activeRoleId: result.role.roleId,
      errInfo: '',
    };
  } catch (err) {
    return {
      ret: -1,
      serverTime: now,
      result: -1,
      roles: [],
      errInfo: err.message || 'create role failed',
    };
  }
}

async function handleManageRoleByAccount(params = {}) {
  const now = Date.now();
  const accountId = readTextParam(params, ['strAccount', 'account', 'uid', 'openId', 'userName']);
  const password = readTextParam(params, ['strPassword', 'password', 'pwd', 'token', 'pass']);
  const serverId = parseServerId(params);
  const roleId = readTextParam(params, ['roleId', 'rid']);
  const roleIndex = Number(params.roleIndex);
  const action = String(params.action || params.op || params.type || '').trim().toLowerCase();
  const deleteRequested = action === 'delete'
    || action === 'remove'
    || action === 'del'
    || action === '1'
    || Number(params.delete) === 1
    || Number(params.del) === 1;

  const access = await serverAccessService.resolveServerAccess(serverId, now);
  if (!access.ok) {
    return {
      ret: -1,
      result: -1,
      serverTime: now,
      code: access.code,
      openTime: access.openTime,
      roles: [],
      errInfo: 'Server chưa mở',
    };
  }

  if (!accountId || !password) {
    return {
      ret: -1,
      serverTime: now,
      result: -1,
      errInfo: 'account or password is empty',
    };
  }

  try {
    if (deleteRequested) {
      const result = await accountService.deleteRole(accountId, {
        password,
        serverId,
        roleId,
        roleIndex,
      });
      return {
        ret: 0,
        serverTime: now,
        result: 0,
        action: 'delete',
        deletedRoleId: result.deletedRoleId,
        roles: buildRolesPayload(result.roles, serverId),
        errInfo: '',
      };
    }

    const result = await accountService.setActiveRole(accountId, {
      password,
      serverId,
      roleId,
      roleIndex,
    });
    return {
      ret: 0,
      serverTime: now,
      result: 0,
      action: 'active',
      activeRoleId: result.activeRoleId,
      roles: buildRolesPayload(result.roles, serverId),
      errInfo: '',
    };
  } catch (err) {
    return {
      ret: -1,
      serverTime: now,
      result: -1,
      roles: [],
      errInfo: err.message || 'role operation failed',
    };
  }
}

function handleMsgSecCheck() {
  return {
    ret: 0,
    result: 0,
    serverTime: Date.now(),
    errInfo: '',
  };
}

function register(httpServer) {
  httpServer.registerHttpHandlers({
    3073: handleGetServerPages,
    3074: handleGetServerDetail,
    3075: handleGetLatestServer,
    2820: handleSDKAuth,
    2565: handleReqParams,
    2566: () => ({ ret: 0, serverTime: Date.now() }),
    2817: handleGetRandomAccount,
    2818: handleCreateRoleByAccount,
    2819: handleManageRoleByAccount,
    2821: handleRegisterAccount,
    2827: () => ({ ret: 0, serverTime: Date.now() }),
    2837: handleMsgSecCheck,
    2945: () => ({ ret: 0, serverTime: Date.now() }),
  });
  logger.info('[ServerList] HTTP handlers registered (2820/3073/3074/2565/2566/2817/2818/2819/2827/2837/2945)');
}

module.exports = {
  selectNewestOpenServer,
  handleGetLatestServer,
  register,
  SERVER_PAGES: serverConfigService.DEFAULT_SERVER_PAGES,
  SERVERS_BY_PAGE: serverConfigService.DEFAULT_SERVERS_BY_PAGE,
  resolvePublicHost,
  resolvePublicWsPort,
  resolvePublicWsPath,
  buildWsEndpoint,
  resolveServerEntryState: serverAccessService.resolveServerEntryState,
  resolveServerAccess: serverAccessService.resolveServerAccess,
  listAllServers,
  handleGetServerPages,
  handleGetServerDetail,
  handleSDKAuth,
  handleReqParams,
  handleGetRandomAccount,
  handleMsgSecCheck,
  handleRegisterAccount,
  handleCreateRoleByAccount,
  handleManageRoleByAccount,
};
