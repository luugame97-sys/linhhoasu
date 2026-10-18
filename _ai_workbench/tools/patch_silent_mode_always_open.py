"""Remove only the server-day gate from AutoOpenBox silent reward mode."""
from __future__ import annotations
import sys
from pathlib import Path

OLD_VIEW='Y.Config.ConstConfig.silenceDealOpenDay),i=t<T.serverOpenDay;this.silentModeOpenLab.text=B.strformatByLangId(30020299,t),this.silentModeOpenLab.visible=!i,this.silentModeLab.textColor=i?5067090:10000536,this.silentModeBox.selected=e.isSilentMode'
NEW_VIEW='Y.Config.ConstConfig.silenceDealOpenDay),i=!0;this.silentModeOpenLab.text=B.strformatByLangId(30020299,t),this.silentModeOpenLab.visible=!1,this.silentModeLab.textColor=5067090,this.silentModeBox.selected=e.isSilentMode'
OLD_CLICK='_.onSilentMode=function(){Y.Config.ConstConfig.silenceDealOpenDay>=T.serverOpenDay?(this.silentModeBox.selected=!1,U9.autoConfig.isSilentMode=!1):U9.autoConfig.isSilentMode=!U9.autoConfig.isSilentMode}'
NEW_CLICK='_.onSilentMode=function(){U9.autoConfig.isSilentMode=!U9.autoConfig.isSilentMode}'

def once(text,old,new,label):
    count=text.count(old)
    if count!=1: raise RuntimeError('%s expected 1 match got %d'%(label,count))
    return text.replace(old,new,1)

def main():
    main_js,index=map(Path,sys.argv[1:3])
    text=main_js.read_text(encoding='utf-8')
    text=once(text,OLD_VIEW,NEW_VIEW,'view gate')
    text=once(text,OLD_CLICK,NEW_CLICK,'click gate')
    if text.count('U9.autoConfig.isSilentMode')<3: raise RuntimeError('silent mode persistence/effect missing')
    main_js.write_text(text,encoding='utf-8',newline='')
    html=index.read_text(encoding='utf-8')
    marker='20260904_silent_reward_always_open1'
    if marker not in html:
        anchor='main.min_a6195824.js'
        if anchor not in html: raise RuntimeError('main script anchor missing')
        html=html.replace(anchor,anchor+'?v='+marker,1) if '?v=' not in html[html.index(anchor):html.index(anchor)+100] else html.replace(anchor,anchor,1)
        # Existing query strings are normalized separately below.
        import re
        html=re.sub(r'(main\.min_a6195824\.js)(?:\?v=[^"\']*)?',r'\1?v='+marker,html,count=1)
    index.write_text(html,encoding='utf-8',newline='')
    print('PATCHED',main_js,index)

if __name__=='__main__':main()
