'use strict';

// Auto composition becomes available with the pet board, not server day 57.
function apply(tables) {
  const systems = tables && tables.SystemConfig;
  if (!systems || !systems[206] || !systems[229]) throw Error('PET_AUTO_ACCESS_CONFIG_MISSING');
  const board = systems[206];
  systems[229].conditions = JSON.parse(JSON.stringify(board.conditions || []));
  systems[229].openDay = board.openDay || 0;
}

module.exports = { apply };
