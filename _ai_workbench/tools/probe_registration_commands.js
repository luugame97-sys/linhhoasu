const { packRequest, unpackResponse } = require('../../linhhoasu/lhs/newServer/src/protocol/ReqCodec');

const URL = 'http://103.116.105.154:81/gameMsg.do';

async function call(cmd, params) {
  const response = await fetch(URL, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body: packRequest(cmd, params),
  });
  const body = unpackResponse(Buffer.from(await response.arrayBuffer()));
  console.log(JSON.stringify({
    cmd,
    http: response.status,
    ret: body && body.ret,
    code: body && body.code,
    errInfo: body && body.errInfo,
    roleCount: body && Array.isArray(body.roles) ? body.roles.length : undefined,
  }));
}

(async () => {
  const account = `probe_reg_${Date.now()}`;
  const password = 'NoSuchPass9';
  // 2818 cannot mutate because this account is guaranteed not to exist.
  await call(2818, { account, password, serverId: 1001 });
  // 2821 is safe before enabling registration: invite-only gate returns first.
  await call(2821, { account, password, confirmPassword: password });
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
