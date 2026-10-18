'use strict';
// Farm/alchemy economic day is explicit GMT+7, independent of OS/Node TZ.
const OFFSET = 7 * 60 * 60 * 1000;
function key(now = Date.now()) {
  const d = new Date(now + OFFSET);
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}
function end(now = Date.now()) { return (Math.floor((now + OFFSET) / 86400000) + 1) * 86400000 - OFFSET; }
module.exports = { key, end };
