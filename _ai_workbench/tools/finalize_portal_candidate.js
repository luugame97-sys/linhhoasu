const fs=require('fs'),path=require('path');
const w=path.resolve(__dirname,'../temp/sso_release_20260930');
function once(s,a,b){if(s.split(a).length!==2)throw Error('anchor '+a);return s.replace(a,b);}
// Rebuild only our candidate from immutable live snapshot, avoiding abandoned bootstrap drafts.
let s=fs.readFileSync(path.join(w,'before/webgame/game/index.html'),'utf8').replace(/\r\n/g,'\n');
s=once(s,"if (frame && frame.src === 'about:blank') frame.src = frame.getAttribute('data-src');","if (window.LhsPortalOpen) window.LhsPortalOpen();");
s=once(s,'if (moving || !modal.hidden) return scheduleIdle();',"if (moving || !modal.hidden || trigger.classList.contains('lhs-web-popup--giftcode-alert')) return scheduleIdle();");
s=once(s,'<span class="lhs-web-popup__label">WEB</span>','<span class="lhs-web-popup__label">WEB</span>\n<span class="lhs-web-popup__notice" aria-live="polite">Có giftcode mới, bấm để nhập</span>');
s=once(s,'"js/main.min_drop100.js?v=20260930_reg_domain_v1",','"js/main.min_drop100.js?v=20260930_portal_v1",\n"js/lhs-portal-v1.js?v=20260930_portal_v1",');
s=once(s,'</head>',`<style>
.lhs-web-popup__notice{display:none;position:absolute;width:210px;max-width:calc(100vw - 24px);padding:9px 12px;box-sizing:border-box;border:1px solid #f59e0b;border-radius:12px;background:#fff7ed;color:#9a3412;box-shadow:0 6px 18px #0005;font:700 13px/1.4 Arial,sans-serif;pointer-events:none;text-align:left;letter-spacing:0}
#lhs-web-popup.lhs-web-popup--giftcode-alert .lhs-web-popup__notice{display:block}
#lhs-web-popup.lhs-web-popup--giftcode-alert .lhs-web-popup__image{animation:lhsGiftShake 2.8s ease-in-out infinite}
@keyframes lhsGiftShake{0%,70%,100%{transform:rotate(0)}73%,81%{transform:rotate(-6deg)}77%,85%{transform:rotate(6deg)}89%{transform:rotate(0)}}
@media(prefers-reduced-motion:reduce){#lhs-web-popup.lhs-web-popup--giftcode-alert .lhs-web-popup__image{animation:none}}
</style>\n</head>`);
fs.writeFileSync(path.join(w,'candidate/webgame/game/index.html'),s.replace(/\n/g,'\r\n'));
