'use strict';

// Keep the five paid daily packs (4000002-4000006) and the previously opened
// weekly pet pack in their original shop sections.  Zero is the existing
// server/native-client contract for no purchase cap.  The free daily pack
// 4000001 is intentionally excluded.
const PACKAGE_IDS = Object.freeze([4000002, 4000003, 4000004, 4000005, 4000006, 4000103]);

function apply(tables) {
  const shop = tables && tables.ShopConfig;
  const rows = PACKAGE_IDS.map(id => shop && shop[id]);
  if (rows.some((row, index) => !row || Number(row.id) !== PACKAGE_IDS[index]
      || Number(row.payId) !== PACKAGE_IDS[index] || Number(row.tab) !== 4)) {
    throw new Error('PET_PACKAGE_CONFIG_MISSING');
  }
  rows.forEach(row => {
    row.limit = 0;
    row.limitType = 0;
  });
}

module.exports = { apply, PACKAGE_IDS };
