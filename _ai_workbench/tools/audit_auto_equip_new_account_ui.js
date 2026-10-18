'use strict';

const fs=require('node:fs');
const path=require('node:path');
const zlib=require('node:zlib');

const root=path.resolve(__dirname,'..','..');
const app=path.join(root,'linhhoasu','lhs','newServer');
const {BinJsonUtil,ByteArray}=require(path.join(app,'src','protocol','BinJsonUtil'));

function decode(filePath){
  const raw=fs.readFileSync(filePath);
  return BinJsonUtil.readFullJson(new ByteArray(zlib.inflateSync(raw)));
}

const input=path.resolve(process.argv[2]||path.join(root,'linhhoasu','webgame','game','update','resource','assets','cfg','gameEui_18e11b8e.bin'));
const data=decode(input);
const skin=data.AutoOpenBoxPanelSkin;
if(!skin) throw new Error('AutoOpenBoxPanelSkin missing');
const output=path.join(root,'_ai_workbench','temp','auto_equip_new_account_skin_20260904.json');
const payload={
  input,
  keys:Object.keys(skin),
  states:skin.$s||skin.states||null,
  stateProperties:skin.$sP||null,
  powerCheckBox:skin.powerCheckBox||null,
  powerLab:skin.powerLab||null,
  rootElements:skin.$eleC||null,
  skin,
};
fs.writeFileSync(output,JSON.stringify(payload,null,2)+'\n');
console.log(JSON.stringify({result:'PASS',input,output,keys:payload.keys,states:payload.states,stateProperties:payload.stateProperties,powerCheckBox:payload.powerCheckBox,powerLab:payload.powerLab}));
