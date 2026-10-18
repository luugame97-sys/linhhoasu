/* Read-only production probe: cmd 2817 must be rejected while invite-only mode is on. */
const { packRequest, unpackResponse } = require('../../linhhoasu/lhs/newServer/src/protocol/ReqCodec');

const target = process.argv[2] || 'http://103.116.105.154:81/gameMsg.do';

(async () => {
  const response = await fetch(target, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body: packRequest(2817, { withPWD: true, openId: `probe_${Date.now()}` }),
  });
  const body = unpackResponse(Buffer.from(await response.arrayBuffer()));
  console.log(JSON.stringify({ http: response.status, body }));
  if (Number(response.status) !== 200 || !body || body.code !== 'RANDOM_REGISTER_DISABLED') {
    process.exitCode = 2;
  }
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
