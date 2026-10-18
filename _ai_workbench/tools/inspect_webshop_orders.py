import sys
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
sys.dont_write_bytecode = True

WB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WB / 'tools'))
sys.path.insert(0, str(WB / 'temp/pydeps'))
from snapshot_web_multiserver_20260906 import connect, run

PHP_SCRIPT = r"""<?php
require_once '/linhhoasu/webgame/gm/config.php';
global $conn_web;

echo "=== TABLES IN account_linhhoasu ===\n";
$stmt = $conn_web->query("SHOW TABLES");
$tables = $stmt->fetchAll(PDO::FETCH_COLUMN);
echo implode(", ", $tables) . "\n\n";

if (in_array('webshop_orders', $tables)) {
    echo "=== WEBSHOP ORDERS FOR minhtoanmt ===\n";
    $stmt = $conn_web->prepare("SELECT id, account_name, item_id, quantity, reward_snapshot, created_at FROM webshop_orders WHERE account_name = 'minhtoanmt' ORDER BY id DESC LIMIT 50");
    $stmt->execute();
    $orders = $stmt->fetchAll(PDO::FETCH_ASSOC);
    foreach ($orders as $o) {
        echo "[{$o['created_at']}] ID {$o['id']}: item {$o['item_id']} x{$o['quantity']} -> {$o['reward_snapshot']}\n";
    }

    echo "\n=== WEBSHOP ORDERS FOR xxxxxx (Bàng Bác) ===\n";
    $stmt = $conn_web->prepare("SELECT id, account_name, item_id, quantity, reward_snapshot, created_at FROM webshop_orders WHERE account_name = 'xxxxxx' ORDER BY id DESC LIMIT 50");
    $stmt->execute();
    $orders = $stmt->fetchAll(PDO::FETCH_ASSOC);
    foreach ($orders as $o) {
        echo "[{$o['created_at']}] ID {$o['id']}: item {$o['item_id']} x{$o['quantity']} -> {$o['reward_snapshot']}\n";
    }
}
"""

def main():
    ssh = connect()
    try:
        print(run(ssh, 'php', input_text=PHP_SCRIPT))
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
