'use strict';

// Custom, versioned PvP candidate. No DB, config mutation, ownership or rewards.
// Not an official/native formula. See custom_combat_v1_20260922.md before rollout.
const VERSION = 'custom-pvp-v1';
const RULES = Object.freeze({
  maxAttribute: 1e12,
  maxRounds: 15,
  maxHits: 3,
  comboChanceDecay: 0.5,
  comboDamageDecay: 0.75,
  evadeStreakDecay: 0.5,
  lifestealFraction: 0.3,
  caps: Object.freeze({ 101: 0.8, 102: 0.65, 103: 0.75, 104: 0.8, 105: 0.9, 106: 0.35, 257: 0.8 }),
});
const MODE_ATTRS = Object.freeze({ pvp: null, arena: [531, 532], crossArena: [533, 534], farm: [535, 536] });
const clamp = (n, low, high) => Math.min(high, Math.max(low, n));

function attributes(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('COMBAT_ATTRS_INVALID');
  const result = {};
  for (const [key, value] of Object.entries(input)) {
    if (!/^\d+$/.test(key)) continue;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > RULES.maxAttribute) throw new Error('COMBAT_ATTR_VALUE_INVALID:' + key);
    result[key] = Math.floor(n);
  }
  if (!(result[1] > 0)) throw new Error('COMBAT_HP_INVALID');
  return result;
}

// Smooth saturation; retains small-rating slope, cannot become an auto-proc.
function procProbability(rating, resistance, cap) {
  const net = Math.max(0, rating - resistance);
  return net === 0 ? 0 : cap * (net / (net + cap * 10000));
}

