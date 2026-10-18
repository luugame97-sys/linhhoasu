/**
 * PreparedChatService
 *
 * Loads character-specific dialogue from src/data/chat.txt. The file is
 * treated strictly as data: '# ' headings are works, '## ' headings are
 * character names, and '- ' lines are dialogue phrases.
 */

const fs = require('fs');
const path = require('path');
const logger = require('../logger');

const DEFAULT_PATH = path.join(__dirname, '..', 'data', 'chat.txt');
let cache = null;
let cachePath = '';

function normalize(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function resolvePath() {
  return String(process.env.PREPARED_CHAT_PATH || '').trim() || DEFAULT_PATH;
}

function load() {
  const filePath = resolvePath();
  if (cache && cachePath === filePath) return cache;

  const byCharacter = new Map();
  const aliases = new Map();
  const stats = {
    path: filePath,
    rawLines: 0,
    characterCount: 0,
    phraseCount: 0,
    duplicateCount: 0,
    maxPhraseLength: 0,
  };
  let currentKeys = [];

  try {
    const lines = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
    stats.rawLines = lines.length;
    for (const rawLine of lines) {
      const line = normalize(rawLine);
      if (!line || line.startsWith('# ')) {
        if (line.startsWith('# ') && !line.startsWith('## ')) currentKeys = [];
        continue;
      }
      if (line.startsWith('## ')) {
        currentKeys = line.slice(3)
          .split('/')
          .map(normalize)
          .filter(Boolean)
          .map((name) => name.toLocaleLowerCase('vi-VN'));
        currentKeys.forEach((key) => {
          if (!byCharacter.has(key)) byCharacter.set(key, []);
          aliases.set(key, key);
        });
        continue;
      }
      if (!line.startsWith('- ')) continue;
      const phrase = normalize(line.slice(2));
      if (!phrase || currentKeys.length <= 0) continue;
      stats.maxPhraseLength = Math.max(stats.maxPhraseLength, Array.from(phrase).length);
      currentKeys.forEach((key) => {
        const rows = byCharacter.get(key) || [];
        if (rows.includes(phrase)) {
          stats.duplicateCount += 1;
          return;
        }
        rows.push(phrase);
        byCharacter.set(key, rows);
        stats.phraseCount += 1;
      });
    }
  } catch (err) {
    logger.warn(`[PreparedChat] load failed path=${filePath}: ${err.message}`);
  }

  stats.characterCount = byCharacter.size;
  cachePath = filePath;
  cache = { byCharacter, aliases, stats };
  logger.info(
    `[PreparedChat] loaded characters=${stats.characterCount} phrases=${stats.phraseCount} `
    + `duplicates=${stats.duplicateCount} path=${filePath}`
  );
  return cache;
}

function getPhrasesForName(name) {
  const key = normalize(name).toLocaleLowerCase('vi-VN');
  if (!key) return [];
  const rows = load().byCharacter.get(key) || [];
  return rows.slice();
}

function getStats() {
  return { ...load().stats };
}

function reload() {
  cache = null;
  cachePath = '';
  return load();
}

module.exports = {
  getPhrasesForName,
  getStats,
  reload,
  _debug: {
    normalize,
    resolvePath,
  },
};
