import sys
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, r'i:/Linhhoasu/server/server/_ai_workbench/tools')
from snapshot_web_multiserver_20260906 import connect, run

ssh = connect()
script = """
const fs = require('fs');
const zlib = require('zlib');
const { BinJsonUtil, ByteArray } = require('/linhhoasu/lhs/newServer/src/protocol/BinJsonUtil');

function readTable(path, targetName) {
    const buf = fs.readFileSync(path);
    let offset = 0;
    while (offset < buf.length) {
        const nameLen = buf.readUInt8(offset); offset += 1;
        const name = buf.toString('utf8', offset, offset + nameLen); offset += nameLen;
        const dataLen = buf.readUInt32BE(offset); offset += 4;
        const compressed = buf.subarray(offset, offset + dataLen); offset += dataLen;
        if (name === targetName) {
            const inflated = zlib.inflateSync(compressed);
            const value = BinJsonUtil.readFullJson(new ByteArray(inflated.buffer.slice(inflated.byteOffset, inflated.byteOffset + inflated.byteLength)));
            return value;
        }
    }
    return null;
}

const fDay = readTable('/linhhoasu/webgame/game/update/resource/assets/excel/config_fashion_20260909.bin', 'TopCombatDayRankRewardConfig');
console.log('config_fashion_20260909.bin TopCombatDay row 1:', JSON.stringify(fDay[1]));
console.log('config_fashion_20260909.bin TopCombatDay row 2:', JSON.stringify(fDay[2]));
console.log('config_fashion_20260909.bin TopCombatDay row 5:', JSON.stringify(fDay[5]));
"""

with ssh.open_sftp().file('/linhhoasu/_ai_workbench/temp/check_fashion_bin.js', 'w') as f:
    f.write(script)

print(run(ssh, "node /linhhoasu/_ai_workbench/temp/check_fashion_bin.js"))
run(ssh, "rm -f /linhhoasu/_ai_workbench/temp/check_fashion_bin.js")
ssh.close()
