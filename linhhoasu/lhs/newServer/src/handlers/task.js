/**
 * Task/chat/rename handlers.
 * tag: 1000 claim/update task, 1601 chat, 21 rename.
 */

const config = require('../services/ConfigService');
const playerService = require('../services/PlayerService');
const { addRewardToPlayer, checkLevelUp } = require('./raid');
const { refreshSystemUnlockInfo } = require('./upgrade');
const { refreshRealmStageTasks } = require('../services/RealmTaskProgressService');
const { refreshMainTaskProgress, getMainTaskCurrentProgress } = require('../services/MainTaskProgressService');
const { buildRewardItemSync } = require('../services/RewardSync');
const chat = require('./chat');
const logger = require('../logger');
const { nowNs, recordTaskPushNs } = require('../services/TaskPerfService');
const { validatePlayerName, isNameTaken, syncAccountRoleName } = require('../services/PlayerNameService');
const {
  buildActivationPassUpdatePacket,
  ensureActivationPassState,
} = require('../services/ActivationPassService');

function getRenameCost() {
  const constCfg = config.get('ConstConfig') || {};
  const raw = constCfg.changeNameCost || {};
  return {
    id: Math.max(0, toSafeInt(raw.id, 0)),
    count: Math.max(0, toSafeInt(raw.count, 0)),
  };
}

function getItemCount(player, itemId) {
  return Math.max(0, toSafeInt(player && player.items && player.items[itemId], 0));
}

function normalizeTaskInfoSafe(taskInfo = {}, roleInfo = {}, player = {}) {
  try {
    // Lazy require avoids task -> playerPayload -> artifact/raid -> task cycles
    // leaving normalizeTaskInfo undefined during login bootstrap.
    // eslint-disable-next-line global-require
    const mod = require('./playerPayload');
    if (mod && typeof mod.normalizeTaskInfo === 'function') {
      return mod.normalizeTaskInfo(taskInfo, roleInfo, player);
    }
  } catch (_err) {}
  return taskInfo;
}

function normalizeRaidInfoSafe(player = {}) {
  try {
    // eslint-disable-next-line global-require
    const mod = require('./playerPayload');
    if (mod && typeof mod.ensureRaidInfo === 'function') {
      return mod.ensureRaidInfo(player);
    }
  } catch (_err) {}
  return player && player.raidInfo ? player.raidInfo : {};
}

function toSafeInt(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.floor(num) : fallback;
}

function getTaskCfgMap() {
  return config.get('TaskConfig') || {};
}

function getTaskCfg(taskId) {
  const taskCfg = getTaskCfgMap();
  return taskCfg[taskId] || taskCfg[String(taskId)] || null;
}

function buildRewardInfo(items = []) {
  return {
    items: items
      .map((row) => ({
        id: Math.max(0, toSafeInt(row && row.id, 0)),
        count: Math.max(0, toSafeInt(row && row.count, 0)),
      }))
      .filter((row) => row.id > 0 && row.count > 0),
    equips: [],
    heros: [],
    swords: [],
    pets: [],
    artifacts: [],
    gems: [],
    valhalla: [],
    bloodline: [],
    fashion: [],
    elves: [],
    sailor: [],
    extraReward: {},
  };
}

function isMainTaskRewardContext(task = {}, taskState = null) {
  const taskType = toSafeInt(task && task.type, 0);
  const stateType = toSafeInt(taskState && taskState.type, 0);
  const taskId = toSafeInt(task && task.id, 0);
  return taskType === 1 || stateType === 1 || (taskId >= 10000 && taskId < 20000);
}

function shouldSkipTaskReward(task = {}, reward = {}, taskState = null) {
  const rewardId = toSafeInt(reward && reward.id, 0);
  return isMainTaskRewardContext(task, taskState) && rewardId === 3;
}

function buildTaskRewardSync(player = {}, items = []) {
  return buildRewardItemSync(player, buildRewardInfo(items).items);
}

