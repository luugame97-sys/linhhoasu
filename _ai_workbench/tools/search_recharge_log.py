import getpass
import paramiko

HOST='103.116.105.154'; pw=getpass.getpass('VPS password (not logged): ')
s=paramiko.SSHClient();s.set_missing_host_key_policy(paramiko.AutoAddPolicy());s.connect(HOST,username='root',password=pw,look_for_keys=False,allow_agent=False,timeout=15)
try:
    # Keep this probe focused on the two Activity 9 pay IDs and redact any
    # account/order-like fields before printing.  It is read-only.
    cmd=("grep -nE 'tag=(1230|1210)|payid|payId|rechargeId|Recharge|充值|XTPAY|ORDER_NOT_FOUND|AMOUNT_MISMATCH|INVALID_SIGN' "
         "/root/.pm2/logs/lhs-s1001-out.log | tail -240 "
         "| sed -E 's/(user(Id)?|account(Id)?|order(Id)?|token|openId|sign|key)=[^ ]+/\\1=[REDACTED]/Ig'")
    _,o,e=s.exec_command(cmd);print(o.read().decode('utf8','replace'));print(e.read().decode('utf8','replace'))
finally:s.close()
