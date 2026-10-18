'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'linhhoasu/webgame/game/index.html'), 'utf8').replace(/\r\n/g, '\n');
const inline = Array.from(html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi), m => m[1]);
inline.forEach((code, i) => new vm.Script(code, { filename: `index.inline.${i}.js` }));
const between = (a, b) => {
  const start = html.indexOf(a), end = html.indexOf(b, start);
  assert.ok(start >= 0 && end > start, a);
  return html.slice(start, end);
};
const loader = between('var loadScript = function', 'var installLhsActionCompletionGuards');
const single = between('var getScriptLoadUrl = function', 'var hashed_default_json');
const manifestStart = html.indexOf('callback({');
const manifestEnd = html.indexOf('\n\n})', manifestStart);
const manifestBlock = html.slice(manifestStart + 'callback('.length, manifestEnd + 3);
const manifest = Function(`return ${manifestBlock}`)();
function runScenario(options = {}) {
  const links = [], inserted = [], callbacks = [], guardCalls = [];
  const head = { appendChild: element => { if (options.preloadThrows) throw new Error('preload refused'); links.push(element); } };
  const body = { appendChild: element => { element.parentNode = body; inserted.push(element); }, removeChild: () => {} };
  const context = {
    JS_URL_PREFIX: './', nativeJsMap: options.nativeMap || { files: {} },
    window: options.native ? { egret_native: {} } : {},
    document: {
      head, body, createElement: type => ({
        relList: { supports: () => options.supports !== false },
        addEventListener: function (event, cb) { this[event] = cb; },
        removeEventListener: () => {},
      }),
    },
    installLhsSocketSendGuard: () => guardCalls.push('socket'),
    installLhsActionCompletionGuards: () => {},
    installLhsTopCombatProtocolGuard: () => true,
  };
  vm.createContext(context);
  vm.runInContext(loader + single, context);
  context.preloadStartupScripts(manifest);
  assert.equal(inserted.length, 0, 'preloads must not execute scripts');
  const urls = manifest.initial.concat(manifest.game.slice(0, 4));
  const expected = urls.map(url => {
    const name = url.split('/').pop();
    const src = name in context.nativeJsMap.files ? context.nativeJsMap.root + name : './' + url;
    return /js\/(egretex\.min_37b3ee13|start\.min_52ac8d58|main\.min_a6195824)\.js$/.test(src) ? src + '?v=20260831_tien_duyen_fix_v1' : src;
  });
  context.loadScript(urls, 1, () => callbacks.push('done'));
  for (let i = 0; i < expected.length; i++) {
    assert.equal(inserted.length, i + 1, 'sequential execution must be preserved');
    assert.equal(inserted[i].src, expected[i]);
    assert.equal(inserted[i].async, false);
    assert.equal(callbacks.length, 0);
    inserted[i].load();
  }
  assert.deepEqual(callbacks, ['done']);
  assert.equal(guardCalls.length, options.nativeMap ? 0 : 1, 'socket guard unchanged');
  if (options.native || options.supports === false || options.preloadThrows) assert.equal(links.length, 0);
  else {
    assert.deepEqual(links.map(link => link.href), [...new Set(expected)]);
    assert.ok(links.every(link => link.rel === 'preload' && link.as === 'script'));
    assert.ok(links.some(link => link.href.endsWith('egretex.min_37b3ee13.js?v=20260831_tien_duyen_fix_v1')));
  }
  return { preloadCount: links.length, scripts: expected.length, passed: true };
}
const scenarios = {
  browser: runScenario(),
  unsupported: runScenario({ supports: false }),
  preloadFailure: runScenario({ preloadThrows: true }),
  native: runScenario({ native: true, nativeMap: { root: 'native/', files: { 'egretex.min_37b3ee13.js': true } } }),
};
assert.ok(!html.includes('pet_vusa_lian_20260930.bin'));
assert.ok(html.includes("translationVersion = '20260930_pet_cap1000_v1'"));
console.log(JSON.stringify({ result: 'PASS', inlineScripts: inline.length, scenarios }, null, 2));