function hasExpReward(items = []) {
  return Array.isArray(items) && items.some((row) => toSafeInt(row && row.id, 0) === 3 && toSafeInt(row && row.count, 0) > 0);
}

function syncActivationPassAfterTaskRewards(player = {}, rewards = []) {
  if (!Array.isArray(rewards) || !rewards.some((row) => toSafeInt(row && row.id, 0) === 19)) {
    return null;
  }
  return buildActivationPassUpdatePacket(ensureActivationPassState(player));
}

function ensureTaskInfo(taskInfo = {}) {
  if (!taskInfo.tasks || typeof taskInfo.tasks !== 'object' || Array.isArray(taskInfo.tasks)) {
    taskInfo.tasks = {};
  }
  if (!taskInfo.tasksMap || typeof taskInfo.tasksMap !== 'object' || Array.isArray(taskInfo.tasksMap)) {
    taskInfo.tasksMap = {};
  }
  return taskInfo;
}

function upsertTaskState(taskInfo, taskId, patch = {}) {
  const cfg = getTaskCfg(taskId);
  if (!cfg) return null;

  const info = ensureTaskInfo(taskInfo);
  const taskKey = String(taskId);
  const prev = info.tasks[taskKey] || {};
  const type = toSafeInt(
    patch.type != null ? patch.type : (prev.type != null ? prev.type : cfg.type),
    toSafeInt(cfg.type, 0),
  );
  const target = Math.max(0, toSafeInt(
    patch.target != null ? patch.target : (prev.target != null ? prev.target : cfg.taskValue1),
    0,
  ));
  let progress = Math.max(0, toSafeInt(
    patch.progress != null ? patch.progress : prev.progress,
    0,
  ));
  const status = toSafeInt(
    patch.status != null ? patch.status : prev.status,
    10,
  );
  if (status >= 20 && target > 0 && progress < target) {
    progress = target;
  }

  const nextState = {
    id: taskId,
    type,
    status,
    progress,
    target,
    ...((patch.progressBase != null || prev.progressBase != null)
      ? { progressBase: Math.max(0, toSafeInt(patch.progressBase != null ? patch.progressBase : prev.progressBase, 0)) }
      : {}),
  };
  info.tasks[taskKey] = nextState;

  const typeKey = String(type);
  const list = Array.isArray(info.tasksMap[typeKey]) ? info.tasksMap[typeKey] : [];
  const existingIndex = list.findIndex((row) => toSafeInt(row && row.id, 0) === taskId);
  if (existingIndex >= 0) {
    list[existingIndex] = nextState;
  } else {
    list.push(nextState);
  }
  list.sort((a, b) => toSafeInt(a && a.id, 0) - toSafeInt(b && b.id, 0));
  info.tasksMap[typeKey] = list;
  return nextState;
}

function buildInitialUnlockedTaskState(player, nextId, nextCfg) {
  const target = Math.max(0, toSafeInt(nextCfg && nextCfg.taskValue1, 0));
  const progressValue = nextCfg ? getMainTaskCurrentProgress(nextCfg, player || {}) : null;
  const activeId = toSafeInt(nextCfg && nextCfg.activeId, 0);
  const resetFromCurrent = activeId === 1 || activeId === 3 || activeId === 4;
  const progress = resetFromCurrent ? 0 : (progressValue == null
    ? 0
    : Math.max(0, toSafeInt(progressValue, 0)));

  return {
    id: nextId,
    type: nextCfg.type,
    status: target > 0 && progress >= target ? 20 : 10,
    progress,
    target,
    ...(resetFromCurrent ? { progressBase: Math.max(0, toSafeInt(progressValue, 0)) } : {}),
  };
}

