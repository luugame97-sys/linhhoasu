/**
 * 账号登录处理器
 * tag: 1 = 登录
 */

const crypto = require('crypto');
const playerService = require('../services/PlayerService');
const playerMutation = require('../services/PlayerMutationService');
const distClient = require('../services/DistClient');
const rank = require('../services/RankService');
const Session = require('../net/Session');
const logger = require('../logger');
const { buildPlayer500Data } = require('./playerPayload');
const { buildClientItemList } = require('../services/CurrencySync');
const { ensureEquipInfo } = require('../services/EquipService');
const { buildFarmInfoData, ensureFarmInfo } = require('./farm');
const { buildMineInfoData } = require('./mine');
const {
  buildGuildPlayerData,
  buildGuildInitPacket,
  buildGuildRecordInitPacket,
  buildGuildExchangeInitPacket,
  buildGuildHuntingInitPacket,
  buildGuildBattleInitPacket,
} = require('./guild');
const { buildInviteInfoData, buildSubscribeInfoData } = require('./invite');
const { migratePlayerData } = require('../services/PlayerMigrationService');
const { ensureFateInfo } = require('./fate');
const { ensureGemInfo } = require('./gem');
const { ensureValhallaInfo, buildValhallaPayload } = require('./valhalla');
const { ensureBloodlineInfo, buildBloodlinePayload } = require('./bloodline');
const { ensureDungeonRaidInfo } = require('./dungeon');
const { ensureAuctionInfo, buildAuctionPayload } = require('./auction');
const { ensureCuriosInfo, buildCuriosPayload } = require('./curios');
const { ensureTempleInfo, buildTempleAllStatus, buildTempleAllInfo, buildTempleLingyunTimeRecords } = require('./temple');
const { ensureRebornInfo, buildRebornPayload } = require('./reborn');
const { ensureInvestGameInfo, buildInvestGamePayload } = require('./invest-game');
const { ensureGloryInfo, buildGloryPayload } = require('./glory');
const { ensureActivityInfo, buildActivityPayload } = require('./activity');
const { ensureActivity9State } = require('../services/Activity9Service');
const { ensureActivationPassState } = require('../services/ActivationPassService');
const { syncPlayerAfterSettlement: syncActivityCycles } = require('../services/ActivityCycleSchedule');
const { ensureValhallaFormationInfo, buildValhallaFormationPayload } = require('./valhalla-formation');
const { ensurePetSoulInfo, buildPetSoulPayload } = require('./pet-soul');
const { ensureHorseRaceInfo, buildHorseRacePayload } = require('./horse-race');
const { ensureSpecSpiritInfo, buildSpecSpiritPayload } = require('./spec-spirit');
const { ensureHotSpringInfo, buildHotSpringPayload } = require('./hot-spring');
const { ensureBidKingInfo, buildBidKingPayload } = require('./bid-king');
const { ensureDoubleTowerInfo, buildDoubleTowerData } = require('./arena');
const { buildPetTimeRecordPayload, settleFreePetEgg } = require('./pet');
const { ensureTowerInfo } = require('./tower');
const { getTaskPerfSnapshot } = require('../services/TaskPerfService');
const chat = require('./chat');
const mail = require('./mail');
const { checkLevelUp } = require('./raid');
const authSessionService = require('../services/AuthSessionService');
const accountService = require('../services/AccountService');
const preparedNames = require('../services/PreparedNameService');
const { validatePlayerName } = require('../services/PlayerNameService');
const serverConfigService = require('../services/ServerConfigService');
const configService = require('../services/ConfigService');
const serverAccessService = require('../services/ServerAccessService');
const { ensureLaunchWelfareMail } = require('../services/LaunchWelfareService');
const { refreshRealmStageTasks } = require('../services/RealmTaskProgressService');
const { refreshMainTaskProgress } = require('../services/MainTaskProgressService');
const { ensureRoleAppearance } = require('../services/RoleAppearanceService');
const { markNewFeaturesSeen, refreshSystemUnlockInfo } = require('./upgrade');
const { ensureElfInfo } = require('./elf');
const { ensureOldTrekInfo } = require('./old-trek');
const { ensureAlchemyInfo } = require('./alchemy');
const { applyManagedBotProfile } = require('../services/ManagedBotProfileService');

function isManagedBotLogin(params = {}) {
  const token = String(params.botToken || params._botToken || '').trim();
  const configured = String(process.env.BOT_WORKER_TOKEN || '').trim();
  if (!token || !configured || token.length !== configured.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(configured));
  } catch (_err) {
    return false;
  }
}

function ensureLoginBaozi(player = {}) {
  if (!player || typeof player !== 'object') return false;

  if (!player.items || typeof player.items !== 'object' || Array.isArray(player.items)) {
    player.items = {};
  }

  const minBaoziRaw = Number(process.env.LOGIN_BAOZI_MIN || 1000);
  const minBaozi = Number.isFinite(minBaoziRaw) && minBaoziRaw > 0
    ? Math.floor(minBaoziRaw)
    : 1000;

  const currentBaozi = Number(player.items[4]);
  if (!Number.isFinite(currentBaozi) || currentBaozi < minBaozi) {
    player.items[4] = minBaozi;
    return true;
  }
  return false;
}

