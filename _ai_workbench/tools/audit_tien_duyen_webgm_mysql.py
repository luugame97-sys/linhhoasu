from __future__ import annotations
import getpass
import paramiko

HOST = "103.116.105.154"
REMOTE = r"""
set -u
root=/linhhoasu/webgame/gm
envfile="$root/.env"
db_user=$(awk -F= '/^LHS_DB_USER=/{print substr($0,index($0,"=")+1)}' "$envfile" 2>/dev/null || true)
db_pass=$(awk -F= '/^LHS_DB_PASS=/{print substr($0,index($0,"=")+1)}' "$envfile" 2>/dev/null || true)
db_name=$(awk -F= '/^LHS_DB_NAME=/{print substr($0,index($0,"=")+1)}' "$envfile" 2>/dev/null || true)
if [ -z "$db_user" ]; then db_user=lhs_web; fi
if [ -z "$db_name" ]; then db_name=account_linhhoasu; fi
if [ -z "$db_pass" ]; then echo 'MYSQL_AUDIT=SKIP_NO_PASSWORD'; exit 0; fi
export MYSQL_PWD="$db_pass"
mysqlq() {
  mysql --protocol=TCP -h127.0.0.1 -P3306 -u"$db_user" --batch --raw --skip-column-names "$db_name" "$@"
}
echo '===TABLES==='
mysqlq -e "SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() ORDER BY table_name;"
echo '===SCHEMAS==='
for t in recharge_orders sepay_logs recharge_milestones recharge_milestone_claims gm_logs system_event_logs
do
  echo "---$t"
  mysqlq -e "SELECT IF(COUNT(*)>0,'exists','missing') FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='$t';"
  mysqlq -e "SHOW COLUMNS FROM \`$t\`;" 2>/dev/null | cut -f1-2 | head -80 || true
done
echo '===COUNTS_STATUS_AMOUNT==='
for t in recharge_orders sepay_logs recharge_milestone_claims gm_logs system_event_logs
do
  echo "---$t"
  mysqlq -e "SELECT COUNT(*) AS total FROM \`$t\`;" 2>/dev/null || true
  mysqlq -e "SELECT status, COUNT(*) AS n, COALESCE(SUM(amount),0) AS amount_sum FROM \`$t\` GROUP BY status ORDER BY status;" 2>/dev/null || true
done
echo '===RECHARGE_ORDER_AGG==='
mysqlq -e "SELECT status, amount, COUNT(*) AS n FROM recharge_orders GROUP BY status, amount ORDER BY amount, status;" 2>/dev/null | tail -120 || true
echo '===SEPAY_ACTION_AGG==='
mysqlq -e "SELECT action, amount, COUNT(*) AS n FROM sepay_logs GROUP BY action, amount ORDER BY amount, action;" 2>/dev/null | tail -160 || true
echo '===RECHARGE_MILESTONE_AGG==='
mysqlq -e "SELECT period_type, COUNT(*) AS n, MIN(amount_required) AS min_need, MAX(amount_required) AS max_need FROM recharge_milestones GROUP BY period_type ORDER BY period_type;" 2>/dev/null || true
mysqlq -e "SELECT m.period_type, c.claim_period, COUNT(*) AS n FROM recharge_milestone_claims c JOIN recharge_milestones m ON m.id=c.milestone_id GROUP BY m.period_type, c.claim_period ORDER BY m.period_type, c.claim_period;" 2>/dev/null | tail -80 || true
echo '===RECENT_SAFE==='
mysqlq -e "SELECT DATE(created_at) AS day, status, COUNT(*) AS n, COALESCE(SUM(amount),0) AS amount_sum FROM recharge_orders GROUP BY DATE(created_at), status ORDER BY day DESC, status LIMIT 31;" 2>/dev/null || true
mysqlq -e "SELECT DATE(created_at) AS day, action, COUNT(*) AS n, COALESCE(SUM(amount),0) AS amount_sum FROM sepay_logs GROUP BY DATE(created_at), action ORDER BY day DESC, action LIMIT 31;" 2>/dev/null || true
unset MYSQL_PWD
"""
def main():
    password = getpass.getpass("VPS password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False, timeout=20)
    try:
        _, out, err = ssh.exec_command(REMOTE, timeout=120)
        print(out.read().decode("utf-8", "replace"), end="")
        e = err.read().decode("utf-8", "replace")
        if e:
            print("STDERR=" + e, end="")
    finally:
        ssh.close()
if __name__ == "__main__":
    main()