function unlockNextTask(player, taskId) {
  const cfg = getTaskCfg(taskId);
  if (!cfg) return null;
  let nextId = toSafeInt(cfg.nextId, 0);
  let nextCfg = getTaskCfg(nextId);
  const SKIP_TASK_IDS = new Set();
  while (nextId > 0 && nextCfg && SKIP_TASK_IDS.has(nextId)) {
    nextId = toSafeInt(nextCfg.nextId, 0);
    nextCfg = getTaskCfg(nextId);
  }
  if (nextId <= 0 || !nextCfg) return null;

  const info = ensureTaskInfo(player && player.taskInfo ? player.taskInfo : player);
  if (info.tasks[String(nextId)]) {
    return info.tasks[String(nextId)];
  }
  if (toSafeInt(nextCfg.type, 0) === 9) {
    return require('../services/SideTaskProgressService').createState(player, nextCfg);
  }
  return upsertTaskState(info, nextId, buildInitialUnlockedTaskState(player, nextId, nextCfg));
}

function claimTaskRewards(player, taskIds = []) {
  player.taskInfo = normalizeTaskInfoSafe(player.taskInfo || {}, player.roleInfo || {}, player);
  ensureTaskInfo(player.taskInfo);

  const claimedIds = [];
  const unlockedTaskIds = [];
  const rewardRows = [];
  const rewardGems = [];
  const seen = new Set();
  let unlockedNextTask = false;

  taskIds.forEach((rawId) => {
    const taskId = toSafeInt(rawId, 0);
    if (taskId <= 0 || seen.has(taskId)) return;
    seen.add(taskId);

    const task = getTaskCfg(taskId);
    if (!task) return;

    const taskKey = String(taskId);
    const taskState = player.taskInfo.tasks[taskKey] || null;
    if (taskState && (taskState.status === 2 || taskState.status === 30)) {
      return;
    }
    // Side tasks are explicitly seeded by their feature root and can only be
    // claimed after the native action marks them complete.  Do not let a
    // forged/missing id grant the chain reward or create its successor.
    if (toSafeInt(task.type, 0) === 9
      && (!taskState || toSafeInt(taskState.status, 0) !== 20)) {
      return;
    }
    // Early auto-delegate unlock must follow a completed first task claim,
    // not an arbitrary request for an unfinished/missing first task.
    if (taskId === 10001 && (!taskState || toSafeInt(taskState.status, 0) !== 20)) return;

    const rewards = Array.isArray(task.reward) ? task.reward : [];
    rewards.forEach((row) => {
      const reward = {
        id: toSafeInt(row && row.id, 0),
        count: Math.max(0, toSafeInt(row && row.count, 0)),
      };
      if (shouldSkipTaskReward(task, reward, taskState)) return;
      if (reward.id <= 0 || reward.count <= 0) return;
      // Synthetic gem IDs are reward instructions, not usable bag items.
      // Preserve the existing handling of all other task rewards.
      const rewardGrant = require('../services/RewardGrantService');
      if (rewardGrant.getRewardKind(reward.id) === 'gemPack') {
        const granted = rewardGrant.grantRewardRow(player, reward);
        rewardGems.push(...granted.rewardGems);
      } else {
        addRewardToPlayer(player, reward.id, reward.count);
        rewardRows.push(reward);
      }
    });

    upsertTaskState(player.taskInfo, taskId, {
      id: taskId,
      type: task.type,
      status: 30,
      progress: task.taskValue1,
      target: task.taskValue1,
    });
    const nextTaskState = unlockNextTask(player, taskId);
    if (nextTaskState) unlockedNextTask = true;
    if (nextTaskState && toSafeInt(nextTaskState.id, 0) > 0) {
      unlockedTaskIds.push(toSafeInt(nextTaskState.id, 0));
    }
    claimedIds.push(taskId);
  });

  refreshMainTaskProgress(player);
  player.taskInfo = normalizeTaskInfoSafe(player.taskInfo, player.roleInfo || {}, player);
  return { claimedIds, unlockedTaskIds, rewardRows, rewardGems, unlockedNextTask };
}

