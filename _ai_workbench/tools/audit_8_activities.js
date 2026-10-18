'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { BinJsonUtil, ByteArray } = require('../../linhhoasu/lhs/newServer/src/protocol/BinJsonUtil');

console.log('=== AUDIT 8 ACTIVITIES IN LINH HOA SU ===\n');

// 1. Table mapping
const ACTIVITIES = [
  {
    id: 1,
    nameVn: 'Bí Cảnh Luân Hồi / Luân Hồi Bí Cảnh',
    nameCn: '轮回秘境',
    handler: 'reborn.js',
    rpcTags: [5500, 5501, 5502, 5503],
    iconRes: 'minigame_bt_lunhuimijing',
    bannerRes: 'minigame_banner_lunhuimijing',
    chapterTable: 'RebornSimChapterConfig',
    baseTable: 'RebornSimBaseConfig',
    viewClass: 'RebornEntranceView'
  },
  {
    id: 2,
    nameVn: 'Tiểu Tướng Thần Binh / Thần Binh Tiểu Tướng',
    nameCn: '神兵小将',
    handler: 'invest-game.js',
    rpcTags: [5600, 5601, 5602],
    iconRes: 'minigame_bt_shenbingxiaojing',
    bannerRes: 'minigame_banner_shenbingxiaojiang',
    chapterTable: 'SoldierDefenseChapterConfig',
    baseTable: 'SoldierDefenseBaseConfig',
    viewClass: 'SoldierDefenseGameView'
  },
  {
    id: 3,
    nameVn: 'Tiên Tung Mê Vạn / Mê Cung Tiên Tung',
    nameCn: '仙踪迷云',
    handler: 'invest-game.js',
    rpcTags: [5600, 5601, 5602],
    iconRes: 'minigame_bt_xianzongmiyun',
    bannerRes: 'minigame_banner_xianzongmiyun',
    chapterTable: 'RelationshipNetChapterConfig',
    baseTable: 'RelationshipNetBaseConfig',
    viewClass: 'RelativeNetworkMainView'
  },
  {
    id: 4,
    nameVn: 'Đao Xoáy',
    nameCn: '旋转刀锋 / 旋刀',
    handler: 'invest-game.js',
    rpcTags: [5600, 5601, 5602],
    iconRes: 'minigame_bt_xuanzhuandaofeng',
    bannerRes: 'minigame_banner_xuanzhuandaofeng',
    chapterTable: 'RotateKnifeLevelConfig',
    baseTable: 'RelationshipNetBaseConfig / RotateKnifeBaseConfig',
    viewClass: 'RotateKnifeBattlePanel'
  },
  {
    id: 5,
    nameVn: 'Ải Tiên Thủ / Một Tiên Đương Quan',
    nameCn: '一仙当关 / 割草',
    handler: 'invest-game.js',
    rpcTags: [5600, 5601, 5602],
    iconRes: 'minigame_bt_gecao',
    bannerRes: 'minigame_gecao',
    chapterTable: 'SurviveRepeatRewardConfig',
    baseTable: 'SurviveBaseConfig',
    viewClass: 'SurviveBattlePanel'
  },
  {
    id: 6,
    nameVn: 'Bước Đăng Tiên / Một Bước Đăng Tiên',
    nameCn: '一步登仙',
    handler: 'invest-game.js',
    rpcTags: [5600, 5601, 5602],
    iconRes: 'minigame_bt_heropath',
    bannerRes: 'minigame_banner_heropath',
    chapterTable: 'HeroRoadLevelConfig',
    baseTable: 'HeroRoadBaseConfig',
    viewClass: 'HeroRoadMapPanel'
  },
  {
    id: 7,
    nameVn: 'Trừ Yêu Vệ Đạo',
    nameCn: '除妖卫道',
    handler: 'invest-game.js',
    rpcTags: [5600, 5601, 5602],
    iconRes: 'cywd_bt_chuyaoweidao',
    bannerRes: 'minigame_banner_chuyaoweidao',
    chapterTable: 'ExorciseChapterConfig',
    baseTable: 'ExorciseBaseConfig',
    viewClass: 'ExorciseMainView'
  },
  {
    id: 8,
    nameVn: 'Thiên Ân Chú Binh / Đúc Binh Thiên Lũy',
    nameCn: '铸兵天垒',
    handler: 'invest-game.js',
    rpcTags: [5600, 5601, 5602],
    iconRes: 'minigame_bt_zhubingtianlei',
    bannerRes: 'minigame_banner_zhubingtianlei',
    chapterTable: 'ShootDefenseChapterConfig',
    baseTable: 'ShootDefenseBaseConfig',
    viewClass: 'ShootDefenseMainWin'
  }
];

