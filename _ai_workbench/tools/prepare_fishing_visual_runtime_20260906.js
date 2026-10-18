'use strict';
const fs=require('fs'),path=require('path'),acorn=require(path.resolve(__dirname,'../../linhhoasu/lhs/newServer/node_modules/acorn'));
const root=path.resolve(process.argv[2]);process.env.CONFIG_BIN_PATH=path.join(root,'server.bin');process.env.NODE_ENV='test';process.env.LOG_DIR='';
const config=require(path.join(root,'app/src/services/ConfigService'));const tables=config.loadAllTables();
fs.writeFileSync(path.join(root,'visual-config.json'),JSON.stringify(tables));
const source=fs.readFileSync(path.join(root,'main.fixed.js'),'utf8');
fs.writeFileSync(path.join(root,'visual-bootstrap.json'),JSON.stringify({sourceHash:require('crypto').createHash('sha256').update(source).digest('hex'),classes:['FishEntity','FishEntityData','FishMapRaid','FashionModel','GlobalManager'],offset:source.indexOf('function vye(')}));
