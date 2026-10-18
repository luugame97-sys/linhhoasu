'use strict';
// Tests use runtime dependencies/source with only these candidate modules overlaid.
const fs=require('fs'),path=require('path'),Module=require('module');
const app='/linhhoasu/lhs/newServer',candidate=process.env.FASHION_CANDIDATE_ROOT;
if(!candidate||!candidate.startsWith('/linhhoasu/_ai_workbench/temp/fashion_box_29040_20260907/'))throw Error('OVERLAY_PATH');
const relative=['src/services/FashionBoxService.js','src/services/FashionBoxRepairService.js','src/services/RewardGrantService.js'];
const map=Object.fromEntries(relative.map(p=>[path.join(app,p),path.join(candidate,p)]));
const original=Module._extensions['.js'];Module._extensions['.js']=function(module,filename){if(map[filename])module._compile(fs.readFileSync(map[filename],'utf8'),filename);else original(module,filename);};
// New modules do not exist in production until deployment.
const resolve=Module._resolveFilename;Module._resolveFilename=function(request,parent,...rest){if(path.isAbsolute(request)||(parent&&request.startsWith('.'))){const proposed=path.resolve(parent?path.dirname(parent.filename):app,request)+(!path.extname(request)?'.js':'');if(map[proposed])return proposed;}return resolve.call(this,request,parent,...rest);};
