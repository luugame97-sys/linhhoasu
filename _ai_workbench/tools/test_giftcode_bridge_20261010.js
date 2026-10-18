const assert = require('assert/strict');
const crypto = require('crypto');

process.env.API_KEY = 'bridge-test-key';
process.env.WEBGM_GIFTCODE_BRIDGE_ENABLED = '1';
process.env.WEBGM_INTERNAL_BASE = 'http://127.0.0.1:88';

let captured;
global.fetch = async (url, options) => {
  captured = { url, options };
  const parsed = JSON.parse(options.body);
  assert.equal(parsed.code, 'TESTCODE');
  assert.equal(parsed.serverId, '1001');
  assert.equal(parsed.roleId, 'u_test');
  assert.equal(parsed.legacyClaimed, true);
  const payload = ['POST', '/api/internal_giftcode_claim.php', options.headers['x-timestamp'], options.headers['x-nonce'], options.body].join('\n');
  assert.equal(options.headers['x-signature'], crypto.createHmac('sha256', process.env.API_KEY).update(payload).digest('hex'));
  return { status: 200, ok: true, async json() { return { success: true, status: 'already_claimed', delivery_id: 17 }; } };
};

const bridge = require('../temp/giftcode_bridge_20261010/WebGmGiftcodeBridgeService');

(async () => {
  const result = await bridge.claim({
    code: ' test code ',
    session: { serverId: 1001, userId: 'u_test' },
    player: { userId: 'u_test', serverId: 1001 },
    legacyClaimed: true,
  });
  assert.equal(result.status, 'already_claimed');
  assert.equal(captured.url, 'http://127.0.0.1:88/api/internal_giftcode_claim.php');
  process.env.WEBGM_GIFTCODE_BRIDGE_ENABLED = '0';
  assert.deepEqual(await bridge.claim({ code: 'TEST', session: {}, player: {} }), { status: 'disabled' });
  console.log('PASS: WebGM bridge normalization, identity payload, HMAC signature, legacy reconciliation flag, and feature disable flag. No network/DB writes.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
