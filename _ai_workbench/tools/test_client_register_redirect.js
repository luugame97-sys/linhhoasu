const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');
const bundlePath = path.join(root, 'linhhoasu', 'webgame', 'game', 'js', 'main.min_a6195824.js');
const indexPath = path.join(root, 'linhhoasu', 'webgame', 'game', 'index.html');
const expectedUrl = 'http://103.116.105.154:81/register.html?inviteCode=TY7C1A';
const expectedToken = '20260831_register_redirect_v1';

const bundle = fs.readFileSync(bundlePath, 'utf8');
const index = fs.readFileSync(indexPath, 'utf8');
const start = bundle.indexOf('b.onRegClick=function');
const end = bundle.indexOf(',rbi.LAYER_LEVEL=', start);

assert(start >= 0 && end > start, 'registration click handler not found');
const assignment = bundle.slice(start, end);
assert.strictEqual((assignment.match(/register\.html\?inviteCode=TY7C1A/g) || []).length, 1);
assert(assignment.includes('platform.openUrl(t)'), 'native redirect missing');
assert(assignment.includes('window.location.href=t'), 'H5 redirect missing');
assert(!assignment.includes('GetRandomAccount'), 'legacy random registration remains in click handler');
assert(!assignment.includes('30030070'), 'old local-account warning remains in click handler');
assert.strictEqual((index.match(new RegExp(expectedToken, 'g')) || []).length, 2);

function execute(context) {
  vm.runInNewContext(`var b={};${assignment};b.onRegClick();`, context);
}

const h5 = {
  RuntimeUtil: { isRuntime: false },
  platform: {},
  window: { location: { href: '' } },
};
execute(h5);
assert.strictEqual(h5.window.location.href, expectedUrl);

const nativeCalls = [];
const native = {
  RuntimeUtil: { isRuntime: true },
  platform: { openUrl: (url) => nativeCalls.push(url) },
  window: { location: { href: '' } },
};
execute(native);
assert.deepStrictEqual(nativeCalls, [expectedUrl]);
assert.strictEqual(native.window.location.href, '');

const fallback = {
  RuntimeUtil: { isRuntime: true },
  platform: { openUrl: () => { throw new Error('native bridge unavailable'); } },
  window: { location: { href: '' } },
};
execute(fallback);
assert.strictEqual(fallback.window.location.href, expectedUrl);

console.log(JSON.stringify({
  result: 'PASS',
  h5Redirect: true,
  nativeRedirect: true,
  nativeFallback: true,
  legacyWarningRemoved: true,
  legacyRandomCallRemovedFromButton: true,
  cacheTokenCount: 2,
}));