function settleLoginBoxLevel(player = {}, now = Date.now()) {
  if (!player || typeof player !== 'object') return false;
  const boxInfo = player.boxInfo && typeof player.boxInfo === 'object' && !Array.isArray(player.boxInfo)
    ? player.boxInfo
    : null;
  if (!boxInfo) return false;

  const finishTime = Math.max(0, Number(boxInfo.upgradeFinishTime) || 0);
  if (finishTime <= 0 || finishTime > now) return false;

  boxInfo.level = Math.max(1, Math.floor(Number(boxInfo.level) || 1) + 1);
  boxInfo.exp = 0;
  boxInfo.upgradeFinishTime = 0;
  boxInfo.upgradeStartTime = 0;
  return true;
}

function settleLoginBoxTier(player = {}, now = Date.now()) {
  if (!player || typeof player !== 'object') return false;
  const boxInfo = player.boxInfo && typeof player.boxInfo === 'object' && !Array.isArray(player.boxInfo)
    ? player.boxInfo : null;
  if (!boxInfo) return false;
  const cfgMap = configService.get('BoxTierConfig') || {};
  let tier = Math.max(1, Math.floor(Number(boxInfo.tier) || 1));
  const current = cfgMap[tier] || cfgMap[String(tier)] || {};
  const next = cfgMap[tier + 1] || cfgMap[String(tier + 1)] || null;
  const finish = Math.max(0, Number(boxInfo.tierUpTime) || 0);
  let changed = false;
  if (finish > 0 && finish <= now && next) {
    tier += 1;
    boxInfo.tier = tier;
    boxInfo.tierExp = 0;
    boxInfo.tierUpTime = 0;
    boxInfo.tierUpStartTime = 0;
    changed = true;
  }
  const active = cfgMap[tier] || cfgMap[String(tier)] || current;
  const following = cfgMap[tier + 1] || cfgMap[String(tier + 1)] || null;
  const costs = Array.isArray(active && active.tierUpCost) ? active.tierUpCost : [];
  const exp = Math.max(0, Math.floor(Number(boxInfo.tierExp) || 0));
  if (following && boxInfo.tierUpTime <= 0 && costs.length > 0 && exp >= costs.length) {
    boxInfo.tierUpStartTime = now;
    boxInfo.tierUpTime = now + Math.max(0, Math.floor(Number(active.timeCost) || 0)) * 1000;
    changed = true;
  }
  return changed;
}

function buildLoginItemTimeRecords(player = {}) {
  return {
    ...require('../services/FarmRecoveryService').timeRecords(player),
    ...buildTempleLingyunTimeRecords(player),
    ...buildPetTimeRecordPayload(player),
  };
}

function applyRechargeArea(player = {}, area = 0) {
  const rechargeArea = Number(area);
  if (![1, 2, 3].includes(rechargeArea)) return false;
  player.rechargeInfo = player.rechargeInfo && typeof player.rechargeInfo === 'object' && !Array.isArray(player.rechargeInfo)
    ? player.rechargeInfo
    : {};
  if (Number(player.rechargeInfo.area) === rechargeArea) return false;
  player.rechargeInfo.area = rechargeArea;
  return true;
}

function ensureLoginSpiritMaterials(player = {}) {
  if (!player || typeof player !== 'object') return false;

  if (!player.items || typeof player.items !== 'object' || Array.isArray(player.items)) {
    player.items = {};
  }

  // Items 60/61 are consumable Spirit materials. They are granted only when
  // a player is created or by gameplay/reward flows. Replenishing them on
  // every login made F5 restore spent materials and allowed unlimited
  // upgrades. Keep existing balances untouched; only normalize malformed
  // values so a legacy document cannot expose NaN/negative counts.
  let changed = false;
  [60, 61].forEach((itemId) => {
    const current = Number(player.items[itemId]);
    if (!Number.isFinite(current) || current < 0) {
      player.items[itemId] = 0;
      changed = true;
    }
  });
  return changed;
}

function isForceRoleSelectionOnLogin() {
  return String(process.env.FORCE_ROLE_SELECTION_ON_LOGIN || '0') === '1';
}


/**
 * 处理登录请求 (tag:1)
 * @param {Object} params - 客户端参数
 * @param {Object} session - 会话上下文
 * @returns {Promise<Array>} 登录后批量推送消息列表
 */