async function persistGemTaskClaim(session, player) {
  try {
    const saved = await playerService.savePlayer(session.userId, player, { returnSaved: false });
    if (!saved) throw new Error('TASK_GEM_SAVE_NOT_CONFIRMED');
  } catch (error) {
    session.player = null;
    throw error;
  }
}

function gemTaskSyncPackets(player, rewardGems) {
  if (!rewardGems.length) return [];
  return require('../services/RewardGrantService').buildNativeSyncPackets(player, { gems: rewardGems });
}

// Legacy task list compatibility. Current client uses tag:1000 task updates;
// tag:1800 belongs to fashion data and must not carry task payloads.
async function handleGetTasks(_params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 1000, msgUid, data: { result: -1 } };

  player.taskInfo = normalizeTaskInfoSafe(player.taskInfo || {}, player.roleInfo || {}, player);
  const mainTaskChanged = !!refreshMainTaskProgress(player);
  const realmTaskChanged = !!refreshRealmStageTasks(player);
  const sideTaskChanged = !!require('../services/SideTaskProgressService').reconcile(player);
  if ((mainTaskChanged || realmTaskChanged || sideTaskChanged) && session.userId) {
    const saved = await playerService.savePlayer(session.userId, player, { returnSaved: false });
    if (saved && typeof saved === 'object') {
      session.player = saved;
    }
  }
  const packets = buildActiveTaskUpdatePackets(player, msgUid, { includeAllTypes: true });
  if (packets.length > 0) return packets;
  return { tag: 1000, msgUid, data: { result: 0 } };
}

function buildTaskSyncResponse(player, msgUid = 0) {
  const normalizedTaskInfo = normalizeTaskInfoSafe(
    (player && player.taskInfo) || {},
    (player && player.roleInfo) || {},
    player || {}
  );
  return {
    tag: 1000,
    msgUid,
    data: {
      ...normalizedTaskInfo,
      raidInfo: normalizeRaidInfoSafe(player || {}),
    },
  };
}

function buildActiveTaskUpdatePackets(player, msgUid = 0, options = {}) {
  const perfStartNs = nowNs();
  const normalizedTaskInfo = normalizeTaskInfoSafe(
    (player && player.taskInfo) || {},
    (player && player.roleInfo) || {},
    player || {}
  );
  const tasksMap = normalizedTaskInfo && typeof normalizedTaskInfo.tasksMap === 'object' && !Array.isArray(normalizedTaskInfo.tasksMap)
    ? normalizedTaskInfo.tasksMap
    : {};
  const packets = [];
  const includeTaskTypes = Array.isArray(options.includeTaskTypes)
    ? new Set(options.includeTaskTypes.map((type) => toSafeInt(type, 0)).filter((type) => type > 0))
    : null;

  const queued = [];

  Object.keys(tasksMap).forEach((typeKey) => {
    const list = Array.isArray(tasksMap[typeKey]) ? tasksMap[typeKey] : [];
    list.forEach((task) => {
      const taskId = Math.max(0, toSafeInt(task && task.id, 0));
      if (taskId <= 0) return;
      const status = toSafeInt(task && task.status, 0);
      if (status !== 10 && status !== 20) return;
      const taskType = toSafeInt(task && task.type, 0);
      if (!options.includeAllTypes && includeTaskTypes && !includeTaskTypes.has(taskType)) return;
      if (!options.includeAllTypes && !includeTaskTypes && taskType !== 1) return;
      const priority = (status === 10 || status === 20) ? 0 : 1;
      queued.push({
        priority,
        taskId,
        tag: 1000,
        msgUid,
        data: {
          task: { ...(task || {}) },
        },
      });
    });
  });

  queued
    .sort((a, b) => (a.priority - b.priority) || (a.taskId - b.taskId))
    .forEach((packet) => packets.push({ tag: packet.tag, msgUid: packet.msgUid, data: packet.data }));

  recordTaskPushNs(nowNs() - perfStartNs, 'active', packets.length);
  return packets;
}

