'use strict';

// Rates explicitly advertised in shipped Assets/LanguageConfig; no new base RNG table.
const crypto = require('crypto');
const config = require('./ConfigService');
const { clone } = require('./FishingIntegrityService');
const owns = (player, id) => Number(player.items?.[id] || 0) > 0;
const int = n => Number.isSafeInteger(n) && n >= 0;

function chance(rate, draw = n => crypto.randomInt(n)) {
  if (!int(rate) || rate > 10000) throw Error('FISH_EFFECT_RATE_INVALID');
  const roll = draw(10000);
  if (!int(roll) || roll >= 10000) throw Error('FISH_EFFECT_DRAW_INVALID');
  return roll < rate;
}

function orderRewards(player, rewards, draw) {
  const result = clone(rewards);
  if (owns(player, 5906) && chance(1000, draw)) {
    for (const row of result) row.count *= 2;
  }
  return result;
}

function saleRewards(player, baseCoins) {
  if (!int(baseCoins)) throw Error('FISH_SALE_AMOUNT_INVALID');
  const base = config.get('FishBaseConfig')?.priceAttr;
  if (!Array.isArray(base) || base[0] !== 5904 || !int(base[1]) || base[1] > 10000) throw Error('FISH_SALE_CONFIG_INVALID');
  if (!owns(player, base[0]) || !baseCoins) return [{ id: 68, count: baseCoins }].filter(r => r.count);
  const info = player.fishInfo;
  const carry = info.goldRodSaleRemainderBps || 0;
  if (!int(carry) || carry >= 10000) throw Error('FISH_SALE_REMAINDER_INVALID');
  const numerator = baseCoins * base[1] + carry;
  if (!Number.isSafeInteger(numerator)) throw Error('FISH_SALE_OVERFLOW');
  info.goldRodSaleRemainderBps = numerator % 10000;
  info.extraPrice ||= {};
  const current = Number(info.extraPrice[68] || 0);
  if (!int(current) || !Number.isSafeInteger(current + Math.floor(numerator / 10000))) throw Error('FISH_SALE_OVERFLOW');
  // Native FishPriceGetPanel collects this bonus separately via tag4022.
  // Carry fractional coins so splitting a sale cannot erase or multiply the 10% benefit.
  info.extraPrice[68] = current + Math.floor(numerator / 10000);
  return [{ id: 68, count: baseCoins }];
}

module.exports = { chance, orderRewards, saleRewards };
