"""Read-only WebGM snapshot; never download environment or credential literals."""
import hashlib
import base64
import hmac
import json
import re
from datetime import datetime, timezone
from pathlib import Path

import paramiko

# Independently confirmed by the user from the VPS console, 08/09/2026.
# A matching IP/password alone is not host authentication.
VPS_HOST_FINGERPRINT = 'SHA256:9hrzv0d3h/tdyep0ma+RUFi99n7YGXjQt3J4fI99osQ'

class ConfirmedVpsKey(paramiko.MissingHostKeyPolicy):
    def missing_host_key(self, client, hostname, key):
        actual = 'SHA256:' + base64.b64encode(hashlib.sha256(key.asbytes()).digest()).decode('ascii').rstrip('=')
        if hostname != '103.116.105.154' or key.get_name() != 'ssh-ed25519' or not hmac.compare_digest(actual, VPS_HOST_FINGERPRINT):
            raise paramiko.SSHException('VPS_HOST_KEY_MISMATCH')
        client.get_host_keys().add(hostname, key.get_name(), key)

WB = Path(__file__).resolve().parents[1]
OUT = WB / 'temp' / 'web_multiserver_20260906'
REMOTE = '/linhhoasu/webgame/gm'
FILES = [
    'index.php', 'login.php', 'api/user_api.php', 'api/sepay_webhook.php',
    'admin/admin_api.php', 'admin/index.php', 'assets/js/index.js',
    'assets/js/login.js', 'assets/js/admin.js', 'includes/webshop_bundle.php',
    'includes/webshop_catalog.php', 'includes/webshop_spend_history.php',
    'api/item_icon.php', '.htaccess',
]


def connect():
    creds = (WB / 'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines()
    if len(creds) != 3 or creds[0].strip() != '103.116.105.154' or creds[1].strip() != 'root':
        raise RuntimeError('CREDENTIAL_TARGET_MISMATCH')
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(ConfirmedVpsKey())
    ssh.connect(creds[0].strip(), username=creds[1].strip(), password=creds[2],
                look_for_keys=False, allow_agent=False, timeout=20)
    return ssh


def run(ssh, command, input_text=None):
    stdin, stdout, stderr = ssh.exec_command(command, timeout=60)
    if input_text is not None:
        stdin.write(input_text)
        stdin.channel.shutdown_write()
    output = stdout.read().decode('utf-8')
    if stdout.channel.recv_exit_status() != 0:
        raise RuntimeError('REMOTE_READ_FAILED: ' + stderr.read().decode('utf-8')[-1000:])
    return output


def main():
    OUT.mkdir(parents=True, exist_ok=False)
    manifest = {'at': datetime.now(timezone.utc).isoformat(), 'readOnly': True, 'files': {}}
    ssh = connect()
    try:
        with ssh.open_sftp() as sftp:
            entries = sftp.listdir(REMOTE)
            # Take runtime PHP/JS helpers in addition to the fixed entrypoints.
            files = FILES + [x for x in entries if x.endswith('.php') and x not in FILES and x != 'config.php']
            for sub in ['includes', 'lib', 'api']:
                try:
                    files += [sub + '/' + x for x in sftp.listdir(REMOTE + '/' + sub) if x.endswith('.php')]
                except FileNotFoundError:
                    pass
            for rel in sorted(set(files)):
                try:
                    with sftp.open(REMOTE + '/' + rel, 'rb') as handle:
                        data = handle.read()
                except FileNotFoundError:
                    continue
                if 'config' in rel.lower():
                    continue
                manifest['files'][rel] = {'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)}
                for variant in ['baseline', 'candidate']:
                    dest = OUT / variant / rel
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    dest.write_bytes(data)
            with sftp.open(REMOTE + '/config.php', 'rb') as handle:
                data = handle.read()
            manifest['configSha256'] = hashlib.sha256(data).hexdigest()
            source = data.decode('utf-8-sig')
            redacted = []
            for line in source.splitlines():
                if re.search(r'(?i)(password|secret|api.?key|dbPass|dbUser|dbHost|dbName|dbPort|auth.?key)', line):
                    # Redacted analysis copy only, never an executable/deploy input.
                    line = re.sub(r"'[^'\n]*'|\"[^\"\n]*\"", "'[REDACTED_CONFIG_LITERAL]'", line)
                redacted.append(line)
            (OUT / 'config.redacted.php').write_text('\n'.join(redacted) + '\n', encoding='utf-8')
            manifest['runtimeEntries'] = sorted(entries)
        process_js = "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.stringify(JSON.parse(s).filter(p=>/^lhs-/.test(p.name)).map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time})))));"
        import shlex
        manifest['processes'] = json.loads(run(ssh, 'pm2 jlist | node -e ' + shlex.quote(process_js)))
        manifest['phpVersion'] = run(ssh, "php -r 'echo PHP_VERSION;' ").strip()
        audit = (WB / 'tools' / 'audit_web_multiserver_20260906.php').read_text(encoding='utf-8')
        inventory = json.loads(run(ssh, 'php', audit))
        (OUT / 'inventory.json').write_text(json.dumps(inventory, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        (OUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(json.dumps({'snapshot': str(OUT), 'files': list(manifest['files']), 'inventory': inventory}, ensure_ascii=False))
    finally:
        ssh.close()


if __name__ == '__main__':
    main()
