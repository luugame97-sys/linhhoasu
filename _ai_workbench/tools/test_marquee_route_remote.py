"""Authenticated but non-mutating route smoke for the marquee endpoint."""
from __future__ import annotations

import base64
import getpass
import json
from pathlib import Path

import paramiko

HOST = "103.116.105.154"
ROOT = Path(__file__).resolve().parents[1]
NODE = r'''require('/linhhoasu/lhs/newServer/node_modules/dotenv').config({path:'/linhhoasu/lhs/newServer/.env',override:false});
const crypto=require('crypto');
const {signInternalRequest}=require('/linhhoasu/lhs/newServer/src/utils/internalAuth');
const envConfig=require('/linhhoasu/lhs/newServer/ecosystem.config.js');
(async()=>{const path='/api/internal/broadcast/marquee';const body={text:''};const app=(envConfig.apps||[]).find(x=>x.name==='lhs-s1001')||{};const keys=[app.env&&app.env.API_KEY,process.env.API_KEY,process.env.LHS_INTERNAL_API_KEY,process.env.DIST_API_KEY].map(x=>String(x||'')).filter((x,i,a)=>x&&a.indexOf(x)===i);const attempts=[];for(const key of keys){const timestamp=Date.now();const nonce=crypto.randomBytes(12).toString('hex');const signature=signInternalRequest({secret:key,method:'POST',path,timestamp,nonce,body});const r=await fetch('http://127.0.0.1:8080'+path,{method:'POST',headers:{'Content-Type':'application/json','X-API-Key':key,'X-Timestamp':String(timestamp),'X-Nonce':nonce,'X-Signature':signature},body:JSON.stringify(body)});attempts.push({status:r.status,body:await r.json()});}console.log(JSON.stringify({attempts}));})().catch(e=>{console.error(e.stack||String(e));process.exit(1)});'''


def main() -> None:
    password = getpass.getpass("Production password (not logged): ")
    encoded = base64.b64encode(NODE.encode()).decode()
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False,
                allow_agent=False, timeout=20, banner_timeout=20, auth_timeout=20)
    try:
        _, stdout, stderr = ssh.exec_command(
            f"cd /linhhoasu/lhs/newServer && node -e \"eval(Buffer.from('{encoded}','base64').toString('utf8'))\"",
            timeout=40,
        )
        out = stdout.read().decode("utf-8", "replace")
        err = stderr.read().decode("utf-8", "replace")
        code = stdout.channel.recv_exit_status()
    finally:
        ssh.close()
    if code:
        raise RuntimeError(err[-4000:] or out[-4000:] or f"remote exit={code}")
    parsed = None
    decoder = json.JSONDecoder()
    for offset, char in enumerate(out):
        if char != "{":
            continue
        try:
            value, _ = decoder.raw_decode(out[offset:])
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict) and "attempts" in value:
            parsed = value
            break
    if parsed is None:
        raise RuntimeError(f"Không đọc được route smoke output: {out[-4000:]}")
    result = {"host": HOST, "readOnly": True, "request": "authenticated_empty_text", "response": parsed}
    evidence = ROOT / "temp" / "marquee_broadcast_route_test_20260901.json"
    evidence.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    print(f"OUT={evidence}")


if __name__ == "__main__":
    main()
