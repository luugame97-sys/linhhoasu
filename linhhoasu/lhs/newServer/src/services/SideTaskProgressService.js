'use strict';

const config = require('./ConfigService');
const { markTaskDirty } = require('./TaskDirtyService');

const int = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.floor(number) : fallback;
};
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

// Keep activation explicit while the native receipts for each feature are
// being rolled out.  A missing flag must never expose a task chain by itself.
const IMPLEMENTED_ROOTS = new Set([90002, 90020]);
let cachedTable = null;
let cachedGraph = null;

function buildGraph() {
  const tasks = config.get('TaskConfig') || {};
  if (cachedTable === tasks && cachedGraph) return cachedGraph;

  const parents = new Map();
  const roots = new Map();
  Object.values(tasks).forEach((row) => {
    if (int(row && row.type) !== 9 || int(row && row.nextId) <= 0) return;
    const nextId = int(row.nextId);
    if (!parents.has(nextId)) parents.set(nextId, []);
    parents.get(nextId).push(int(row.id));
  });

  const special = config.get('SpecialTaskConfig') || {};
  Object.values(tasks).forEach((row) => {
    if (int(row && row.type) !== 9) return;
    const start = int(row.id);
    let id = start;
    let valid = true;
    const seen = new Set();
    while (parents.has(id)) {
      const list = parents.get(id);
      if (seen.has(id) || list.length !== 1) {
        valid = false;
        break;
      }
      seen.add(id);
      id = list[0];
    }
    if (valid && special[id]) roots.set(start, id);
  });

  cachedTable = tasks;
  cachedGraph = { tasks, special, roots };
  return cachedGraph;
}

function rootIsOpen(player = {}, rootId = 0) {
  const { special } = buildGraph();
  const row = special[rootId] || special[String(rootId)];
  if (!row || !Array.isArray(row.conditions) || row.conditions.length <= 0) return false;
  const unlocked = new Set((player.systemUnlockInfo && player.systemUnlockInfo.unlockedSystem) || []);
  return row.conditions.every((condition) => int(condition && condition.type) === 7
    && int(condition && condition.cond) === 4
    && unlocked.has(int(condition && condition.value)));
}

function ensureInfo(player) {
  player.taskInfo = object(player.taskInfo);
  player.taskInfo.tasks = object(player.taskInfo.tasks);
  player.taskInfo.tasksMap = object(player.taskInfo.tasksMap);
  return player.taskInfo;
}

function setState(player, row) {
  const info = ensureInfo(player);
  const taskId = int(row && row.id);
  info.tasks[String(taskId)] = row;
  const list = Array.isArray(info.tasksMap['9']) ? info.tasksMap['9'].slice() : [];
  const index = list.findIndex((task) => int(task && task.id) === taskId);
  if (index < 0) list.push(row);
  else list[index] = row;
  info.tasksMap['9'] = list.sort((a, b) => int(a && a.id) - int(b && b.id));
  markTaskDirty(player, [taskId]);
}

function currentOwnedProgress(player, cfg) {
  if (int(cfg && cfg.activeId) === 40) {
    return (Array.isArray(player.artifactInfo && player.artifactInfo.artifacts)
      ? player.artifactInfo.artifacts : []).filter((row) => int(row && row.id) > 0).length;
  }
  // The remaining action tasks are advanced only by their native handlers;
  // existing inventory/hero state is not retroactive proof of an action.
  return 0;
}

function createState(player, cfg) {
  const target = Math.max(0, int(cfg && cfg.taskValue1));
  const progress = Math.min(target, Math.max(0, currentOwnedProgress(player, cfg)));
  return {
    id: int(cfg && cfg.id),
    type: 9,
    status: target > 0 && progress >= target ? 20 : 10,
    target,
    progress,
  };
}

function reconcile(player) {
  if (!player || String(process.env.FEATURE_SIDE_TASKS_ENABLED || '') !== '1') return false;
  const requested = String(process.env.FEATURE_SIDE_TASK_ROOTS || '')
    .split(',')
    .map((value) => int(value))
    .filter((id) => IMPLEMENTED_ROOTS.has(id));
  if (requested.length <= 0) return false;

  const { tasks, roots } = buildGraph();
  let changed = false;
  for (const root of new Set(requested)) {
    if (!rootIsOpen(player, root) || roots.get(root) !== root) continue;
    const info = ensureInfo(player);
    const visited = new Set();
    let id = root;
    while (id > 0 && !visited.has(id) && roots.get(id) === root) {
      visited.add(id);
      const cfg = tasks[id] || tasks[String(id)];
      if (!cfg) break;
      const state = info.tasks[String(id)] || info.tasks[id];
      if (!state) {
        setState(player, createState(player, cfg));
        changed = true;
        break;
      }
      if (int(state.status) !== 30) {
        if (int(cfg.activeId) === 40) {
          const progress = Math.min(Math.max(0, int(cfg.taskValue1)),
            Math.max(int(state.progress), currentOwnedProgress(player, cfg)));
          if (progress !== int(state.progress)) {
            setState(player, {
              ...state,
              progress,
              target: int(cfg.taskValue1),
              status: progress >= int(cfg.taskValue1) ? 20 : 10,
            });
            changed = true;
          }
        }
        break;
      }
      id = int(cfg.nextId);
    }
  }
  return changed;
}

function recordProgress(player, activeId, delta = 1, options = {}) {
  if (!player || int(delta) <= 0) return false;
  const { tasks, roots } = buildGraph();
  const info = ensureInfo(player);
  let changed = false;
  Object.values(info.tasks).forEach((state) => {
    const id = int(state && state.id);
    const cfg = tasks[id] || tasks[String(id)];
    const root = roots.get(id);
    if (!cfg || int(cfg.type) !== 9 || int(cfg.activeId) !== int(activeId)
      || !root || !rootIsOpen(player, root) || ![10, 20].includes(int(state.status))) return;
    if (int(activeId) === 13 && int(options.itemId) !== int(cfg.taskValue2)) return;
    const target = Math.max(0, int(cfg.taskValue1));
    const progress = Math.min(target, Math.max(0, int(state.progress)) + int(delta));
    if (progress === int(state.progress)) return;
    setState(player, {
      ...state,
      progress,
      target,
      status: target > 0 && progress >= target ? 20 : 10,
    });
    changed = true;
  });
  return changed;
}

module.exports = {
  graph: buildGraph,
  buildGraph,
  rootIsOpen,
  reconcile,
  createState,
  recordProgress,
  getCurrentProgress: currentOwnedProgress,
};
