/**
 * 协议路由器
 * 基于 tag 数字分发消息到对应 handler
 */

const logger = require('./logger');

// handler 注册表: tag → handler(data, session, msgUid)
const handlers = {};

// fallback handler（处理未注册的 tag）
let fallbackHandler = null;

/**
 * 注册 handler
 * @param {number} tag - 协议标签
 * @param {Function} handler - 处理函数 (data, session, msgUid) => result
 */
function register(tag, handler) {
  handlers[tag] = handler;
}

/**
 * 批量注册 handler
 * @param {Object} map - { tag: handler } 映射
 */
function registerAll(map) {
  for (const [tag, handler] of Object.entries(map)) {
    handlers[Number(tag)] = handler;
  }
}

/**
 * 设置 fallback handler（处理所有未注册的 tag）
 * @param {Function} handler - (tag, data, session, msgUid) => result
 */
function setFallback(handler) {
  fallbackHandler = handler;
}

// 不需要登录的 tag（登录、心跳）
const NO_AUTH_TAGS = new Set([1, 11]);
const BOT_ALLOWED_TAGS = new Set([
  1,    // managed bot login
  11,   // heartbeat
  500,  // read self/detail
  1400, // enter map
  1401, // leave map
  1402, // point movement
  1403, // path movement
  1404, // path finding
  1405, // straight path
  1410, // map emoji
  1600, // map-scoped chat
  2000, // normal-map monster/open-box auto-delegate start
  2001, // normal-map monster reward claim
]);

/**
 * 路由消息到对应 handler
 * @param {number} tag - 协议标签
 * @param {number} msgUid - 消息唯一 ID
 * @param {*} data - 消息数据
 * @param {Object} session - 玩家会话上下文
 * @returns {*} handler 返回的响应
 */
function route(tag, msgUid, data, session) {
  // 临时调试日志
  if (tag === 1400) {
    logger.info(`[Router] tag=1400 Nhận yêu cầu, data=${JSON.stringify(data)}, hasPlayer=${!!session.player}`);
  }
  // 登录检查：未登录只允许 tag=1 和 tag=11
  if (!NO_AUTH_TAGS.has(tag) && !session.player) {
    logger.warn(`[Router] 未登录请求 tag=${tag}từ chối`);
    return { tag, msgUid, data: { result: -1, msg: 'not logged in' } };
  }
  if (session && session._isBot && !BOT_ALLOWED_TAGS.has(Number(tag))) {
    logger.warn(`[Router] managed bot request denied user=${session.userId || 'unknown'} tag=${tag}`);
    return { tag, msgUid, data: { result: -1, msg: 'bot action denied' } };
  }

  const handler = handlers[tag];
  const topArena = require('./services/TopArenaService');
  if (topArena.TAGS.has(Number(tag))) return topArena.dispatch(Number(tag), data, session, msgUid);
  if (Number(tag) === 2351 && /^ta3_/.test(String(data?.recordId || ''))) {
    return topArena.playback(String(data.recordId)).then(result => ({tag,msgUid,data:result}))
      .catch(() => ({tag,msgUid,data:{result:1,code:'TOP_ARENA_REPLAY_UNAVAILABLE'}}));
  }
  const eventSchedule = require('./services/CrossEventScheduleService');
  if (Number(tag) === 6199 || (handler && eventSchedule.eventForTag(tag))) {
    return eventSchedule.dispatch(tag, data, session, msgUid, handler);
  }
  if (handler) {
    return handler(data, session, msgUid);
  }

  // 未注册的 tag，尝试 fallback
  if (fallbackHandler) {
    return fallbackHandler(tag, data, session, msgUid);
  }

  // 返回空响应避免客户端超时
  logger.warn(`[Router] 未注册的 handler: tag=${tag}`);
  return { tag, msgUid, data: {} };
}

/**
 * 获取已注册的 tag 列表
 * @returns {number[]}
 */
function getRegisteredTags() {
  return Object.keys(handlers).map(Number);
}

/**
 * 检查 tag 是否已注册
 * @param {number} tag
 * @returns {boolean}
 */
function hasHandler(tag) {
  return tag in handlers;
}

module.exports = {
  register,
  registerAll,
  setFallback,
  route,
  getRegisteredTags,
  hasHandler,
  BOT_ALLOWED_TAGS,
};
