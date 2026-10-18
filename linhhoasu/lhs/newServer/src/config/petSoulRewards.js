'use strict';

// Conservative, visible rewards for the two PetSoul claim paths.  The binary
// tables contain no daily/dispatch reward rows; keep the daily click useful
// without inventing a random/native placeholder item.
module.exports = Object.freeze({
  dailyReward: Object.freeze([{ id: 261, count: 10 }]), // Tẩy Linh Đan
  maxStoredDays: 7,
});
