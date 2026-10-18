"""Read-only network/ban audit for the LHS VPS. Password is read from env only."""
import base64, hashlib, json, os, re, shlex
import paramiko

HOST = "103.116.105.154"
FP = "SHA256:9hrzv0d3h/tdyep0ma+RUFi99n7YGXjQt3J4fI99osQ"

class Pinned(paramiko.MissingHostKeyPolicy):
    def missing_host_key(self, client, hostname, key):
        fp = "SHA256:" + base64.b64encode(hashlib.sha256(key.asbytes()).digest()).decode().rstrip("=")
        if hostname != HOST or fp != FP:
            raise RuntimeError("SSH_HOST_KEY_MISMATCH")

def run(ssh, command, timeout=30):
    _, out, err = ssh.exec_command(command, timeout=timeout)
    text = out.read().decode("utf-8", "replace")
    code = out.channel.recv_exit_status()
    return {"code": code, "out": text[-20000:], "err": err.read().decode("utf-8", "replace")[-4000:]}

def main():
    password = os.environ.pop("LHS_AUDIT_PASSWORD", "")
    if not password:
        raise RuntimeError("missing password env")
    ssh = paramiko.SSHClient(); ssh.set_missing_host_key_policy(Pinned())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False,
                allow_agent=False, timeout=15, banner_timeout=15, auth_timeout=15)
    try:
        commands = {
            "time": "date -u '+%FT%TZ'",
            "identity": "printf 'host='; hostname; printf ' source_seen='; (who -m 2>/dev/null || true)",
            "listeners": "ss -lntp | grep -E ':(22|81|88|443|8082)\\b' || true",
            "iptables": "iptables -S 2>/dev/null || true; ip6tables -S 2>/dev/null || true",
            "nft": "nft list ruleset 2>/dev/null || true",
            "ufw": "ufw status verbose 2>/dev/null || true",
            "firewalld": "firewall-cmd --state 2>/dev/null || true",
            "ipsets": "for s in aapanel.ipv4.blacklist aapanel.ipv4.whitelist; do echo ===$s; ipset list $s 2>/dev/null | grep -E '^(Name:|Number of entries:|[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+)' | head -n 120; done",
            "fail2ban": "fail2ban-client status 2>/dev/null; for j in sshd ftpd; do echo ===$j; fail2ban-client status $j 2>/dev/null | grep -E 'Currently banned|Total banned|Banned IP list'; done",
            "aa_blacklist": "find /www/server/panel -maxdepth 4 -type f \\( -iname '*blacklist*' -o -iname '*deny*' \\) -print 2>/dev/null | head -n 120",
            "ssh_recent": "journalctl --since '-2 hours' -u ssh -u sshd --no-pager 2>/dev/null | awk '/Failed password|Invalid user|Accepted /{print $1,$2,$3,$5,$6,$7,$8,$9,$10}' | tail -n 120 || true",
            "nginx_recent": "for f in /www/wwwlogs/*access*.log; do [ -f \"$f\" ] || continue; echo ===$f; tail -n 12000 \"$f\" | awk '{print $9}' | sort | uniq -c | sort -nr | head -n 30; done",
            "game_errors": "for f in /www/wwwlogs/*game*access*.log; do [ -f \"$f\" ] || continue; echo ===$f; tail -n 20000 \"$f\" | awk '$9 ~ /^(403|408|429|444|499|502|503|504)$/ {print $1,$9}' | sort | uniq -c | sort -nr | head -n 80; done",
        }
        result = {k: run(ssh, v) for k, v in commands.items()}
        print(json.dumps(result, ensure_ascii=True))
    finally:
        ssh.close()

if __name__ == "__main__":
    main()
