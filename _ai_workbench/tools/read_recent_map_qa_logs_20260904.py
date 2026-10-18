"""Read recent scoped map-QA log lines from production."""
import os,sys
from pathlib import Path
import paramiko

credentials=Path(os.environ['LHS_PROD_CREDENTIAL_FILE']).read_text(encoding='utf-8-sig').splitlines()
ssh=paramiko.SSHClient();ssh.load_system_host_keys();ssh.set_missing_host_key_policy(paramiko.RejectPolicy());ssh.connect(credentials[0].strip(),username='root',password=credentials[2],look_for_keys=False,allow_agent=False,timeout=20)
try:
 command="tail -n 5000 /root/.pm2/logs/lhs-s1001-out.log | grep -E 'qa_map990008|tag=1400|skip rapid duplicate' | tail -120 || true"
 _,stdout,stderr=ssh.exec_command(command,timeout=60);output=stdout.read().decode('utf8','replace');error=stderr.read().decode('utf8','replace');code=stdout.channel.recv_exit_status()
 if code:raise RuntimeError(error or output)
 sys.stdout.reconfigure(encoding='utf-8',errors='replace');print(output)
finally:ssh.close()
