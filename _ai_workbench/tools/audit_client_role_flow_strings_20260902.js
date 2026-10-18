'use strict';
const fs = require('fs');
const path = require('path');
const file = path.resolve(__dirname, '..', '..', 'linhhoasu', 'webgame', 'game', 'js', 'main.min_a6195824.js');
const source = fs.readFileSync(file, 'utf8');
const patterns = [
  'RegistUI', 'RegisterAccount', 'AccountUserLogin', 'SDKAuth',
  'RoleCreateView', 'sendKungfuSwitch', 'checkCloseRoleViewAB',
  'roleInfo.kungfuId', 'newCreated', 'SetUserLoginInfo',
];
const result = { file, bytes: Buffer.byteLength(source), patterns: {} };
for (const pattern of patterns) {
  const count = source.split(pattern).length - 1;
  result.patterns[pattern] = { count, present: count > 0 };
}
result.contract = {
  registerProtocol: source.includes('RegisterAccount=function') && source.includes('requestJson(2818'),
  sdkAuthProtocol: source.includes('SDKAuth=function') && source.includes('requestJson(2820'),
  roleCreateView: source.includes('RoleCreateViewSkin'),
  selectionRpc: source.includes('sendKungfuSwitch') && source.includes('Rpc(3100'),
  unselectedRoleBranch: source.includes('0==a.roleInfo.kungfuId') && source.includes('P.ins().open(S1'),
};
console.log(JSON.stringify(result, null, 2));
