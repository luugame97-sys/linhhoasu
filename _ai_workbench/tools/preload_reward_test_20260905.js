'use strict';
const path=require('node:path');
const app=process.env.LHS_APP_ROOT||process.env.APP_ROOT;
if(app){
  const ps=require(path.join(app,'src/services/PlayerService'));
  ps.savePlayer=async(_id,p)=>p;
  ps.savePlayerDeferred=async(_id,p)=>p;
}
