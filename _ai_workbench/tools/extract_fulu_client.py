import sys
import io
import json
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.path.append(str(Path(__file__).resolve().parent))
from snapshot_web_multiserver_20260906 import connect, run

ssh = connect()
script = """
const fs = require('fs');
const content = fs.readFileSync('/linhhoasu/webgame/game/js/main.min_drop100.js', 'utf8');

const marker = '.OnActivityDrop=';
let pos = content.indexOf(marker);
if (pos !== -1) {
    console.log(`=== .OnActivityDrop at ${pos} ===`);
    console.log(content.substring(pos, pos + 500));
}
"""
out = run(ssh, "node", input_text=script)
print(out)
ssh.close()
