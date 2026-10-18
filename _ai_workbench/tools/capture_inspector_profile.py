import asyncio
import getpass
import json
import os
import posixpath
import tempfile
import time
from datetime import datetime, timezone

import paramiko

HOST = '103.116.105.154'
REMOTE_DIR = '/linhhoasu/_ai_workbench/temp'
stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
remote_script = f'{REMOTE_DIR}/capture_inspector_{stamp}.js'
remote_profile = f'{REMOTE_DIR}/lhs-s1001-inspector-{stamp}.cpuprofile'
local_profile = os.path.join(os.path.dirname(__file__), f'lhs-s1001-inspector-{stamp}.cpuprofile')

node_script = r'''const fs = require('fs');
const http = require('http');
const WebSocket = require('/linhhoasu/lhs/newServer/node_modules/ws');
const out = process.argv[2];
function getTarget(tries = 0) {
  http.get('http://127.0.0.1:9229/json', (res) => {
    let body = '';
    res.on('data', (chunk) => { body += chunk; });
    res.on('end', () => {
      try {
        const rows = JSON.parse(body);
        const url = rows[0] && rows[0].webSocketDebuggerUrl;
        if (!url) throw new Error('inspector target missing');
        capture(url);
      } catch (err) {
        if (tries < 20) setTimeout(() => getTarget(tries + 1), 250);
        else { console.error(err.message); process.exit(2); }
      }
    });
  }).on('error', (err) => {
    if (tries < 20) setTimeout(() => getTarget(tries + 1), 250);
    else { console.error(err.message); process.exit(2); }
  });
}
function capture(url) {
  const ws = new WebSocket(url);
  let nextId = 1;
  let started = false;
  ws.on('open', () => ws.send(JSON.stringify({ id: nextId++, method: 'Profiler.enable' })));
  ws.on('message', (raw) => {
    let message;
    try { message = JSON.parse(raw.toString()); } catch (_) { return; }
    if (message.id === 1 && !started) {
      started = true;
      ws.send(JSON.stringify({ id: 2, method: 'Profiler.start' }));
      setTimeout(() => ws.send(JSON.stringify({ id: 3, method: 'Profiler.stop' })), 20000);
    } else if (message.id === 3) {
      fs.writeFileSync(out, JSON.stringify(message.result && message.result.profile));
      ws.close();
      process.exit(0);
    }
  });
  ws.on('error', (err) => { console.error(err.message); process.exit(3); });
}
getTarget();
'''

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username='root', password=getpass.getpass('VPS password (not logged): '), look_for_keys=False, allow_agent=False, timeout=15)

def run(command, check=True):
    _, out, err = ssh.exec_command(command)
    stdout = out.read().decode('utf-8', 'replace')
    code = out.channel.recv_exit_status()
    if check and code:
        raise RuntimeError(f'command failed ({code}): {err.read().decode("utf-8", "replace")[-2000:]}')
    return code, stdout

try:
    _, pid = run('pm2 pid lhs-s1001')
    pid = pid.strip().splitlines()[-1]
    if not pid.isdigit() or int(pid) <= 0:
        raise RuntimeError(f'invalid lhs-s1001 pid: {pid}')
    run(f'mkdir -p {REMOTE_DIR}')
    sftp = ssh.open_sftp()
    try:
        with sftp.open(remote_script, 'w') as stream:
            stream.write(node_script)
    finally:
        sftp.close()
    run(f'kill -USR1 {pid}')
    time.sleep(1)
    code, output = run(f'node {remote_script} {remote_profile}', check=False)
    print('CAPTURE_CODE', code, output.strip())
    sftp = ssh.open_sftp()
    try:
        sftp.get(remote_profile, local_profile)
    finally:
        sftp.close()
    print('PROFILE_SAVED', local_profile)
    payload = json.load(open(local_profile, encoding='utf-8'))
    nodes = {node.get('id'): node for node in payload.get('nodes', [])}
    counts = {}
    for sample in payload.get('samples', []):
        node = nodes.get(sample)
        if not node:
            continue
        frame = node.get('callFrame', {})
        name = f"{frame.get('functionName', '(anonymous)')}@{frame.get('url', '')}:{frame.get('lineNumber', -1) + 1}"
        counts[name] = counts.get(name, 0) + 1
    for name, count in sorted(counts.items(), key=lambda pair: pair[1], reverse=True)[:40]:
        print('HOT', count, name)
finally:
    try:
        run(f'rm -f {remote_script} {remote_profile}', check=False)
    except Exception:
        pass
    ssh.close()