function buildTaskUpdatePacketsByIds(player, taskIds = [], msgUid = 0) {
  const perfStartNs = nowNs();
  const normalizedTaskInfo = normalizeTaskInfoSafe(
    (player && player.taskInfo) || {},
    (player && player.roleInfo) || {},
    player || {}
  );
  const tasks = normalizedTaskInfo && typeof normalizedTaskInfo.tasks === 'object' && !Array.isArray(normalizedTaskInfo.tasks)
    ? normalizedTaskInfo.tasks
    : {};
  const seen = new Set();

  const packets = taskIds.reduce((packets, rawId) => {
    const taskId = Math.max(0, toSafeInt(rawId, 0));
    if (taskId <= 0 || seen.has(taskId)) return packets;
    seen.add(taskId);

    const task = tasks[String(taskId)] || tasks[taskId];
    if (!task || typeof task !== 'object') return packets;
    packets.push({
      tag: 1000,
      msgUid,
      data: {
        task: { ...task },
      },
    });
    return packets;
  }, []);

  recordTaskPushNs(nowNs() - perfStartNs, 'byIds', packets.length);
  return packets;
}

function buildClaimTaskUpdatePackets(player, claimedIds = [], unlockedTaskIds = [], msgUid = 0) {
  return [
    ...buildTaskUpdatePacketsByIds(player, claimedIds, msgUid),
    ...buildTaskUpdatePacketsByIds(player, unlockedTaskIds, msgUid),
  ];
}

function buildTaskSnapshot(player) {
  const taskSync = buildTaskSyncResponse(player);
  return taskSync && taskSync.data ? taskSync.data : { tasks: {}, tasksMap: {}, raidInfo: {} };
}

// claim task reward (client expects tag:1000 response)
async function handleClaimTaskReward(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 1000, msgUid, data: { result: -1, ids: [], rewardInfo: buildRewardInfo([]) } };
  const fishTasks=await require('../services/FishingEventService').claimTasks(params,session,msgUid);if(fishTasks)return fishTasks;

  const taskId = Number(params.taskId || params.id || 0);
  const task = getTaskCfg(taskId);
  if (!taskId || !task) return { tag: 1000, msgUid, data: { result: -1, ids: [], rewardInfo: buildRewardInfo([]), msg: 'invalid task' } };

  const { claimedIds, unlockedTaskIds, rewardRows, rewardGems, unlockedNextTask } = claimTaskRewards(player, [taskId]);
  if (unlockedNextTask) {
    await refreshSystemUnlockInfo(player);
  }
  require('../services/SideTaskProgressService').reconcile(player);
  if (claimedIds.length <= 0) {
    return { tag: 1000, msgUid, data: { result: -1, ids: [], rewardInfo: buildRewardInfo([]), msg: 'already claimed' } };
  }

  if (hasExpReward(rewardRows)) {
    checkLevelUp(player);
  }
  refreshMainTaskProgress(player);
  refreshRealmStageTasks(player);
  const activationPassPacket = syncActivationPassAfterTaskRewards(player, rewardRows);
  if (claimedIds.some((id) => toSafeInt(getTaskCfg(id)?.type, 0) === 9)) {
    await require('../services/FeatureMutationService').save(session, player);
  } else if (rewardGems.length || claimedIds.includes(10001)) await persistGemTaskClaim(session, player);
  else playerService.savePlayer(session.userId, player).catch((err) => {
    logger.warn(`[Task] async claim save failed user=${session.userId}: ${err.message}`);
  });

  const currentPlayer = session.player || player;
  const rewardSync = buildTaskRewardSync(currentPlayer, rewardRows);
  const taskUpdates = buildClaimTaskUpdatePackets(currentPlayer, claimedIds, unlockedTaskIds);
  const response = {
    tag: 1000,
    msgUid,
    data: {
      result: 0,
      type: toSafeInt(task.type, 0),
      ids: claimedIds,
      rewardInfo: { ...buildRewardInfo(rewardRows), gems: rewardGems },
    },
  };
  const gemPackets = gemTaskSyncPackets(currentPlayer, rewardGems);
  if (rewardSync.items.length <= 0) return [...taskUpdates, ...gemPackets, activationPassPacket, response].filter(Boolean);

  return [
    ...taskUpdates,
    { tag: 1202, msgUid: 0, data: rewardSync },
    ...gemPackets,
    activationPassPacket,
    response,
  ].filter(Boolean);
}

