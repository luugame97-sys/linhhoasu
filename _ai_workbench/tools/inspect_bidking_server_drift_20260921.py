import difflib
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from snapshot_web_multiserver_20260906 import connect

local = Path(__file__).resolve().parents[2] / 'linhhoasu' / 'lhs' / 'newServer' / 'src' / 'handlers' / 'bid-king.js'
ssh = connect()
try:
    with ssh.open_sftp() as sftp:
        remote = sftp.open('/linhhoasu/lhs/newServer/src/handlers/bid-king.js', 'rb').read()
    text = remote.decode('utf-8')
    nl = '\r\n' if '\r\n' in text else '\n'
    old_ensure = nl.join([
        '  info.illusRewardList = arr(info.illusRewardList).map((v) => int(v, 0)).filter((v) => v > 0);',
        '  info.bidKingReceipts = arr(info.bidKingReceipts).slice(-32);',
    ])
    new_ensure = nl.join([
        '  info.illusRewardList = arr(info.illusRewardList).map((v) => int(v, 0)).filter((v) => v > 0);',
        '  // Client BidKingModel.isCanGetIllusReward reads a separate claimed-character ledger.',
        '  // Keep it additive and do not alias pending item reward IDs.',
        '  info.characterReward = arr(info.characterReward).map((v) => int(v, 0)).filter((v) => v > 0);',
        '  info.bidKingReceipts = arr(info.bidKingReceipts).slice(-32);',
    ])
    old_payload = nl.join(['    characters: info.characters.slice(),','    sets: JSON.parse(JSON.stringify(info.sets)),'])
    new_payload = nl.join(['    characters: info.characters.slice(),','    characterReward: info.characterReward.slice(),','    sets: JSON.parse(JSON.stringify(info.sets)),'])
    derived = text.replace(old_ensure,new_ensure,1).replace(old_payload,new_payload,1)
    current = local.read_bytes().decode('utf-8')
    print('remote',len(remote),'derived',len(derived.encode()),'local',len(local.read_bytes()),'equal',derived==current,'normalized',derived.replace('\r\n','\n')==current.replace('\r\n','\n'))
    diff=''.join(difflib.unified_diff(derived.replace('\r\n','\n').splitlines(True),current.replace('\r\n','\n').splitlines(True),fromfile='derived',tofile='local'))
    print(diff[:12000].encode('unicode_escape').decode('ascii'))
finally:
    ssh.close()
