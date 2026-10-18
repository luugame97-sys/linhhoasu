'use strict';
process.env.WS_PUBLIC_PORT = '81';
process.env.WS_PUBLIC_PATH = '/ws';
for (const [sid, path] of [[1002, '/ws-s2'], [1003, '/ws-s3'], [1004, '/ws-s4'], [1005, '/ws-s5'], [1006, '/ws-s6']]) {
  process.env[`WS_PUBLIC_PORT_${sid}`] = '81';
  process.env[`WS_PUBLIC_PATH_${sid}`] = path;
}
const serverList = require('/linhhoasu/lhs/newServer/src/handlers/serverList');
for (const [host, proto] of [['linhhoasu.lol', 'https'], ['linhhoasu.lol', 'http'], ['103.116.105.154:81', 'http']]) {
  const req = { hostname: host.split(':')[0], headers: { host, 'x-forwarded-host': host, 'x-forwarded-proto': proto } };
  console.log(JSON.stringify({ host, proto, s1: serverList.buildWsEndpoint(req, 1001), s6: serverList.buildWsEndpoint(req, 1006) }));
}