// old-client claim task reward (tag:1000)
async function handleClaimTaskRewardCompat(params, session, msgUid) {
  const player = session.player;
  if (!player) {
    return {
      tag: 1000,
      msgUid,
      data: { result: -1, ids: [], rewardInfo: buildRewardInfo([]) },
    };
  }

  const ids = Array.isArray(params.ids)
    ? params.ids.map((id) => toSafeInt(id, 0)).filter((id) => id > 0)
    : [toSafeInt(params.id != null ? params.id : params.taskId, 0)].filter((id) => id > 0);
  const fishTasks=await require('../services/FishingEventService').claimTasks({...params,ids},session,msgUid);if(fishTasks)return fishTasks;
  if (ids.length <= 0) {
    return {
      tag: 1000,
      msgUid,
      data: { result: -1, ids: [], rewardInfo: buildRewardInfo([]) },
    };
  }

  const { claimedIds, unlockedTaskIds, rewardRows, rewardGems, unlockedNextTask } = claimTaskRewards(player, ids);
  if (unlockedNextTask) {
    await refreshSystemUnlockInfo(player);
  }
  require('../services/SideTaskProgressService').reconcile(player);
  if (claimedIds.length <= 0) {
    return {
      tag: 1000,
      msgUid,
      data: { result: -1, ids: [], rewardInfo: buildRewardInfo([]) },
    };
  }

  if (hasExpReward(rewardRows)) {
    checkLevelUp(player);
  }
  refreshMainTaskProgress(player);
  refreshRealmStageTasks(player);
  const activationPassPacket = syncActivationPassAfterTaskRewards(player, rewardRows);
  // Task rewards are already applied to the in-memory session.  Queue a
  // snapshot for Mongo without delaying the tag=1000 ACK and later messages.
  if (claimedIds.some((id) => toSafeInt(getTaskCfg(id)?.type, 0) === 9)) {
    await require('../services/FeatureMutationService').save(session, player);
  } else if (rewardGems.length || claimedIds.includes(10001)) await persistGemTaskClaim(session, player);
  else playerService.savePlayer(session.userId, player).catch((err) => {
    logger.warn(`[Task] async compat claim save failed user=${session.userId}: ${err.message}`);
  });

  const currentPlayer = player;
  const rewardSync = buildTaskRewardSync(currentPlayer, rewardRows);
  const taskUpdates = buildClaimTaskUpdatePackets(currentPlayer, claimedIds, unlockedTaskIds);
  const response = {
    tag: 1000,
    msgUid,
    data: {
      result: 0,
      type: toSafeInt(params.type, 0) || 1,
      ids: claimedIds,
      rewardInfo: { ...buildRewardInfo(rewardRows), gems: rewardGems },
      taskInfo: buildTaskSnapshot(currentPlayer),
    },
  };
  const gemPackets = gemTaskSyncPackets(currentPlayer, rewardGems);
  if (rewardSync.items.length <= 0) return [...taskUpdates, ...gemPackets, activationPassPacket, response].filter(Boolean);

  return [
    ...taskUpdates,
    { tag: 1202, msgUid: 0, data: rewardSync },
    ...gemPackets,
    activationPassPacket,
    response,
  ].filter(Boolean);
}

// chat send (tag:1601)
function handleChatSend(params, session, msgUid) {
  const player = session && session.player ? session.player : {};
  const entry = chat.buildChatEntry(params, player, {
    msgType: 0,
    sys: false,
  });
  return chat.buildWorldChatPushPacket(params && params.channel, entry, msgUid);
}

