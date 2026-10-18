"""Verify iframe asset prefix and player-facing notice removal, read-only."""
import json
import re
from datetime import datetime, timezone
from pathlib import Path

from snapshot_web_multiserver_20260906 import WB, connect, run

OUT = WB / 'temp' / 'portal_bg_fix_20260907'

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    ssh = connect()
    try:
        command = r'''set -e
direct=$(curl -fsS --max-time 10 http://127.0.0.1:88/login.php)
iframe=$(curl -fsS -H 'X-Forwarded-Prefix: /web-panel' --max-time 10 http://127.0.0.1:88/login.php)
direct_bg=$(printf '%s' "$direct" | grep -F -- '--site-bg-image' | head -1)
iframe_bg=$(printf '%s' "$iframe" | grep -F -- '--site-bg-image' | head -1)
notice_direct=$(printf '%s' "$direct" | grep -F -c 'Tài khoản được đăng ký trực tiếp trong game.' || true)
notice_iframe=$(printf '%s' "$iframe" | grep -F -c 'Tài khoản được đăng ký trực tiếp trong game.' || true)
image_headers=$(curl -fsSI --max-time 10 http://127.0.0.1:81/web-panel/assets/images/bg_upload_20260829_173004_546bb5.png)
direct_status=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:88/login.php)
iframe_status=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:81/web-panel/login.php)
image_status=$(curl -sS -o /dev/null -w '%{http_code} %{size_download} %{content_type}' --max-time 10 http://127.0.0.1:81/web-panel/assets/images/bg_upload_20260829_173004_546bb5.png)
printf 'DIRECT_BG=%s\nIFRAME_BG=%s\nNOTICE_DIRECT=%s\nNOTICE_IFRAME=%s\nDIRECT_STATUS=%s\nIFRAME_STATUS=%s\nIMAGE_STATUS=%s\nIMAGE_HEADERS<<EOF\n%s\nEOF\n' "$direct_bg" "$iframe_bg" "$notice_direct" "$notice_iframe" "$direct_status" "$iframe_status" "$image_status" "$image_headers"
sha256sum /linhhoasu/webgame/gm/config.php /linhhoasu/webgame/gm/login.php
'''
        text = run(ssh, command)
        (OUT / 'http-proof.txt').write_text(text, encoding='utf-8')
        def value(key):
            match = re.search(r'^' + re.escape(key) + r'=(.*)$', text, re.MULTILINE)
            if not match:
                raise RuntimeError('MISSING_' + key)
            return match.group(1).strip()
        direct_bg = value('DIRECT_BG')
        iframe_bg = value('IFRAME_BG')
        if "url('/assets/images/" not in direct_bg:
            raise RuntimeError('DIRECT_PREFIX_CHANGED')
        if "url('/web-panel/assets/images/" not in iframe_bg:
            raise RuntimeError('IFRAME_PREFIX_MISSING')
        if value('NOTICE_DIRECT') != '0' or value('NOTICE_IFRAME') != '0':
            raise RuntimeError('PLAYER_NOTICE_STILL_PRESENT')
        if value('DIRECT_STATUS') != '200' or value('IFRAME_STATUS') != '200':
            raise RuntimeError('LOGIN_HTTP_FAILED')
        image_parts = value('IMAGE_STATUS').split()
        if len(image_parts) != 3 or image_parts[0] != '200' or int(image_parts[1]) < 100000 or image_parts[2] != 'image/png':
            raise RuntimeError('BACKGROUND_ASSET_FAILED')
        result = {
            'result': 'PASS', 'readOnly': True,
            'directBackground': direct_bg, 'iframeBackground': iframe_bg,
            'noticeDirect': 0, 'noticeIframe': 0,
            'directStatus': value('DIRECT_STATUS'), 'iframeStatus': value('IFRAME_STATUS'),
            'imageStatus': value('IMAGE_STATUS'),
            'productionDataWrites': 0,
            'at': datetime.now(timezone.utc).isoformat(),
        }
        (OUT / 'verification.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(json.dumps(result, ensure_ascii=False))
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
