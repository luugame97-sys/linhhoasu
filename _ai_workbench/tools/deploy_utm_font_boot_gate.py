#!/usr/bin/env python3
"""Install a boot gate so Egret starts only after the UTM webfont is loaded."""
import getpass
import hashlib
import os
import shutil
from datetime import datetime, timezone

import paramiko

HOST = '103.116.105.154'
REMOTE_ROOT = '/linhhoasu/webgame/game'
REMOTE_INDEX = REMOTE_ROOT + '/index.html'
REMOTE_FONT = REMOTE_ROOT + '/utm.ttf'
LOCAL_INDEX = r'I:\Linhhoasu\server\server\linhhoasu\webgame\game\index.html'
BACKUP_ROOT = r'I:\Linhhoasu\server\server\_ai_workbench\backups'
FONT_HASH = 'a3b36b3583e7a51097004c576eab6d980154b0679a14b8929fb63db881299108'
FONT_VERSION = FONT_HASH[:12]
RUN_EGRET = 'egret.runEgret({ renderMode: "webgl", audioType: 0 });'
RUN_GATE = 'runEgretAfterUtmFont();'
GATE_MARKER = '__lhsUtmFontBootGateV3'


GATE_CODE = f'''\n\tvar {GATE_MARKER} = true;
\tvar lhsUtmFontPromise = null;
\tfunction waitForLhsUtmFontMetrics(fontUrl) {{
\t\treturn new Promise(function (resolve) {{
\t\t\tvar sample = 'MWMWMW ĐĂÂÊÔƠƯ đăâêôơư 0123456789';
\t\t\tvar canvas = document.createElement('canvas');
\t\t\tvar context = canvas.getContext('2d');
\t\t\tcontext.font = '64px monospace';
\t\t\tvar fallbackWidth = context.measureText(sample).width;
\t\t\tvar probe = document.createElement('span');
\t\t\tprobe.textContent = sample;
\t\t\tprobe.setAttribute('aria-hidden', 'true');
\t\t\tprobe.style.cssText = 'position:absolute;left:-10000px;top:-10000px;visibility:hidden;white-space:nowrap;font:64px gothich,monospace';
\t\t\tdocument.body.appendChild(probe);
\t\t\tvar startedAt = Date.now();
\t\t\tvar timer = setInterval(function () {{
\t\t\t\tcontext.font = '64px gothich, monospace';
\t\t\t\tvar currentWidth = context.measureText(sample).width;
\t\t\t\tvar apiReady = document.fonts && typeof document.fonts.check === 'function' && document.fonts.check('64px gothich');
\t\t\t\tvar metricReady = Math.abs(currentWidth - fallbackWidth) > 0.5;
\t\t\t\tif (apiReady || metricReady || Date.now() - startedAt > 20000) {{
\t\t\t\t\tclearInterval(timer);
\t\t\t\t\tprobe.parentNode.removeChild(probe);
\t\t\t\t\tresolve({{ loaded: apiReady || metricReady, metricReady: metricReady, apiReady: apiReady, width: currentWidth, fallbackWidth: fallbackWidth, url: fontUrl }});
\t\t\t\t}}
\t\t\t}}, 50);
\t\t}});
\t}}
\tfunction ensureLhsUtmFont() {{
\t\tif (lhsUtmFontPromise) return lhsUtmFontPromise;
\t\tvar fontUrl = '/utm.ttf?v={FONT_VERSION}';
\t\twindow.__lhsUtmFontState = {{ status: 'loading', url: fontUrl }};
\t\tvar nativeLoad;
\t\tif (typeof FontFace === 'function' && document.fonts && typeof document.fonts.add === 'function') {{
\t\t\tvar fontFace = new FontFace('gothich', 'url("' + fontUrl + '") format("truetype")', {{ style: 'normal', weight: 'normal' }});
\t\t\tnativeLoad = fontFace.load().then(function (loadedFace) {{ document.fonts.add(loadedFace); return true; }});
\t\t}} else {{
\t\t\t// Older Egret WebViews expose CSS @font-face but not the FontFace API.
\t\t\t// Fetching warms the HTTP cache; the hidden DOM/canvas probe below
\t\t\t// forces the browser to decode and register the family before boot.
\t\t\tnativeLoad = fetch(fontUrl, {{ cache: 'force-cache' }}).then(function (response) {{
\t\t\t\tif (!response.ok) throw new Error('HTTP ' + response.status);
\t\t\t\treturn response.arrayBuffer();
\t\t\t}}).then(function () {{ return true; }});
\t\t}}
\t\tlhsUtmFontPromise = nativeLoad.then(function () {{
\t\t\treturn waitForLhsUtmFontMetrics(fontUrl);
\t\t}}).then(function (result) {{
\t\t\twindow.__lhsUtmFontState = {{ status: result.loaded ? 'loaded' : 'timeout', url: fontUrl, probe: result }};
\t\t\tif (result.loaded) document.documentElement.classList.add('lhs-utm-font-ready');
\t\t\treturn result.loaded;
\t\t}}).catch(function (error) {{
\t\t\twindow.__lhsUtmFontState = {{ status: 'error', url: fontUrl, message: String(error) }};
\t\t\tconsole.error('[LHS Font] Không tải được utm.ttf', error);
\t\t\treturn false;
\t\t}});
\t\treturn lhsUtmFontPromise;
\t}}
\tfunction runEgretAfterUtmFont() {{
\t\tensureLhsUtmFont().then(function () {{
\t\t\tif (window.egret && egret.TextField) egret.TextField.default_fontFamily = 'gothich';
\t\t\t{RUN_EGRET}
\t\t}});
\t}}
'''