async function handleLogin(params, session, msgUid) {
  const userId = params.userid || params.userId || 0;
  const platformuid = String(params.platformuid || '').trim();
  const token = String(params.userToken || params.token || '').trim();
  const managedBot = isManagedBotLogin(params);
  const requestedServerId = Number(params.serverid || params.serverId)
    || Number(process.env.SERVER_ID)
    || Number(process.env.DEFAULT_SERVER_ID)
    || 1001;
  const requestedBotId = String(params.platformuid || params.userid || params.userId || '').trim();
  if (requestedBotId.startsWith('lhs_real_bot_') && !managedBot) {
    throw new Error('BOT_AUTH_INVALID');
  }
  if (managedBot && !requestedBotId.startsWith('lhs_real_bot_')) {
    throw new Error('BOT_ID_INVALID');
  }

  if (!managedBot) {
    const access = await serverAccessService.resolveServerAccess(requestedServerId, Date.now());
    if (!access.ok) {
      const error = new Error('SERVER_NOT_OPEN');
      error.code = access.code;
      error.openTime = access.openTime;
      throw error;
    }
  }

  let authSession = null;
  if (token) {
    const nodeServerId = Number(process.env.SERVER_ID) || requestedServerId;
    if (!managedBot && requestedServerId !== nodeServerId) throw new Error('SERVER_ROUTE_MISMATCH');
    authSession = managedBot ? await authSessionService.get(token)
      : await accountService.resolveServerLoginSession(token, nodeServerId);
  }

  let key = (authSession && authSession.userId)
    ? String(authSession.userId)
    : (platformuid || String(userId || '').trim());

  if (!authSession && platformuid && requestedServerId > 0) {
    key = `${platformuid}_s${requestedServerId}`;
  }

  if (authSession && authSession.accountId && platformuid && platformuid !== key) {
    const rolePlayer = key ? await playerService.loadPlayer(key) : null;
    if (!rolePlayer) {
      const legacyPlayer = await playerService.loadPlayer(platformuid);
      if (legacyPlayer) {
        await accountService.upsertLegacyRole(authSession.accountId, {
          password: process.env.LEGACY_BIND_DEFAULT_PASSWORD || 'legacy_bind',
          serverId: authSession.serverId || Number(params.serverId) || Number(process.env.DEFAULT_SERVER_ID) || 1001,
          userId: platformuid,
          roleId: authSession.roleId || `legacy_${platformuid}`,
          name: legacyPlayer.name,
        });
        if (token) {
          await authSessionService.set(token, {
            ...authSession,
            userId: platformuid,
          });
        }
        key = platformuid;
      }
    }
  }

  if (!key) key = `guest_${Date.now()}`;
  return playerMutation.run(key, async () => {
  await playerService.drainPendingSaves(key);
  session.userId = key;
  session._isBot = managedBot;
  session.accountId = authSession && authSession.accountId;
  session.roleId = authSession && authSession.roleId;

  let player = await playerService.loadPlayer(key);
  // Legacy/no-token entry must respect the same whole-account ban as SDK login.
  if (!managedBot && player) {
    const Account = require('../db/models/Account');
    const owner = player.accountId
      ? await Account.findOne({ accountId: String(player.accountId).trim().toLowerCase() }).lean()
      : await Account.findOne({ 'roles.userId': key }).lean();
    const bans = require('../services/AccountBanService');
    const state = bans.inspectBanState(owner);
    if (state.banned) {
      const message = bans.formatBanMessage(state);
      session.player = null;
      return [
        { tag: 9, msgUid: 0, data: { msg: message } },
        { tag: 1, msgUid, data: { result: -1, code: state.code, msg: message } },
      ];
    }
  }
  const botIdentityChanged = managedBot && (!player || player.isBot !== true);
  let newCreated = false;

  if (!player) {
    if (authSession || token) {
      throw new Error('ROLE_NOT_FOUND');
    }
    const existingAccount = key ? await accountService.findAccount(key) : null;
    if (existingAccount) {
      throw new Error('ROLE_NOT_FOUND');
    }
    const suffix = key.length > 8 ? key.substring(key.length - 8) : key;
    const requestedName = String(params.firstName || '').trim();
    const requestedValidation = validatePlayerName(requestedName);
    if (requestedName && !preparedNames.isDefaultGeneratedName(requestedName, { accountId: key }) && !requestedValidation.ok) {
      const error = new Error(requestedValidation.code);
      error.code = requestedValidation.code;
      throw error;
    }
    const usePreparedName = preparedNames.isDefaultGeneratedName(requestedName, { accountId: key });
    let createError = null;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const name = usePreparedName
        ? preparedNames.resolveNewPlayerName(requestedName, {
          accountId: key,
          serverId: requestedServerId,
          userId: key,
          seed: `${key}:${requestedServerId}`,
        }, attempt)
        : (managedBot
          ? preparedNames.buildManagedBotName(requestedName, attempt)
          : `${requestedValidation.name}${suffix}${attempt > 0 ? `_${attempt + 1}` : ''}`);
      try {
        player = await playerService.createPlayer(key, name || `Player_${suffix}`);
        createError = null;
        break;
      } catch (err) {
        createError = err;
        if (err && err.code === 11000) continue;
        throw err;
      }
    }
    if (!player) throw createError || new Error('CREATE_PLAYER_FAILED');
    player.roleInfo = {
      ...(player.roleInfo && typeof player.roleInfo === 'object' ? player.roleInfo : {}),
      kungfuId: 0,
      subJob: 0,
    };
    newCreated = true;

    // 首次登录且携带邀请码 -> 绑定分销系统
    const inviteCode = params.inviteCode || params.invite_code;
    if (inviteCode) {
      const bindResult = await distClient.bindInvite(player.playerId, inviteCode);
      const nextPlayerState = { inviteCode };
      if (bindResult && bindResult.pendingCompensation) {
        nextPlayerState.distSync = {
          ...(player.distSync && typeof player.distSync === 'object' ? player.distSync : {}),
          bindInvite: {
            status: 'pending',
            lastError: bindResult.error || '',
            updatedAt: Date.now(),
          },
        };
      }
      await playerService.savePlayer(key, nextPlayerState);
      Object.assign(player, nextPlayerState);
    }
  } else {
    logger.info(`[Account] 玩家登录: ${player.name} Lv.${player.level} (${key})`);
  }

  if (managedBot && player) {
    if (player.isBot === false) throw new Error('BOT_ID_CONFLICT');
    player.isBot = true;
    player.botWorker = String(params.botWorkerId || 'phase2').slice(0, 32);
    // Apply a deterministic profile in memory before map/chat payloads are
    // built. Normal bot reward checkpoints/final save persist it gradually,
    // avoiding a 580-write burst during reconnect.
    applyManagedBotProfile(player, key);
  }

  if (authSession && authSession.serverSwitched && player) {
    const resetPlayer = await playerService.resetPlayerForServerSwitch(key, { resetRoleSelection: true });
    if (resetPlayer) player = resetPlayer;
    if (token) {
      await authSessionService.set(token, {
        ...authSession,
        serverSwitched: false,
      });
    }
  }

  const loginServerId = Math.max(
    1,
    Number(authSession && authSession.serverId)
      || requestedServerId
      || Number(player && player.serverId)
      || Number(process.env.SERVER_ID)
      || Number(process.env.DEFAULT_SERVER_ID)
      || 1001
  );
  const serverCfg = await serverConfigService.findServerConfig(loginServerId).catch(() => null);
  const loginServerName = String(
    (serverCfg && serverCfg.serverName)
      || (player && player.serverName)
      || process.env.SERVER_NAME
      || ''
  ).trim();

  session.serverId = loginServerId;
  session.serverName = loginServerName;
  const serverIdentityChanged = !!player && (
    Number(player.serverId) !== loginServerId
    || String(player.serverName || '') !== loginServerName
  );
  if (player) {
    player.serverId = loginServerId;
    player.serverName = loginServerName;
  }

  const migrated = migratePlayerData(player);
  const equipInfoChanged = ensureEquipInfo(player);
  const loginBaoziChanged = ensureLoginBaozi(player);
  const boxLevelSettled = settleLoginBoxLevel(player);
  const boxTierSettled = settleLoginBoxTier(player);
  const freePetEggChanged = settleFreePetEgg(player);
  const loginSpiritMaterialsChanged = ensureLoginSpiritMaterials(player);
  const rawKungfuId = player
    && player.roleInfo
    && Object.prototype.hasOwnProperty.call(player.roleInfo, 'kungfuId')
    ? Number(player.roleInfo.kungfuId)
    : NaN;
  const hasUnselectedRole = Number.isFinite(rawKungfuId) && rawKungfuId <= 0;
  const levelBeforeNormalize = Number(player.level) || 1;
  const expBeforeNormalize = Number(player.exp) || 0;
  checkLevelUp(player);
  const levelAfterNormalize = Number(player.level) || 1;
  const expAfterNormalize = Number(player.exp) || 0;
  const levelNormalized = levelBeforeNormalize !== levelAfterNormalize || expBeforeNormalize !== expAfterNormalize;
  const systemUnlockChanged = await refreshSystemUnlockInfo(player);
  // System availability is an input to side-task normalization. Refresh it
  // before building task state so a fresh role cannot receive a task/guide
  // for a feature whose unlock conditions are not met yet.
  const realmTaskChanged = refreshRealmStageTasks(player);
  const mainTaskChanged = refreshMainTaskProgress(player);
  const forceRoleSelection = isForceRoleSelectionOnLogin();
  const effectiveNewCreated = newCreated || hasUnselectedRole || forceRoleSelection;
  const roleAppearanceChanged = effectiveNewCreated ? false : ensureRoleAppearance(player);

  const rechargeArea = await serverConfigService.getCurrentRechargeArea(loginServerId);
  const rechargeAreaChanged = applyRechargeArea(player, rechargeArea);
  const activity9State = ensureActivity9State(player);
  const activity9Changed = !!(activity9State && activity9State.changed);
  const activationPassState = ensureActivationPassState(player);
  const activationPassChanged = !!(activationPassState && activationPassState.changed);
  const activityCycleState = managedBot ? null : await syncActivityCycles(player);
  const activityCycleChanged = !!(activityCycleState && activityCycleState.changed);
  let launchWelfareChanged = false;
  try {
    launchWelfareChanged = await ensureLaunchWelfareMail(player, key);
  } catch (err) {
    logger.warn(`[Account] 上线福利邮件补发失败 userId=${key}: ${err && err.message ? err.message : err}`);
  }

  const farmOnline = require('../services/RuntimeBus').getWsServer()?.getPlayerForMutation(key);
  const farmOfflineChanged = require('../services/FarmOfflineService').settle(player, Date.now(), !!farmOnline);
  const farmDailySnapshot = JSON.stringify({
    farmDay: player.other_attr_info?.farmGameDay,
    seedRefillDay: player.farmInfo?.seedRefillDay,
    resourceDay: player.farmInfo?.resourceDay,
    foodRestoreTime: player.farmInfo?.foodRestoreTime,
    blocks: player.farmInfo?.blockInfo,
    mouseTired: player.items && player.items[-1],
    driveAwayUsed: player.items && player.items[-2],
    tiredDayKey: player.farmInfo && player.farmInfo.tiredDayKey,
    driveAwayDayKey: player.farmInfo && player.farmInfo.driveAwayDayKey,
  });
  require('../services/FarmDayService').prepare(player);
  ensureFarmInfo(player);
  const farmDailyChanged = farmDailySnapshot !== JSON.stringify({
    farmDay: player.other_attr_info?.farmGameDay,
    seedRefillDay: player.farmInfo?.seedRefillDay,
    resourceDay: player.farmInfo?.resourceDay,
    foodRestoreTime: player.farmInfo?.foodRestoreTime,
    blocks: player.farmInfo?.blockInfo,
    mouseTired: player.items && player.items[-1],
    driveAwayUsed: player.items && player.items[-2],
    tiredDayKey: player.farmInfo && player.farmInfo.tiredDayKey,
    driveAwayDayKey: player.farmInfo && player.farmInfo.driveAwayDayKey,
  });

  if (botIdentityChanged || loginBaoziChanged || boxLevelSettled || boxTierSettled || freePetEggChanged || loginSpiritMaterialsChanged || equipInfoChanged || migrated || levelNormalized || realmTaskChanged || mainTaskChanged || systemUnlockChanged || roleAppearanceChanged || rechargeAreaChanged || activity9Changed || activationPassChanged || activityCycleChanged || launchWelfareChanged || serverIdentityChanged || farmDailyChanged || farmOfflineChanged) {
    const saved = await playerService.savePlayer(key, player);
    if (!saved) throw new Error('LOGIN_STATE_SAVE_NOT_CONFIRMED');
    if (saved) {
      player = saved;
    }
  }

  session.player = player;
  const fishEventState=require('../services/FishingEventSchedule').sync(player);
  const fishEnergyChanged=require('../services/FishingGameplayService').recoverEnergy(player);
  if(fishEventState.changed||fishEnergyChanged){await require('../services/FishingIntegrityService').save(session);}
  session.batchEnabled = params.batchMsgEnabled || false;

  // 创建 Redis 会话 + 在线计数
  const existedSession = await Session.get(key);
  await Session.set(key, {
    wsId: session.wsId,
    serverId: loginServerId,
    serverName: loginServerName,
    isBot: managedBot,
  });
  if (!managedBot && !session._onlineCounted) {
    if (!existedSession) {
      await Session.incrOnline();
    }
    session._onlineCounted = true;
  }

  if (!managedBot && player.playerId && player.arenaScore != null) {
    await rank.updateScore('arena', player.playerId, Math.max(0, Number(player.arenaScore) || 0)).catch((err) => {
      logger.warn(`[Account] arena rank update deferred user=${key}: ${err.message}`);
      player.arenaRankSyncPending = { score: Math.max(0, Number(player.arenaScore) || 0), updatedAt: Date.now() };
      void playerService.savePlayer(key, player, { returnSaved: false }).catch(() => undefined);
    });
  }
  if (!managedBot && player.playerId && player.arenaRankSyncPending) {
    try {
      await rank.updateScore('arena', player.playerId, Math.max(0, Number(player.arenaRankSyncPending.score) || 0));
      delete player.arenaRankSyncPending;
      await playerService.savePlayer(key, player, { returnSaved: false });
    } catch (err) {
      logger.warn(`[Account] arena rank sync pending user=${key}: ${err.message}`);
    }
  }
  if (!managedBot && player.swordInfo && player.swordInfo.maxlayer) {
    await rank.updateScore('tower', player.playerId, player.swordInfo.maxlayer);
  }

  const now = Date.now();
  const effectiveCreateTime = Math.max(
    0,
    Number(player.createTime)
    || (player.createdAt ? new Date(player.createdAt).getTime() : 0)
    || now
  );
  player.createTime = effectiveCreateTime;
  const serverOpenTime = Math.max(0, Number(serverCfg && serverCfg.openTime) || 0);
  const serverRunDay = serverOpenTime > 0
    ? Math.max(1, Math.ceil((now - serverOpenTime) / 86400000))
    : 1;

  const loginBatch = await buildLoginBatch(player, newCreated, session, {
    effectiveNewCreated,
    forceRoleSelection,
    now,
    serverRunDay,
    createTime: effectiveCreateTime,
    loginMsgUid: msgUid,
  });

  const taskPerf = getTaskPerfSnapshot();
  if (taskPerf) {
    logger.info(
      `[Perf][Login] user=${key} playerId=${player.playerId || ''} level=${player.level || 1} `
      + `taskNormalizeMs=${taskPerf.taskNormalizeMs} taskNormalizeCount=${taskPerf.taskNormalizeCount} `
      + `taskPushMs=${taskPerf.taskPushMs} taskPushCount=${taskPerf.taskPushCount} `
      + `taskPushPackets=${taskPerf.taskPushPackets}`
    );
  }

  // The native client may authenticate on S1 then enter S2 with that token.
  // Record the resolved target role only after the login batch was built.
  if (!managedBot) {
    const historyAccountId = (authSession && authSession.accountId)
      || (player && player.accountId)
      || '';
    const accountForHistory = historyAccountId
      ? await accountService.findAccount(historyAccountId)
      : null;
    const historyRole = (accountForHistory && accountForHistory.roles || [])
      .find((role) => String(role.userId) === String(key)
        && Number(role.serverId) === Number(loginServerId));
    if (historyRole) {
      const recorded = await accountService.markRoleLogin(
        historyAccountId, historyRole.roleId, loginServerId
      );
      if (!recorded) throw new Error('LOGIN_HISTORY_SAVE_NOT_CONFIRMED');
    }
  }
  return loginBatch;
  });
}

