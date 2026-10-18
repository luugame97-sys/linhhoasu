'use strict';

// Server-side contract: validate a real image signature, store by content hash,
// and enforce the seven-day replacement window without a database connection.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lhs-avatar-contract-'));
process.env.LHS_AVATAR_DIR = root;
const upload = require('../../linhhoasu/lhs/newServer/src/services/AvatarUploadService');
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);

async function main() {
  const image = `data:image/png;base64,${png.toString('base64')}`;
  assert(upload.changeState(0).allowed);
  assert.equal(upload.changeState(Date.now() - 6 * 24 * 60 * 60 * 1000).allowed, false);
  assert(upload.changeState(Date.now() - upload.MIN_INTERVAL_MS - 1).allowed);
  assert.throws(() => upload.parseDataUrl('data:image/svg+xml;base64,AAAA'), /AVATAR_IMAGE_FORMAT/);
  const stored = await upload.storeDataUrl(image);
  assert(stored.url.includes('/game/uploads/avatars/'));
  assert.equal(stored.bytes, png.length);

  const playerServicePath = require.resolve('../../linhhoasu/lhs/newServer/src/services/PlayerService');
  require.cache[playerServicePath] = {
    id: playerServicePath, filename: playerServicePath, loaded: true,
    exports: { drainPendingSaves: async () => {}, savePlayer: async (_id, player) => player },
  };
  const mutationPath = require.resolve('../../linhhoasu/lhs/newServer/src/services/PlayerMutationService');
  require.cache[mutationPath] = {
    id: mutationPath, filename: mutationPath, loaded: true,
    exports: { run: (_id, work) => work() },
  };
  const avatarHandler = require('../../linhhoasu/lhs/newServer/src/handlers/avatar');
  const session = { userId: 'avatar-test', player: { userId: 'avatar-test', level: 1, avatarUrl: '', avatarUploadAt: 0 } };
  const first = await avatarHandler.handleUploadAvatar({ image }, session, 1);
  assert.equal(first.data.result, 0);
  const second = await avatarHandler.handleUploadAvatar({ image }, session, 2);
  assert.equal(second.data.code, 'AVATAR_CHANGE_COOLDOWN');
  console.log(JSON.stringify({ result: 'PASS', bytes: stored.bytes, url: stored.url, cooldown: second.data.code }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  fs.rmSync(root, { recursive: true, force: true });
});
