"""Read-only comparison of scoped public client files on the known game host."""
import hashlib
import json
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect

ROOT = Path(__file__).resolve().parents[2]
RELATIVE = [
    'js/main.min_a6195824.js',
    'js/egret.min_7d668222.js',
    'update/resource/assets/excel/config_e5ac72c2.bin',
    'update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin',
    'update/resource/assets/cfg/gameEui_18e11b8e.bin',
    'update/resource/assets/cfg/fnt_pack_128141c4.bin',
    'update/resource/assets/cfg/lang_cn/fnt_lang_pack_3f07747f.bin',
    'update/resource/assets/atlas_font/font_num_prop/lang_cn/font_num_prop_d1529ac2.png',
]

if __name__ == '__main__':
    ssh = connect()
    try:
        with ssh.open_sftp() as sftp:
            results = []
            for rel in RELATIVE:
                with sftp.open('/linhhoasu/webgame/game/' + rel, 'rb') as handle:
                    remote = hashlib.sha256(handle.read()).hexdigest()
                local = hashlib.sha256((ROOT / 'linhhoasu/webgame/game' / rel).read_bytes()).hexdigest()
                results.append(dict(file=rel, remote=remote, local=local, match=remote == local))
            print(json.dumps(dict(readOnly=True, files=results), indent=2))
    finally:
        ssh.close()