// Load manifest
const resManifest = JSON.parse(fs.readFileSync('linhhoasu/webgame/game/tools/parsed_configs/update/resource/default.res_cn_main_f70d4753.bin.json', 'utf8'));
const mainResManifest = JSON.parse(fs.readFileSync('linhhoasu/webgame/game/tools/parsed_configs/update/resource/default.res_main_c669f2c0.bin.json', 'utf8'));

// Load config binary
const binBuf = fs.readFileSync('linhhoasu/webgame/game/update/resource/assets/excel/config_fashion_20260909.bin');
let offset = 0;
const configTables = {};
while (offset < binBuf.length) {
    const nameLen = binBuf.readUInt8(offset); offset += 1;
    const name = binBuf.toString('utf8', offset, offset + nameLen); offset += nameLen;
    const dataLen = binBuf.readUInt32BE(offset); offset += 4;
    const compressed = binBuf.subarray(offset, offset + dataLen); offset += dataLen;
    configTables[name] = compressed;
}

const clientJs = fs.readFileSync('linhhoasu/webgame/game/js/main.min_drop100.js', 'utf8');

console.log('STT | ID | Tên Hoạt Động | Icon | Banner | Config Table | View Code | Server Handler');
console.log('---|---|---|---|---|---|---|---');

for (const act of ACTIVITIES) {
    // Check icon
    let iconFound = false;
    let iconUrl = '';
    const rIcon = resManifest.resources.find(r => r.name === act.iconRes) || mainResManifest.resources.find(r => r.name === act.iconRes);
    if (rIcon) {
        iconFound = fs.existsSync('linhhoasu/webgame/game/update/resource/' + rIcon.url);
        iconUrl = rIcon.url;
    }

    // Check banner
    let bannerFound = false;
    let bannerUrl = '';
    const rBanner = mainResManifest.resources.find(r => r.name === act.bannerRes) || resManifest.resources.find(r => r.name === act.bannerRes);
    if (rBanner) {
        bannerFound = fs.existsSync('linhhoasu/webgame/game/update/resource/' + rBanner.url);
        bannerUrl = rBanner.url;
    }

    // Check table
    const tableExists = !!configTables[act.chapterTable];

    // Check view
    const viewExists = clientJs.includes(act.viewClass);

    console.log(`${act.id} | ${act.id} | ${act.nameVn} | ${iconFound ? 'OK' : 'MISSING'} | ${bannerFound ? 'OK' : 'MISSING'} | ${tableExists ? 'OK (' + act.chapterTable + ')' : 'MISSING'} | ${viewExists ? 'OK (' + act.viewClass + ')' : 'MISSING'} | OK (${act.handler})`);
}

console.log('\n=== KIỂM TRA LOGIC CLIENT CẮT DANH SÁCH (TRUNCATION) ===');
const getGameListIdx = clientJs.indexOf('getGameList=function');
if (getGameListIdx !== -1) {
    const snippet = clientJs.substring(getGameListIdx, getGameListIdx + 700);
    console.log('Snippet getGameList:\n', snippet);
}

console.log('\n=== KIỂM TRA PANEL BỐ CỤC (LAYOUT) ===');
const setPanelPosIdx = clientJs.indexOf('setPanelPos=function');
if (setPanelPosIdx !== -1) {
    const snippet2 = clientJs.substring(setPanelPosIdx, setPanelPosIdx + 500);
    console.log('Snippet setPanelPos:\n', snippet2);
}

console.log('\n=== KIỂM TRA SKIN VÀ SUB-VIEWS CỦA 5 GAME CÒN LẠI ===');
const viewSkins = [
    { id: 4, name: 'RotateKnifeBattlePanel', skinHint: 'RotateKnife' },
    { id: 5, name: 'SurviveBattlePanel', skinHint: 'Survive' },
    { id: 6, name: 'HeroRoadMapPanel', skinHint: 'HeroRoad' },
    { id: 7, name: 'ExorciseMainView', skinHint: 'Exorcise' },
    { id: 8, name: 'ShootDefenseMainWin', skinHint: 'ShootDefense' }
];

const decContent = fs.readFileSync('_ai_workbench/temp/gameEui.dec', 'utf8');

for (const vs of viewSkins) {
    // Check in decContent for skin
    const skinRegex = new RegExp('[a-zA-Z0-9_]*' + vs.skinHint + '[a-zA-Z0-9_]*Skin', 'gi');
    const matchedSkins = decContent.match(skinRegex) || [];
    const uniqueSkins = Array.from(new Set(matchedSkins));
    console.log(`Game ${vs.id} (${vs.name}): Found skins in gameEui:`, uniqueSkins);
}
