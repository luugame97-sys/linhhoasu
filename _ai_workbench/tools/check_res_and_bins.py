import sys
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, r'i:/Linhhoasu/server/server/_ai_workbench/tools')
from snapshot_web_multiserver_20260906 import connect, run

ssh = connect()
print('=== GREP default.res*.bin FOR config_ ===')
print(run(ssh, "strings /linhhoasu/webgame/game/update/resource/default.res_*.bin | grep -E 'config_.*\\.bin' | sort -u"))

print('\n=== CHECK WHAT TABLES ARE IN config_fashion_20260909.bin ===')
check_tables_script = """
const fs = require('fs');
const zlib = require('zlib');
const { BinJsonUtil, ByteArray } = require('/linhhoasu/lhs/newServer/src/protocol/BinJsonUtil');

function checkBin(path) {
    console.log('Checking:', path);
    const buf = fs.readFileSync(path);
    let offset = 0;
    const tables = [];
    while (offset < buf.length) {
        const nameLen = buf.readUInt8(offset); offset += 1;
        const name = buf.toString('utf8', offset, offset + nameLen); offset += nameLen;
        const dataLen = buf.readUInt32BE(offset); offset += 4;
        offset += dataLen;
        tables.push(name);
    }
    console.log('Total tables:', tables.length);
    console.log('Has TopCombat:', tables.filter(t => t.includes('TopCombat')));
    console.log('Has CrossArena:', tables.filter(t => t.includes('CrossArena')));
}
try {
    checkBin('/linhhoasu/webgame/game/update/resource/assets/excel/config_fashion_20260909.bin');
} catch (e) { console.error(e); }
try {
    checkBin('/linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin');
} catch (e) { console.error(e); }
"""

with ssh.open_sftp().file('/linhhoasu/_ai_workbench/temp/check_bins.js', 'w') as f:
    f.write(check_tables_script)

print(run(ssh, "node /linhhoasu/_ai_workbench/temp/check_bins.js"))
run(ssh, "rm -f /linhhoasu/_ai_workbench/temp/check_bins.js")

ssh.close()