def run(ssh, command):
    stdin, stdout, stderr = ssh.exec_command(command)
    out = stdout.read().decode('utf-8', 'replace')
    err = stderr.read().decode('utf-8', 'replace')
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(f'remote command failed ({code}): {err[-1000:]}')
    return out


def sha(data):
    return hashlib.sha256(data).hexdigest()


def patch_index(raw):
    text = raw.decode('utf-8-sig')
    # Replace any earlier boot-gate revision as one bounded block.
    old_gate = text.find('\tvar __lhsUtmFontBootGateV')
    anchor_pos = text.find('\tvar hashed_default_json;')
    if old_gate >= 0 and anchor_pos > old_gate:
        text = text[:old_gate] + GATE_CODE + '\n' + text[anchor_pos:]
    # Repair an earlier gate build that accidentally replaced the inner
    # egret.runEgret call with a recursive gate call.
    inner_bad = "if (window.egret && egret.TextField) egret.TextField.default_fontFamily = 'gothich';\n\t\t\trunEgretAfterUtmFont();"
    inner_good = "if (window.egret && egret.TextField) egret.TextField.default_fontFamily = 'gothich';\n\t\t\t" + RUN_EGRET
    if inner_bad in text:
        text = text.replace(inner_bad, inner_good, 1)
    if GATE_MARKER not in text:
        anchor = '\tvar hashed_default_json;'
        if anchor not in text:
            raise RuntimeError('index missing boot-gate insertion anchor')
        text = text.replace(anchor, GATE_CODE + '\n' + anchor, 1)
    # The last runEgret call is the original bootstrap call; the first one is
    # intentionally kept inside runEgretAfterUtmFont.
    last_run = text.rfind(RUN_EGRET)
    if text.count(RUN_GATE) == 0 and last_run >= 0:
        text = text[:last_run] + RUN_GATE + text[last_run + len(RUN_EGRET):]
    if text.count(RUN_GATE) != 1 or text.count(RUN_EGRET) != 1:
        raise RuntimeError('index does not call the UTM boot gate')
    # Keep every CSS/preload reference on the same cache-busted font artifact.
    text = text.replace("utm.ttf')", f"utm.ttf?v={FONT_VERSION}')")
    text = text.replace('utm.ttf")', f'utm.ttf?v={FONT_VERSION}")')
    text = text.replace('href="./utm.ttf"', f'href="./utm.ttf?v={FONT_VERSION}"')
    return text.encode('utf-8')


def main():
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    local_backup = os.path.join(BACKUP_ROOT, f'utm_font_boot_gate_before_{stamp}')
    os.makedirs(local_backup, exist_ok=True)
    if os.path.exists(LOCAL_INDEX):
        shutil.copy2(LOCAL_INDEX, os.path.join(local_backup, 'index.html'))

    password = getpass.getpass('VPS password (not logged): ')
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username='root', password=password, look_for_keys=False, allow_agent=False, timeout=15)
    try:
        current_font_hash = run(ssh, f"sha256sum {REMOTE_FONT} | cut -d' ' -f1").strip()
        if current_font_hash != FONT_HASH:
            raise RuntimeError(f'remote font hash changed: {current_font_hash}')
        sftp = ssh.open_sftp()
        try:
            with sftp.open(REMOTE_INDEX, 'rb') as src:
                raw = src.read()
        finally:
            sftp.close()
        patched = patch_index(raw)
        remote_backup = f'/linhhoasu/_ai_workbench/backups/utm_font_boot_gate_before_{stamp}'
        temp_remote = REMOTE_INDEX + f'.deploy-{stamp}.html'
        run(ssh, f"set -eu; mkdir -p {remote_backup}; cp -p {REMOTE_INDEX} {remote_backup}/index.html; cp -p {REMOTE_FONT} {remote_backup}/utm.ttf")
        sftp = ssh.open_sftp()
        try:
            with sftp.open(temp_remote, 'wb') as dst:
                dst.write(patched)
        finally:
            sftp.close()
        run(ssh, f"set -eu; grep -q '{GATE_MARKER}' {temp_remote}; grep -q '{RUN_GATE}' {temp_remote}; mv {temp_remote} {REMOTE_INDEX}; chmod 644 {REMOTE_INDEX}")
        with open(LOCAL_INDEX, 'wb') as dst:
            dst.write(patched)
        remote_hash = run(ssh, f"sha256sum {REMOTE_INDEX} | cut -d' ' -f1").strip()
        if remote_hash != sha(patched):
            raise RuntimeError('remote index hash does not match the deployed artifact')
        print(f'LOCAL_BACKUP={local_backup}')
        print(f'REMOTE_BACKUP={remote_backup}')
        print(f'INDEX_HASH={remote_hash}')
        print(f'FONT_HASH={current_font_hash}')
        print(f'FONT_VERSION={FONT_VERSION}')
    finally:
        ssh.close()


if __name__ == '__main__':
    main()