function simulateBattle(playerAttrs, opponentAttrs, options = {}) {
  const mode = options.mode || 'pvp';
  if (!Object.prototype.hasOwnProperty.call(MODE_ATTRS, mode)) throw new Error('COMBAT_MODE_INVALID');
  const maxRounds = options.maxRounds === undefined ? RULES.maxRounds : options.maxRounds;
  if (!Number.isInteger(maxRounds) || maxRounds < 1 || maxRounds > 100) throw new Error('COMBAT_ROUNDS_INVALID');
  const rng = options.rng === undefined ? Math.random : options.rng;
  if (typeof rng !== 'function') throw new Error('COMBAT_RNG_INVALID');
  function random() {
    const value = rng();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('COMBAT_RNG_RANGE');
    return value;
  }
  const roll = p => p > 0 && random() < p;
  const make = (key, input) => {
    const attr = attributes(input);
    return { key, attr, maxHp: attr[1], hp: attr[1], evadeStreak: 0, stunned: false, stunImmune: false, damage: 0 };
  };
  const p = make('player', playerAttrs), m = make('monster', opponentAttrs);
  const get = (actor, id) => actor.attr[id] || 0;
  const chance = (a, d, id, resist = id + 50) => procProbability(get(a, id), get(d, resist), RULES.caps[id]);
  const factor = (increase, reduction) => clamp((10000 + increase) / (10000 + reduction), 0.1, 10);
  const physical = (attack, defense) => attack <= 0 ? 0 : attack * (attack / (attack + defense));
  const rounds = [];
  const first = get(p, 4) === get(m, 4) ? (roll(0.5) ? p : m) : (get(p, 4) > get(m, 4) ? p : m);
  const order = first === p ? [p, m] : [m, p];

  function hitDamage(a, d, hitIndex) {
    const crit = roll(chance(a, d, 105));
    const critMultiplier = clamp(2 + (get(a, 202) - get(d, 222)) / 10000, 1, 4);
    const elementalCrit = roll(chance(a, d, 257, 258));
    let damage = physical(get(a, 2), get(d, 3)) * (crit ? critMultiplier : 1);
    damage += physical(get(a, 5), get(d, 6)) * (elementalCrit ? 1.5 : 1);
    damage *= 0.95 + random() * 0.1;
    damage *= factor(get(a, 241), get(d, 242));
    damage *= factor(get(a, 245), get(d, 246));
    const pair = MODE_ATTRS[mode];
    if (pair) damage *= factor(get(a, pair[0]), get(d, pair[1]));
    damage *= Math.pow(RULES.comboDamageDecay, hitIndex);
    // Emit effective HP damage, not overkill. Total damage stays within safe JS integers.
    return { damage: Math.min(d.hp, Math.max(1, Math.floor(damage))), crit, elementalCrit };
  }

  function strike(a, d, actions, kind, index) {
    const life = kind === 'attack' && roll(chance(a, d, 101));
    // Lifesteal attacks bypass evade; resisted lifesteal cannot bypass it.
    const evade = chance(d, a, 104, 154) * Math.pow(RULES.evadeStreakDecay, d.evadeStreak);
    if (!life && !d.stunned && roll(evade)) {
      d.evadeStreak++;
      actions.push({ kind: 'evade', caster: d.key, target: a.key });
      return false;
    }
    d.evadeStreak = 0;
    const hit = hitDamage(a, d, index);
    d.hp -= hit.damage;
    a.damage += hit.damage;
    const action = { kind, caster: a.key, target: d.key, ...hit, combo: kind === 'attack' && index > 0, targetHp: d.hp };
    actions.push(action);
    if (life && a.hp < a.maxHp) {
      const amount = Math.floor(hit.damage * Math.min(1, RULES.lifestealFraction * factor(get(a, 203), get(d, 223))));
      const heal = Math.min(a.maxHp - a.hp, amount);
      if (heal > 0) {
        a.hp += heal;
        actions.push({ kind: 'heal', caster: a.key, target: a.key, value: heal, targetHp: a.hp });
      }
    }
    // Counter attacks cannot recurse, combo, lifesteal or stun in this ruleset.
    if (kind === 'attack' && d.hp > 0 && !d.stunned && !d.stunImmune && roll(chance(a, d, 106))) {
      d.stunned = true;
      // One standalone hint only; setting action.stun as well duplicates the
      // native stun hint in buildChapterFightEvents.
      actions.push({ kind: 'stun', caster: a.key, target: d.key });
    }
    return true;
  }

  function turn(a, d, actions) {
    if (a.hp <= 0 || d.hp <= 0) return;
    if (a.stunned) {
      a.stunned = false;
      a.stunImmune = true; // Must receive one unstunned action opportunity before re-stun.
      actions.push({ kind: 'skip', caster: a.key, reason: 'stun' });
      return;
    }
    for (let index = 0; index < RULES.maxHits && a.hp > 0 && d.hp > 0; index++) {
      const landed = strike(a, d, actions, 'attack', index);
      if (!landed || d.hp <= 0 || a.hp <= 0) break;
      if (!d.stunned && roll(chance(d, a, 102, 152))) {
        strike(d, a, actions, 'counter', 0);
        break; // A counter interrupts the chain, even if the counter is evaded.
      }
      if (index + 1 >= RULES.maxHits || !roll(chance(a, d, 103) * Math.pow(RULES.comboChanceDecay, index))) break;
    }
    a.stunImmune = false;
  }

  for (let round = 1; round <= maxRounds && p.hp > 0 && m.hp > 0; round++) {
    const actions = [];
    turn(order[0], order[1], actions);
    turn(order[1], order[0], actions);
    const row = { round, playerHP: p.hp, monsterHP: m.hp, actions };
    for (const a of [p, m]) {
      const prefix = a.key;
      const own = actions.filter(e => e.caster === prefix);
      row[prefix + 'Dmg'] = own.filter(e => e.kind === 'attack' || e.kind === 'counter').reduce((n, e) => n + e.damage, 0);
      row[prefix + 'Crit'] = own.some(e => e.crit);
      row[prefix + 'Evade'] = own.some(e => e.kind === 'evade');
      row[prefix + 'Combo'] = own.some(e => e.combo);
      row[prefix + 'Counter'] = own.some(e => e.kind === 'counter');
      row[prefix + 'Heal'] = own.filter(e => e.kind === 'heal').reduce((n, e) => n + e.value, 0);
      row[prefix + 'Stun'] = actions.some(e => e.kind === 'stun' && e.target === prefix);
    }
    rounds.push(row);
  }
  let win, resolution;
  if (p.hp <= 0 || m.hp <= 0) {
    win = m.hp <= 0 && p.hp > 0;
    resolution = 'knockout';
  } else {
    const difference = p.hp / p.maxHp - m.hp / m.maxHp;
    if (Math.abs(difference) > 1e-12) {
      win = difference > 0;
      resolution = 'timeout-hp-ratio';
    } else {
      win = roll(0.5); // No attacker, absolute-HP or power advantage in an exact tie.
      resolution = 'timeout-tiebreak';
    }
  }
  return {
    win, star: win ? (p.hp > p.maxHp * 0.5 ? 3 : p.hp > p.maxHp * 0.2 ? 2 : 1) : 0,
    rounds, totalRounds: rounds.length, playerHPLeft: p.hp, monsterHPLeft: m.hp,
    playerDamage: p.damage, monsterDamage: m.damage,
    rulesVersion: VERSION, mode, resolution, firstActor: first.key,
  };
}

module.exports = { VERSION, RULES, procProbability, simulateBattle };
