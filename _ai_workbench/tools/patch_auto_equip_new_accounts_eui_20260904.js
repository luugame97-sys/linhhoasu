'use strict';
throw new Error('DEPRECATED: full gameEui repack stalls in this project; the deployed fix uses native runtime EUI components in main.min_a6195824.js');
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'..','..'),app=path.join(root,'linhhoasu','lhs','newServer');
const {BinJsonUtil,ByteArray}=require(path.join(app,'src','protocol','BinJsonUtil'));
function decode(file){return BinJsonUtil.readFullJson(new ByteArray(zlib.inflateSync(fs.readFileSync(file))))}
function encode(value){const data=new ByteArray();BinJsonUtil.json2bin(value,data);return zlib.deflateSync(Buffer.from(data.rawBuffer,data.bufferOffset,data.length))}
const file=path.resolve(process.argv[2]);const skins=decode(file),panel=skins.AutoOpenBoxPanelSkin;
if(!panel||!panel._Group16||!Array.isArray(panel._Group16.$eleC)||!Array.isArray(panel.$sP))throw new Error('AutoOpenBoxPanelSkin anchors missing');
if(panel.autoDelegateBox||panel.autoDelegateLabel||panel._GroupAutoDelegate)throw new Error('dedicated auto-equip control already exists');
panel._GroupAutoDelegate={left:270,top:13,height:40,width:300,visible:true,$t:'$eG',layout:'_BasicLayout6',$eleC:['autoDelegateBox','autoDelegateLabel']};
panel.autoDelegateBox={left:0,scaleX:.8,scaleY:.8,skinName:'CheckBox1Skin',verticalCenter:0,$t:'$eCB'};
panel.autoDelegateLabel={bold:true,fontFamily:'Microsoft YaHei',left:53,size:18,text:'Tự mặc đồ mạnh hơn',textColor:5067090,verticalCenter:0,$t:'$eL'};
panel._Group16.$eleC.push('_GroupAutoDelegate');panel.$sP.push('autoDelegateBox','autoDelegateLabel','_GroupAutoDelegate');
fs.writeFileSync(file,encode(skins));
console.log(JSON.stringify({result:'PASS',file,bytes:fs.statSync(file).size,group:panel._GroupAutoDelegate,label:panel.autoDelegateLabel.text}));