/**
 * 构建登录后批量推送数据
 */
async function buildLoginBatch(player, newCreated, session, options = {}) {
  const now = Number(options.now) || Date.now();
  const createTime = Math.max(0, Number(options.createTime) || Number(player.createTime) || now);
  const serverRunDay = Math.max(1, Number(options.serverRunDay) || 1);
  const loginMsgUid = Number(options.loginMsgUid) || 1;
  const effectiveNewCreated = options.effectiveNewCreated === true || newCreated === true;
  const forceRoleSelection = options.forceRoleSelection === true;
  const messages = [];
  require('../services/FarmDayService').prepare(player, now);
  ensureAlchemyInfo(player);
  ensureDungeonRaidInfo(player);
  ensureActivityInfo(player);
  const elfInfo = ensureElfInfo(player);
  const oldTrekInfo = ensureOldTrekInfo(player);
  const player500Data = buildPlayer500Data(player, {
    preserveUnselectedRole: effectiveNewCreated,
    forceUnselectedRole: forceRoleSelection,
  });
  const farmInfoData = buildFarmInfoData(player);
  const loginPendingNewFeatures = player500Data
    && player500Data.systemUnlockInfo
    && Array.isArray(player500Data.systemUnlockInfo.pendingNewFeatures)
    ? player500Data.systemUnlockInfo.pendingNewFeatures
    : [];
  const bulkLoginNewFeatureThreshold = Math.max(
    0,
    Number(process.env.LOGIN_PENDING_NEW_FEATURE_BULK_THRESHOLD || 6) || 6
  );
  if (loginPendingNewFeatures.length > bulkLoginNewFeatureThreshold
    && player500Data
    && player500Data.systemUnlockInfo) {
    // Old/high-level accounts can accumulate many unseen unlock popups and freeze the client on login.
    // Keep unlockedSystem intact, but suppress the login-time popup backlog and mark it seen server-side.
    player500Data.systemUnlockInfo.pendingNewFeatures = [];
    logger.info(
      `[Login] suppress bulk pendingNewFeatures count=${loginPendingNewFeatures.length} `
      + `playerId=${player.playerId || ''} level=${player.level || 1}`
    );
  }
  if (loginPendingNewFeatures.length > 0 && session && session.userId) {
    markNewFeaturesSeen(player, loginPendingNewFeatures);
    if (player500Data && player500Data.systemUnlockInfo && player500Data.systemUnlockInfo.settings) {
      player500Data.systemUnlockInfo.settings.seenNewFeatures = (
        player.systemUnlockInfo
        && player.systemUnlockInfo.settings
        && Array.isArray(player.systemUnlockInfo.settings.seenNewFeatures)
      ) ? player.systemUnlockInfo.settings.seenNewFeatures.slice() : [];
    }
    const saved = await playerService.savePlayer(session.userId, player, { returnSaved: false });
    if (saved) player = saved;
  }
  const fateInfo = ensureFateInfo(player);
  const gemInfo = ensureGemInfo(player);
  const valhallaInfo = ensureValhallaInfo(player);
  const valhallaFormationInfo = ensureValhallaFormationInfo(player);
  const petSoulInfo = ensurePetSoulInfo(player);
  const horseRaceInfo = ensureHorseRaceInfo(player);
  ensureSpecSpiritInfo(player);
  ensureHotSpringInfo(player);
  ensureBidKingInfo(player);
  const doubleTowerInfo = ensureDoubleTowerInfo(player);
  const bloodlineInfo = ensureBloodlineInfo(player);
  const curiosInfo = ensureCuriosInfo(player);
  const templeInfo = ensureTempleInfo(player);
  const templeAllStatus = buildTempleAllStatus(templeInfo, player);
  const templeAllInfo = buildTempleAllInfo(templeInfo, player);
  const rebornInfo = ensureRebornInfo(player);
  const investGameInfo = ensureInvestGameInfo(player);
  const gloryInfo = ensureGloryInfo(player);
  const activityInfo = ensureActivityInfo(player);
  const orbInfo = (player500Data.artifactInfo && player500Data.artifactInfo.orbInfo) || {};
  const orbInfoData = {
    maxLevel: Number(orbInfo.maxLevel) || 0,
    orbData: Array.isArray(orbInfo.orbData) ? orbInfo.orbData : [],
    slotData: Array.isArray(orbInfo.slotData) ? orbInfo.slotData : [],
    summonLevel: Number(orbInfo.summonLevel) || 1,
    maxSlotLevel: Number(orbInfo.maxSlotLevel) || 0,
    orbDataMap: (orbInfo.orbDataMap && typeof orbInfo.orbDataMap === 'object') ? orbInfo.orbDataMap : {},
  };

  // 1. 登录结果 (tag:1)
  messages.push({
    tag: 1, msgUid: loginMsgUid,
    data: {
      result: 0, playerId: player.playerId,
      newCreated: effectiveNewCreated,
      createTime, name: player.name, level: player.level,
    },
  });

  // 2. 服务器时间 (tag:6)
  messages.push({
    tag: 6,
    data: { timeMS: now, serverRunDay },
  });

  // 3. 需要先初始化会被主界面立即读取的玩法数据，再推 tag:500。
  messages.push({ tag: 6400, data: orbInfoData });
  messages.push({ tag: 6000, data: elfInfo });
  messages.push({ tag: 6700, data: player500Data.homelandInfo });
  messages.push({ tag: 7000, data: oldTrekInfo });
  messages.push({ tag: 3610, data: buildSpecSpiritPayload(player) });
  messages.push({ tag: 7100, data: buildHotSpringPayload(player) });
  messages.push({ tag: 7300, data: buildBidKingPayload(player) });

  logger.info(
    `[DEBUG] tag:500 roleInfo.kungfuId=${player500Data.roleInfo.kungfuId}`
    + ` fishFetters=${player500Data.fishInfo.fetters.length}`
    + ` shopPack=${player500Data.shopInfo.pack.length}`
    + ` orbSlotData=${player500Data.artifactInfo.orbInfo.slotData.length}`
  );
  const player500Message = {
    tag: 500,
    data: player500Data,
  };

  // 4-5. 世界聊天 / 系统聊天 (tag:1600)
  messages.push(chat.buildChatInitPacket(0));
  messages.push(chat.buildChatInitPacket(1));

  // 6. 物品信息 (tag:1201)
  const itemList = buildClientItemList(player);
  const { buildUseRecordsPayload } = require('./item');
  messages.push({
    tag: 1201,
    data: {
      items: itemList,
      useRecords: buildUseRecordsPayload(player),
      timeRecords: buildLoginItemTimeRecords(player),
    },
  });

  // 7. 邮件初始化 (tag:1100)
  messages.push(await mail.handleMailInit({}, session, 0));

  // 8. 竞技场 (tag:2600)
  messages.push({
    tag: 2600,
    data: {
      score: player.arenaScore || 1000, rank: 999, challengelist: [],
      refreshtime: 0, loglist: [], dailyCount: 0, maxCount: 10,
    },
  });

  // 9. 仙盟初始化 - 顺序参考线上抓包
  const guildInitPackets = [
    await buildGuildInitPacket(player, 0),
    await buildGuildRecordInitPacket(player, 0),
    await buildGuildExchangeInitPacket(player, 0),
    await buildGuildHuntingInitPacket(player, 0),
    await buildGuildBattleInitPacket(player, 0),
    { tag: 1504, data: buildGuildPlayerData(player) },
  ].filter(Boolean);
  messages.push(...guildInitPackets);

  // 10. 活动初始化 (tag:1700)
  messages.push({ tag: 1700, data: buildActivityPayload(activityInfo) });

  messages.push(player500Message);

  // 11. 特权 (tag:1212) 必须在 tag:500 后，客户端此时才有 rechargeInfo。
  messages.push({ tag: 1212, data: { type: 12, endTime: 0 } });
  messages.push({ tag: 1212, data: { type: 25, endTime: 0 } });

  // 13. 农场 (tag:2400)
  messages.push({
    tag: 2400,
    data: farmInfoData,
  });

  // 14. 矿洞 (tag:2800)
  messages.push({
    tag: 2800,
    data: buildMineInfoData(player),
  });

  // 15. 技能 (tag:3700)
  const towerInfo = ensureTowerInfo(player);
  messages.push({
    tag: 3700,
    data: {
      maxlayer: towerInfo.maxlayer,
      curlayer: towerInfo.curlayer,
      slotlist: towerInfo.slotlist,
      skills: towerInfo.skills,
      skillCount: towerInfo.skillCount,
      autoSelect: towerInfo.autoSelect,
      autoPriority: towerInfo.autoPriority,
    },
  });

  // 16. 命运 (tag:3800)
  messages.push({
    tag: 3800,
    data: {
      id: fateInfo.id,
      nowPlanId: fateInfo.id,
      planInfoMap: fateInfo.planInfoMap,
      planInfo: fateInfo.planInfoMap[String(fateInfo.id)] || { skills: [] },
    },
  });

  // 17. 宝石 (tag:3900)
  messages.push({
    tag: 3900,
    data: {
      equippedId: 0,
      plan: gemInfo.plan,
      gems: gemInfo.gems,
      exchangeTimes: gemInfo.exchangeTimes,
      fieldCount: gemInfo.fieldCount,
    },
  });

  // 19. 英灵殿 (tag:4100)
  messages.push({
    tag: 4100,
    data: buildValhallaPayload(valhallaInfo),
  });

  // 20. 双人塔 (tag:4500)
  messages.push({
    tag: 4500,
    data: buildDoubleTowerData(doubleTowerInfo),
  });

  // 21. 血脉 (tag:4701)
  messages.push({ tag: 4701, data: buildBloodlinePayload(bloodlineInfo) });

  // 22. 拍卖行 (tag:5100)
  messages.push({ tag: 5100, data: buildAuctionPayload(ensureAuctionInfo(player)) });

  // 23. 特权 (tag:1212)
  messages.push({ tag: 1212, data: { type: 22, endTime: 0 } });

  // 24. 奇物 (tag:5200)
  messages.push({
    tag: 5200,
    data: buildCuriosPayload(curiosInfo),
  });

  // 25. 神殿阶段 (tag:5451)
  messages.push({ tag: 5451, data: { allStatus: templeAllStatus } });

  // 26. 神殿信息 (tag:5453)
  messages.push({ tag: 5453, data: { allInfo: templeAllInfo } });

  // 27. 转生 (tag:5500)
  messages.push({
    tag: 5500,
    data: buildRebornPayload(rebornInfo),
  });

  // 28. 投资游戏 (tag:5600)
  messages.push({ tag: 5600, data: buildInvestGamePayload(investGameInfo) });

  // 29. 邀请信息 (tag:11001)
  messages.push({
    tag: 11001,
    data: buildInviteInfoData(player),
  });

  // 30. 问卷 (tag:11011)
  messages.push({ tag: 11011, data: { info: {} } });

  // 31. 订阅 (tag:11100)
  messages.push({ tag: 11100, data: buildSubscribeInfoData(player) });

  // 32. 荣耀 (tag:6600)
  messages.push({ tag: 6600, data: buildGloryPayload(gloryInfo, player) });

  // 33. 赛马 (tag:7200)
  messages.push({
    tag: 7200,
    data: buildHorseRacePayload(horseRaceInfo),
  });

  // 34. 额外系统初始化 - 当前抓包未覆盖的补充包体
  messages.push({
    tag: 6800,
    data: buildValhallaFormationPayload(valhallaFormationInfo),
  });
  messages.push({
    tag: 6900,
    data: buildPetSoulPayload(petSoulInfo),
  });

  // 35. 魔灵入侵 (tag:6500)
  const { ensureCrossRivalInfo } = require('./cross-rival');
  const crossRivalInfo = ensureCrossRivalInfo(player);
  messages.push({
    tag: 6500,
    data: {
      matchId: crossRivalInfo.matchId || 0,
      stage: crossRivalInfo.stage || 0,
      camp: crossRivalInfo.camp || -1,
      line: crossRivalInfo.line || 0,
      lineCount: crossRivalInfo.lineCount || 1,
      endTime: crossRivalInfo.endTime || 0,
      score: crossRivalInfo.coreScore || 0,
      defKill: crossRivalInfo.defKill || 0,
      campInfoMap: crossRivalInfo.campInfoMap || {},
      taskRecord: Array.isArray(crossRivalInfo.taskRecord) ? crossRivalInfo.taskRecord : [],
      taskProgress: crossRivalInfo.taskProgress || {},
      chats: Array.isArray(crossRivalInfo.chatList) ? crossRivalInfo.chatList : [],
    },
  });

  messages.push(require('../services/FarmDayService').packet(player));
  return messages;
}

module.exports = {
  handleLogin,
  _debug: { isManagedBotLogin },
};
