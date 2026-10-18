'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const appRoot = path.resolve(__dirname, '..', '..', 'linhhoasu', 'lhs', 'newServer');
const { BinJsonUtil, ByteArray } = require(path.join(appRoot, 'src', 'protocol', 'BinJsonUtil'));

function decode(filePath) {
  const raw = fs.readFileSync(filePath);
  return BinJsonUtil.readFullJson(new ByteArray(zlib.inflateSync(raw)));
}

function encode(value) {
  const data = new ByteArray();
  BinJsonUtil.json2bin(value, data);
  const payload = Buffer.from(data.rawBuffer, data.bufferOffset, data.length);
  return zlib.deflateSync(payload);
}

function patchObject(skin) {
  const panel = skin.AutoOpenBoxPanelSkin;
  if (!panel || !panel._Group16 || !Array.isArray(panel._Group16.$eleC)) {
    throw new Error('AutoOpenBoxPanelSkin/_Group16 anchor missing');
  }
  if (panel.autoDelegateBox || panel._GroupAutoDelegate) return false;

  panel._GroupAutoDelegate = {
    left: 0,
    top: 190,
    height: 40,
    width: 526,
    visible: true,
    $t: '$eG',
    layout: '_BasicLayout6',
    $eleC: ['autoDelegateBox', 'autoDelegateLabel'],
  };
  panel.autoDelegateBox = {
    left: 0,
    scaleX: 0.8,
    scaleY: 0.8,
    skinName: 'CheckBox1Skin',
    verticalCenter: 0,
    $t: '$eCB',
  };
  panel.autoDelegateLabel = {
    bold: true,
    fontFamily: 'Microsoft YaHei',
    left: 53,
    size: 22,
    text: 'Tự mặc đồ mạnh, bán đồ yếu',
    textColor: 5067090,
    verticalCenter: 0,
    $t: '$eL',
  };
  panel._Group16.$eleC.push('_GroupAutoDelegate');
  panel.$sP = Array.isArray(panel.$sP) ? panel.$sP : [];
  panel.$sP.push('autoDelegateBox', 'autoDelegateLabel', '_GroupAutoDelegate');
  panel._Group16.height = Math.max(Number(panel._Group16.height) || 210, 250);
  return true;
}

function patch(filePath) {
  const skin = decode(filePath);
  const changed = patchObject(skin);
  if (changed) fs.writeFileSync(filePath, encode(skin));
  console.log(JSON.stringify({ file: filePath, changed, bytes: fs.statSync(filePath).size }));
}

for (const filePath of process.argv.slice(2)) {
  if (!filePath) continue;
  patch(path.resolve(filePath));
}
