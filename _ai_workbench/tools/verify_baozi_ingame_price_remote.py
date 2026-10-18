"""Read-only verification of Baozi price rows from production ConfigService."""
from __future__ import annotations

import base64
import getpass
import hashlib
import json
from pathlib import Path

import paramiko


HOST = "103.116.105.154"
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "temp" / "baozi_ingame_price_remote_20260901.json"
NODE = r'''
const fs=require('fs'); const crypto=require('crypto');
const C=require('/linhhoasu/lhs/newServer/src/services/ConfigService');
const s=C.get('ShopConfig')||{};
const baozi=[];
for(const [key,row] of Object.entries(s)){
  const rewards=Array.isArray(row.rewards)?row.rewards:[];
  const cost=Array.isArray(row.cost)?row.cost:[];
  const count=rewards.filter(x=>Number(x&&x.id)===4).reduce((sum,x)=>sum+Math.max(0,Number(x.count)||0),0);
  const diamond=cost.filter(x=>Number(x&&x.id)===1).reduce((sum,x)=>sum+Math.max(0,Number(x.count)||0),0);
  if(count>0&&diamond>0) baozi.push({key,id:row.id,cost,rewards,limit:row.limit,limitType:row.limitType,baoziCount:count,diamondCost:diamond});
}
const candidates=[process.env.CONFIG_BIN_PATH,'/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin','/linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin'].filter(Boolean);
const configPath=candidates.find(p=>fs.existsSync(p))||'';
const sha=configPath?crypto.createHash('sha256').update(fs.readFileSync(configPath)).digest('hex'):'';
console.log(JSON.stringify({readOnly:true,configPath,configSha256:sha,directBaoziDiamondRows:baozi,baoziBundle:s['11001']||null,speedCharmStandalone:s['1000002']||null}));
'''


def main() -> None:
    password = getpass.getpass("Production password (not logged): ")
    encoded = base64.b64encode(NODE.encode()).decode()
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False,
                allow_agent=False, timeout=20, banner_timeout=20, auth_timeout=20)
    try:
        command = f"cd /linhhoasu/lhs/newServer && node -e \"eval(Buffer.from('{encoded}','base64').toString('utf8'))\""
        _, stdout, stderr = ssh.exec_command(command, timeout=90)
        output = stdout.read().decode("utf-8", "replace").strip()
        error = stderr.read().decode("utf-8", "replace")
        code = stdout.channel.recv_exit_status()
    finally:
        ssh.close()
    if code:
        raise SystemExit(error or output or f"remote exit={code}")
    line = output.splitlines()[-1]
    data = json.loads(line)
    local = ROOT.parent / "linhhoasu" / "webgame" / "game" / "update" / "resource" / "assets" / "excel" / "config_e5ac72c2.bin"
    data["localConfigSha256"] = hashlib.sha256(local.read_bytes()).hexdigest() if local.is_file() else ""
    data["hashesMatch"] = bool(data["configSha256"] and data["configSha256"] == data["localConfigSha256"])
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(data, ensure_ascii=False, indent=2))
    print(f"OUT={OUT}")


if __name__ == "__main__":
    main()
