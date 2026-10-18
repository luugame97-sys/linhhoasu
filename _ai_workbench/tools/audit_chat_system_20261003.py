from __future__ import annotations

import datetime as dt
import hashlib
import json
import re
from pathlib import Path

import paramiko
from rollback_role_lian_manifest_20260930 import ssh_config


ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench/temp/chat_audit_20261003'
APP = '/linhhoasu/lhs/newServer'
FILES = {
    'chat': APP + '/src/handlers/chat.js',
    'task': APP + '/src/handlers/task.js',
    'handlersIndex': APP + '/src/handlers/index.js',
    'wss': APP + '/src/net/WSServer.js',
    'crossBus': APP + '/src/services/CrossBus.js',
    'runtimeBus': APP + '/src/services/RuntimeBus.js',
    'messageService': APP + '/src/services/MessageService.js',
    'mainBundle': '/linhhoasu/webgame/game/js/main.min_drop100.js',
    'index': '/linhhoasu/webgame/game/index.html',
}


def sha(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def redact(value: str) -> str:
    return re.sub(r'(?:u|user|player)_[A-Za-z0-9_-]+', '[REDACTED_ID]', value)


def main() -> None:
    args, kwargs = ssh_config()
    assert args[0] == '103.116.104.165'
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(*args, **kwargs)
    sftp = client.open_sftp()

    def run(command: str, timeout: int = 40) -> bytes:
        _, stdout, stderr = client.exec_command(command, timeout=timeout)
        out = stdout.read(); err = stderr.read(); code = stdout.channel.recv_exit_status()
        if code:
            raise RuntimeError(f'REMOTE_FAILED:{code}:{err.decode("utf8", "replace")[-700:]}')
        return out

    source = {}
    live_hashes = {}
    for key, remote in FILES.items():
        with sftp.open(remote, 'rb') as handle:
            data = handle.read()
        source[key] = data.decode('utf8', 'replace')
        live_hashes[key] = {'path': remote, 'sha256': sha(data), 'bytes': len(data)}

    pm2 = json.loads(run('pm2 jlist').decode('utf8'))
    processes = [
        {'name': row.get('name'), 'pid': row.get('pid'), 'status': row.get('pm2_env', {}).get('status'), 'restarts': row.get('pm2_env', {}).get('restart_time')}
        for row in pm2 if re.match(r'^lhs-s100[1-6]$', row.get('name', ''))
    ]
    ports = {'S1': 8080, 'S2': 8083, 'S3': 8084, 'S4': 8085, 'S5': 8086, 'S6': 8087}
    ready = {}
    for name, port in ports.items():
        ready[name] = json.loads(run(f'curl --max-time 8 -fsS http://127.0.0.1:{port}/ready', 12).decode('utf8'))

    logs = {}
    for proc in processes:
        # pm2 paths are stable under this deployment; use the node-specific out log.
        path = f"/root/.pm2/logs/{proc['name']}-out.log"
        js = f'''const fs=require('fs');const p={json.dumps(path)};try{{const fd=fs.openSync(p,'r'),s=fs.fstatSync(fd).size,n=Math.min(s,500000),b=Buffer.alloc(n);fs.readSync(fd,b,0,n,s-n);fs.closeSync(fd);process.stdout.write(b.toString('utf8'));}}catch(e){{process.stdout.write('');}}'''
        raw = run(f'node -e {json.dumps(js)}', 15).decode('utf8', 'replace')
        window = [redact(line) for line in raw.splitlines() if re.search(r'chat|1600|1601|1602|crossbus|cross:events|world', line, re.I)]
        logs[proc['name']] = {'matchedLines': len(window), 'sample': window[-25:]}

    text = source['chat']; task = source['task']; idx = source['handlersIndex']; cross = source['crossBus']; wss = source['wss']; msg = source['messageService']; bundle = source['mainBundle']
    findings = {
        'worldFanoutProcessLocal': 'runtimeBus.getWsServer' in text and 'wsServer.broadcast(1601' in text and 'crossBus' not in text,
        'crossBusHasSubscribe': 'subscribe(' in cross,
        'crossBusSubscribedByApp': bool(re.search(r'CrossBus\.subscribe|crossBus\.subscribe', source.get('index','') + idx + wss)),
        'systemHistoryInitEmpty': 'sysList: []' in text and 'getHistory(channel' in text,
        'blockRequestTagConflict': 'router.register(1601, task.handleChatSend)' in idx and 'sendBlockPlayer=function' in bundle and 'Rpc(1601,{playerId' in bundle,
        'worldSendTag1600': 'this.Rpc(1600,e' in bundle,
        'worldPushHandler1601': 'regNetMsg(1601,t.doWorldChatAdd)' in bundle,
        'messageServiceProcessLocal': 'runtimeState' in msg and 'const runtimeState' in msg,
        'chatContentNoExplicitMax': 'MAX_CHAT' not in text and 'slice(0' not in text[text.find('toJsonChatContent'):text.find('toJsonChatContent')+1000],
    }
    result = {
        'at': dt.datetime.now(dt.timezone.utc).isoformat(),
        'readOnly': True,
        'directPlayerWrites': 0,
        'authenticatedChatSends': 0,
        'liveHashes': live_hashes,
        'processes': processes,
        'ready': ready,
        'findings': findings,
        'logs': logs,
        'result': 'AUDIT_COMPLETE',
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'audit.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    sftp.close(); client.close()
    print(json.dumps(result, ensure_ascii=False, indent=2), flush=True)


if __name__ == '__main__':
    main()
