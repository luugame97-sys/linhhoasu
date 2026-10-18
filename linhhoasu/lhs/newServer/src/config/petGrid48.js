'use strict';

// The same policy is applied by lhs-pet-grid48-v1.js in the native client.
// Upgrade free capacity without rewriting the existing binary config bundle.
function apply(tables) {
  const base = tables && tables.PetBaseConfig;
  if (!base || typeof base !== 'object' || Array.isArray(base)) throw Error('PET_GRID_BASE_MISSING');
  base.initialField = 48;
  base.fieldMax = 48;
  base.fieldConsume = [];
  base.freeFieldCount = 48;
}

module.exports = { apply };
