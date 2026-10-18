// Exact mechanical integration into the existing client, preserving native picker.
const fs=require('fs'), path=require('path');
const root=path.resolve(__dirname,'../temp/sso_release_20260930');
function file(p){return path.join(root,'candidate',p);}
function replace(s,a,b){if(s.split(a).length!==2)throw Error('Anchor mismatch: '+a.slice(0,90));return s.replace(a,b);}
let p=file('webgame/game/index.html'),s=fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n');
const start=s.indexOf('\twindow.__lhsPortalAuth = null;'),end=s.indexOf('\tvar nativeJsMap;',start);
if(start<0||end<0)throw Error('bootstrap anchors');
s=s.slice(0,start)+s.slice(end);
const waitStart=s.indexOf("\t\tif (window.__lhsPortalReady &&"),waitEnd=s.indexOf('\t\tvar isMainScript',waitStart);
if(waitStart<0||waitEnd<0)throw Error('wait anchors');s=s.slice(0,waitStart)+s.slice(waitEnd);
const hookStart=s.indexOf('\t\t\tif (isEgretexScript && window.__lhsPortalAuth'),hookEnd=s.indexOf('\n\n',s.indexOf('\n\t\t\t}',hookStart)+4);
if(hookStart<0||hookEnd<0)throw Error('hook anchors');s=s.slice(0,hookStart)+s.slice(hookEnd);
s=replace(s,"if (frame && frame.src === 'about:blank') frame.src = frame.getAttribute('data-src');","if (window.LhsPortalOpen) window.LhsPortalOpen();");
s=replace(s,'if (moving || !modal.hidden) return scheduleIdle();',"if (moving || !modal.hidden || trigger.classList.contains('lhs-web-popup--giftcode-alert')) return scheduleIdle();");
fs.writeFileSync(p,s.replace(/\n/g,'\r\n'));
p=file('webgame/game/js/main.min_drop100.js');s=fs.readFileSync(p,'utf8');
s=replace(s,'b._LoginLaunch=function(){','b._LoginLaunch=function(){if(window.LhsPortalLaunch)return window.LhsPortalLaunch(this);');fs.writeFileSync(p,s);
