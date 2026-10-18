"""Publish one addon line against the verified live index, preserving all other bytes."""
import json, hashlib, stat, shlex, datetime
from pathlib import Path
from giftcode_bridge_release_20261010 import connect, run

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench/temp/giftcode_bridge_20261010'
BASE = OUT / 'baseline/index.html'
INDEX = '/linhhoasu/webgame/game/index.html'
JS = '/linhhoasu/webgame/game/js/lhs-giftcode-mail-notice-v1.js'
LOCAL_JS = ROOT / 'linhhoasu/webgame/game/js/lhs-giftcode-mail-notice-v1.js'
ORIGINAL = 'd83b22ced285c6a2c3b3fe59812dd923ad23b0237ac1daa015e6cdb9a930be97'
INTERIM = '9252eeea8e87379dbff593f677a10ff26a5a8455f18389f5f58470cb9e7eea4e'

def sha(value): return hashlib.sha256(value).hexdigest()

def main():
    before = BASE.read_bytes(); assert sha(before) == ORIGINAL
    anchor = b'"js/lhs-artifact-quench-v1.js?v=20261010_quench_v1",'
    marker = b'"js/lhs-giftcode-mail-notice-v1.js?v=20261010_giftcode_mail_notice_v1",'
    assert before.count(anchor)==1 and marker not in before
    end = before.index(b'\n', before.index(anchor)) + 1
    eol = b'\r\n' if before[end-2:end] == b'\r\n' else b'\n'
    inserted = b'\t\t'+marker+eol
    candidate = before[:end]+inserted+before[end:]
    assert candidate.replace(inserted,b'',1) == before
    s=connect()
    try:
        with s.open_sftp() as sf:
            live = sf.open(INDEX,'rb').read(); attrs=sf.stat(INDEX)
            assert sha(live) in [INTERIM, ORIGINAL], 'INDEX_DRIFT_STOP'
            assert sha(sf.open(JS,'rb').read()) == sha(LOCAL_JS.read_bytes())
            backup='/linhhoasu/_ai_workbench/backups/giftcode_notice_'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d_%H%M%S')
            run(s,'install -d -m 700 '+shlex.quote(backup))
            # Preserve pre-turn baseline and the interim index for incident trace.
            with sf.open(backup+'/index.before.html','wb') as f: f.write(before)
            sf.chmod(backup+'/index.before.html',0o600)
            run(s,'cp -a '+shlex.quote(INDEX)+' '+shlex.quote(backup+'/index.interim.html'))
            tmp=INDEX+'.giftcode-notice.tmp'
            with sf.open(tmp,'wb') as f: f.write(candidate)
            sf.chown(tmp,attrs.st_uid,attrs.st_gid);sf.chmod(tmp,stat.S_IMODE(attrs.st_mode))
            assert sha(sf.open(INDEX,'rb').read())==sha(live), 'INDEX_CAS_STOP'
            sf.posix_rename(tmp,INDEX)
            assert sf.open(INDEX,'rb').read()==candidate
            assert run(s,'runuser -u www -- test -r '+shlex.quote(INDEX))==''
            run(s,'node --check '+shlex.quote(JS))
            receipt={'status':'DEPLOYED_STATIC','backup':backup,'originalIndex':ORIGINAL,
                     'interimIndex':sha(live),'indexSha256':sha(candidate),'addonSha256':sha(LOCAL_JS.read_bytes()),
                     'delta':'exactly one addon line vs pre-turn live index','mode':oct(stat.S_IMODE(attrs.st_mode)),
                     'uid':attrs.st_uid,'gid':attrs.st_gid,'restarted':False,'playerWrites':0}
            (OUT/'notice_release.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8')
            (OUT/'index.notice.live.html').write_bytes(candidate)
            print(json.dumps(receipt,indent=2))
    finally:s.close()

if __name__=='__main__': main()
