'use strict';
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'../..'),source=fs.readFileSync(path.join(root,'_ai_workbench/temp/cross_rival_20261015/baseline/web/js/main.min_drop200.js'),'utf8');
for(const name of process.argv.slice(2)){
 const re=new RegExp('c\\.'+name+'=function','g');let match;
 while((match=re.exec(source))){const end=source.indexOf('},c.',match.index);console.log(source.slice(match.index,Math.min(end+1,match.index+22000)));}
}
