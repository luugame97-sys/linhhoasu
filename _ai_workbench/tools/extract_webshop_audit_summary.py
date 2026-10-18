"""Run the read-only remote audit and print a compact, non-secret summary."""

import getpass
import json
import pathlib
import subprocess
import sys


ROOT = pathlib.Path(__file__).resolve().parents[2]
AUDIT = ROOT / "_ai_workbench" / "tools" / "audit_webshop_categories_readonly.py"
output = subprocess.check_output(
    [sys.executable, str(AUDIT), "--compact", "--targets-only"],
    input=(getpass.getpass("VPS password (not logged): ") + "\n").encode(),
)
text = output.decode("utf-8", "replace")
start = text.find("{")
doc = json.loads(text[start:])
for key in ("gem", "rare"):
    category = doc["target_categories"][key]
    print(
        f"CATEGORY {key} label={category['label']} catalog={category['catalog_count']} "
        f"db={category['db_count']} active={category['active_count']} "
        f"orders={category['order_count']} units={category['bought_units']}"
    )
    for item in category["items"]:
        print(
            "ITEM "
            + " ".join(
                [
                    f"shop_id={item['shop_item_id']}",
                    f"item_id={item['item_id']}",
                    f"name={item['name_vi']}",
                    f"active={item['is_active']}",
                    f"orders={item['order_count']}",
                    f"units={item['bought_units']}",
                ]
            )
        )
