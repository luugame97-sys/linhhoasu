"""Read-only production audit for Webshop categories and catalog sync logic."""

import getpass
import json
import re
import shlex
import sys

import paramiko


HOST = "103.116.105.154"
ROOT = "/linhhoasu/webgame/gm"


def run(ssh, command):
    _, stdout, stderr = ssh.exec_command(command)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(f"remote command failed ({code}): {err.strip()}")
    return out


def relevant_source_lines(path, text):
    needles = (
        "webshop",
        "shop-item",
        "shop_item",
        "category",
        "catalog",
        "buy_shop_item",
    )
    lines = text.splitlines()
    hits = []
    for number, line in enumerate(lines, 1):
        if any(needle in line.lower() for needle in needles):
            hits.append({"line": number, "text": line.strip()[:700]})
    return {"path": path, "hits": hits[:240]}


ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(
    HOST,
    username="root",
    password=getpass.getpass("VPS password (not logged): "),
    look_for_keys=False,
    allow_agent=False,
    timeout=15,
)

try:
    file_output = run(
        ssh,
        "find "
        + shlex.quote(ROOT)
        + " -maxdepth 3 -type f "
        + "-not -path '*/_ai_workbench/backups/*' "
        + "-not -path '*/_ai_workbench/temp/*' "
        + "-not -name '.env' -not -name 'config.php' | sort",
    )
    files = [line.strip() for line in file_output.splitlines() if line.strip()]

    sftp = ssh.open_sftp()
    try:
        catalog_path = ROOT + "/assets/item/webshop_catalog.json"
        with sftp.open(catalog_path, "rb") as handle:
            catalog = json.loads(handle.read().decode("utf-8"))
        rows = catalog.get("items", catalog.get("products", catalog))
        if not isinstance(rows, list):
            rows = []

        source_audit = []
        for path in files:
            if not re.search(r"\.(php|js|html)$", path, flags=re.I):
                continue
            try:
                if sftp.stat(path).st_size > 2_500_000:
                    continue
                with sftp.open(path, "rb") as handle:
                    text = handle.read().decode("utf-8", "replace")
            except OSError:
                continue
            item = relevant_source_lines(path, text)
            if item["hits"]:
                source_audit.append(item)
    finally:
        sftp.close()

    php = r'''
require '/linhhoasu/webgame/gm/config.php';
$tables = array('webshop_items', 'webshop_orders');
$schema = array();
foreach ($tables as $table) {
    $schema[$table] = $conn_web->query('SHOW COLUMNS FROM `' . $table . '`')->fetchAll(PDO::FETCH_ASSOC);
}
$indexes = array();
foreach ($tables as $table) {
    $indexes[$table] = $conn_web->query('SHOW INDEX FROM `' . $table . '`')->fetchAll(PDO::FETCH_ASSOC);
}
$items = $conn_web->query('SELECT * FROM webshop_items ORDER BY id')->fetchAll(PDO::FETCH_ASSOC);
$duplicates = $conn_web->query('SELECT item_id,COUNT(*) AS row_count,GROUP_CONCAT(id ORDER BY id) AS row_ids FROM webshop_items GROUP BY item_id HAVING COUNT(*)>1 ORDER BY CAST(item_id AS UNSIGNED),item_id')->fetchAll(PDO::FETCH_ASSOC);
$itemColumns = array_column($schema['webshop_items'], 'Field');
$categoryColumn = in_array('category', $itemColumns, true) ? 'category' : (in_array('category_key', $itemColumns, true) ? 'category_key' : '');
$summary = array();
$orders = $conn_web->query("SELECT wi.id AS shop_item_id, wi.item_id, COUNT(wo.id) AS order_count, COALESCE(SUM(wo.quantity),0) AS bought_units, MIN(wo.created_at) AS first_order, MAX(wo.created_at) AS last_order FROM webshop_items wi LEFT JOIN webshop_orders wo ON wo.shop_item_id=wi.id GROUP BY wi.id, wi.item_id ORDER BY wi.id")->fetchAll(PDO::FETCH_ASSOC);
if ($categoryColumn !== '') {
    $summary = $conn_web->query('SELECT `' . $categoryColumn . '` AS category_key, is_active, COUNT(*) AS product_count FROM webshop_items GROUP BY `' . $categoryColumn . '`, is_active ORDER BY `' . $categoryColumn . '`, is_active DESC')->fetchAll(PDO::FETCH_ASSOC);
}
$settingsStmt = $conn_web->prepare("SELECT setting_key, setting_value FROM web_settings WHERE setting_key IN ('webshop_enabled')");
$settingsStmt->execute();
echo json_encode(array('schema'=>$schema,'indexes'=>$indexes,'items'=>$items,'duplicates'=>$duplicates,'summary'=>$summary,'orders'=>$orders,'settings'=>$settingsStmt->fetchAll(PDO::FETCH_ASSOC)), JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
'''
    database = json.loads(run(ssh, "php -r " + shlex.quote(php)))

    by_category = {}
    for row in rows:
        by_category.setdefault(str(row.get("category", "")), []).append(row)

    result = {
        "remote_root": ROOT,
        "files": files,
        "catalog_path": catalog_path,
        "catalog_count": len(rows),
        "catalog_categories": {
            key: {
                "count": len(value),
                "active_count": sum(int(item.get("is_active", 1) or 0) == 1 for item in value),
                "items": value,
            }
            for key, value in sorted(by_category.items())
        },
        "database": database,
        "source_audit": source_audit,
    }
    if "--compact" in sys.argv:
        db_by_item_id = {
            str(int(row.get("item_id", 0))): row for row in database.get("items", [])
        }
        orders_by_shop_id = {
            str(int(row.get("shop_item_id", 0))): row
            for row in database.get("orders", [])
        }
        category_rows = {}
        sort_groups = catalog.get("sort_groups", {})
        for category, catalog_rows in sorted(by_category.items()):
            merged = []
            for catalog_row in catalog_rows:
                db_row = db_by_item_id.get(str(int(catalog_row.get("item_id", 0))), {})
                order_row = orders_by_shop_id.get(str(int(db_row.get("id", 0) or 0)), {})
                merged.append(
                    {
                        "shop_item_id": db_row.get("id"),
                        "item_id": catalog_row.get("item_id"),
                        "name_vi": catalog_row.get("name_vi"),
                        "price": db_row.get("price", catalog_row.get("price")),
                        "item_amount": db_row.get(
                            "item_amount", catalog_row.get("item_amount")
                        ),
                        "sort_order": db_row.get(
                            "sort_order", catalog_row.get("sort_order")
                        ),
                        "is_active": db_row.get("is_active"),
                        "order_count": order_row.get("order_count", 0),
                        "bought_units": order_row.get("bought_units", 0),
                        "first_order": order_row.get("first_order"),
                        "last_order": order_row.get("last_order"),
                    }
                )
            category_rows[category] = {
                "label": (sort_groups.get(category) or {}).get("label", category),
                "catalog_count": len(catalog_rows),
                "db_count": sum(1 for row in merged if row["shop_item_id"] is not None),
                "active_count": sum(int(row["is_active"] or 0) == 1 for row in merged),
                "inactive_count": sum(
                    row["shop_item_id"] is not None and int(row["is_active"] or 0) == 0
                    for row in merged
                ),
                "order_count": sum(int(row["order_count"] or 0) for row in merged),
                "bought_units": sum(int(row["bought_units"] or 0) for row in merged),
                "items": merged,
            }
        result = {
            "remote_root": ROOT,
            "catalog_path": catalog_path,
            "catalog_count": len(rows),
            "sort_groups": sort_groups,
            "categories": category_rows,
            "schema": database.get("schema"),
            "indexes": database.get("indexes"),
            "db_total": len(database.get("items", [])),
            "duplicate_item_ids": database.get("duplicates"),
            "settings": database.get("settings"),
            "source_paths": [entry["path"] for entry in source_audit],
            "important_source_hits": [
                entry
                for entry in source_audit
                if entry["path"].endswith(
                    (
                        "/index.php",
                        "/api/user_api.php",
                        "/_ai_workbench/tools/sync_webshop_catalog.php",
                    )
                )
            ],
        }
        if "--targets-only" in sys.argv:
            target_keys = {"gem", "rare"}
            result["category_summary"] = {
                key: {field: value for field, value in payload.items() if field != "items"}
                for key, payload in category_rows.items()
            }
            result["target_categories"] = {
                key: category_rows[key]
                for key in sorted(target_keys)
                if key in category_rows
            }
            control_needles = (
                "get_webshop_items",
                "save_webshop_item",
                "toggle_webshop_item",
                "delete_webshop_item",
                "is_active = 1",
                "is_active=1",
                "webshop_catalog_meta",
                "shop_categories",
                "buy_shop_item",
                "update webshop_items",
                "insert into webshop_items",
            )
            result["control_hits"] = [
                {
                    "path": entry["path"],
                    "hits": [
                        hit
                        for hit in entry["hits"]
                        if any(
                            needle in hit["text"].lower()
                            for needle in control_needles
                        )
                    ],
                }
                for entry in source_audit
                if any(
                    any(needle in hit["text"].lower() for needle in control_needles)
                    for hit in entry["hits"]
                )
            ]
            result.pop("categories", None)
            result.pop("important_source_hits", None)
            if "--controls-only" in sys.argv:
                result.pop("target_categories", None)
                result.pop("schema", None)
    rendered = json.dumps(result, ensure_ascii=False, indent=2)
    if "--out" in sys.argv:
        out_index = sys.argv.index("--out") + 1
        if out_index >= len(sys.argv):
            raise SystemExit("--out requires a path")
        with open(sys.argv[out_index], "w", encoding="utf-8") as handle:
            handle.write(rendered)
    print(rendered)
finally:
    ssh.close()