function routeClaim(handler) {
  const safe = require('../services/FeatureMutationService').wrap(handler);
  return (params = {}, session, msgUid) => {
    const ids = Array.isArray(params.ids)
      ? params.ids
      : [params.taskId != null ? params.taskId : params.id];
    const hasSideTask = ids.some((id) => toSafeInt(getTaskCfg(id)?.type, 0) === 9);
    return hasSideTask ? safe(params, session, msgUid) : handler(params, session, msgUid);
  };
}

// rename (tag:21)
function buildRenameFailure(session, msgUid, reason, details = {}) {
  const userId = String((session && session.userId) || 'unknown');
  logger.warn(`[Rename] rejected user=${userId} reason=${reason}`);
  return {
    tag: 21,
    msgUid,
    data: { result: 1, reason, ...details },
  };
}

async function handleRename(params, session, msgUid) {
  const player = session && session.player;
  if (!player) return buildRenameFailure(session, msgUid, 'PLAYER_NOT_READY');

  const newName = String((params && (params.name || params.newName)) || '');
  const nameValidation = validatePlayerName(newName);
  if (!nameValidation.ok) {
    return buildRenameFailure(session, msgUid, nameValidation.code, { length: nameValidation.length });
  }
  if (nameValidation.name === String(player.name || '')) {
    return buildRenameFailure(session, msgUid, 'NAME_UNCHANGED', { name: player.name || '' });
  }
  if (session._isBot) {
    return buildRenameFailure(session, msgUid, 'BOT_RENAME_BLOCKED', { name: player.name || '' });
  }
  if (await isNameTaken(nameValidation.name, session.userId)) {
    return buildRenameFailure(session, msgUid, 'NAME_TAKEN');
  }

  const cost = getRenameCost();
  const availableCost = getItemCount(player, cost.id);
  if (cost.id <= 0 || cost.count <= 0 || availableCost < cost.count) {
    return buildRenameFailure(session, msgUid, 'COST_NOT_ENOUGH', {
      itemId: cost.id,
      required: cost.count,
      available: availableCost,
    });
  }

  const oldName = player.name;
  const oldChangeName = Math.max(0, toSafeInt(player.changeName, 0));
  const oldItemCount = getItemCount(player, cost.id);
  player.items = player.items || {};
  player.items[cost.id] = oldItemCount - cost.count;
  if (player.items[cost.id] <= 0) delete player.items[cost.id];
  player.name = nameValidation.name;
  player.changeName = oldChangeName + 1;

  try {
    await playerService.savePlayer(session.userId, player, { returnSaved: false });
    await syncAccountRoleName(session.userId, player.name);
  } catch (err) {
    player.name = oldName;
    player.changeName = oldChangeName;
    player.items[cost.id] = oldItemCount;
    logger.warn(`[Rename] save failed user=${session.userId || 'unknown'}: ${err.message}`);
    return buildRenameFailure(session, msgUid, 'SAVE_FAILED');
  }

  logger.info(`[Rename] success user=${session.userId || 'unknown'} old=${oldName || ''} new=${player.name}`);

  return [
    { tag: 21, msgUid, data: { result: 0, name: player.name } },
    {
      tag: 1202,
      msgUid: 0,
      data: {
        result: 0,
        items: [{ id: cost.id, count: -cost.count }],
        changed: [{ id: cost.id, count: getItemCount(player, cost.id) }],
      },
    },
  ];
}

module.exports = {
  handleGetTasks,
  handleClaimTaskReward: routeClaim(handleClaimTaskReward),
  handleClaimTaskRewardCompat: routeClaim(handleClaimTaskRewardCompat),
  buildActiveTaskUpdatePackets,
  buildTaskUpdatePacketsByIds,
  handleChatSend,
  handleRename,
};
