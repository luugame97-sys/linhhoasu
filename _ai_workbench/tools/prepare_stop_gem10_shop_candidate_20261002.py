from pathlib import Path
import shutil


ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "_ai_workbench" / "temp" / "gem10_candidate_20261002"
OUT = ROOT / "_ai_workbench" / "temp" / "gem10_stop_shop_candidate_20261002"


def replace_once(path: Path, old: str, new: str) -> None:
    text = path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"expected one match in {path}: {count}")
    path.write_text(text.replace(old, new), encoding="utf-8", newline="")


def main() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    (OUT / "server" / "config").mkdir(parents=True)
    (OUT / "client").mkdir(parents=True)

    module = OUT / "server" / "config" / "gemLevel10Choice.js"
    shutil.copy2(SRC / "server" / "config" / "gemLevel10Choice.js", module)
    replace_once(
        module,
        "const SHOP_ID = 10000007;\nconst PRICE_DIAMOND = 1049760;",
        "const SHOP_ID = 10000007;\nconst PRICE_DIAMOND = 1049760;\nconst SHOP_ENABLED = false;",
    )
    replace_once(
        module,
        "  assets[BAG_ID] = assetRow;\n  tables.AssetsUseConfig[BAG_ID] = useRow;\n  tables.ShopConfig[SHOP_ID] = shopRow;",
        "  assets[BAG_ID] = assetRow;\n  tables.AssetsUseConfig[BAG_ID] = useRow;\n  if (SHOP_ENABLED) {\n    tables.ShopConfig[SHOP_ID] = shopRow;\n  } else {\n    const existingShop = own(tables.ShopConfig, SHOP_ID);\n    if (existingShop && JSON.stringify(existingShop) === JSON.stringify(shopRow)) delete tables.ShopConfig[SHOP_ID];\n  }",
    )
    replace_once(
        module,
        "module.exports = { BAG_ID, SHOP_ID, PRICE_DIAMOND, GEM_IDS, FIELD_COUNT, apply };",
        "module.exports = { BAG_ID, SHOP_ID, PRICE_DIAMOND, SHOP_ENABLED, GEM_IDS, FIELD_COUNT, apply };",
    )

    addon = OUT / "client" / "lhs-gem10-box-v1.js"
    shutil.copy2(SRC / "client" / "lhs-gem10-box-v1.js", addon)
    replace_once(addon, "var VERSION = '20261002_gem10_selectable_box_v1';", "var VERSION = '20261002_gem10_selectable_box_v2';")
    replace_once(
        addon,
        "  var PRICE = 1049760;\n  var api = root.LhsGem10BoxV1",
        "  var PRICE = 1049760;\n  var SHOP_ENABLED = false;\n  var api = root.LhsGem10BoxV1",
    )
    replace_once(
        addon,
        "    // Fail closed on a collision or metadata drift. The server remains authoritative.\n    if (row(c, BOX)) { api.skipped = 'asset_100097_exists'; return false; }\n    for (var i = 0; i < REWARDS.length; i++) if (!exactGem(c, REWARDS[i])) { api.skipped = 'gem_metadata_drift_' + REWARDS[i]; return false; }\n    c.AssetsConfig[BOX] = { id: BOX, type: 1, subType: 0, quality: 9, name: BOX, desc: 10100097,\n      icon: 'select_gem_09', itemWay: [], ifShow: 1, ifShowNum: 1, useType: 101 };\n    c.AssetsUseConfig[BOX] = { id: BOX, type: 101,\n      rewards: REWARDS.map(function (id) { return { id: id, count: 1 }; }),\n      attrs: [], conditions: [] };",
        "    // Accept the authoritative bag row so stop-sale cleanup also runs after login.\n    var existingBox = row(c, BOX);\n    if (existingBox && (Number(existingBox.type) !== 1 || Number(existingBox.useType) !== 101)) { api.skipped = 'asset_100097_metadata_drift'; return false; }\n    for (var i = 0; i < REWARDS.length; i++) if (!exactGem(c, REWARDS[i])) { api.skipped = 'gem_metadata_drift_' + REWARDS[i]; return false; }\n    if (!existingBox) c.AssetsConfig[BOX] = { id: BOX, type: 1, subType: 0, quality: 9, name: BOX, desc: 10100097,\n      icon: 'select_gem_09', itemWay: [], ifShow: 1, ifShowNum: 1, useType: 101 };\n    if (!c.AssetsUseConfig[BOX]) c.AssetsUseConfig[BOX] = { id: BOX, type: 101,\n      rewards: REWARDS.map(function (id) { return { id: id, count: 1 }; }),\n      attrs: [], conditions: [] };",
    )
    replace_once(
        addon,
        "    // The live shop table is normally delivered by the server. Adding this row\n    // only when the slot is absent keeps existing shop definitions untouched.\n    if (c.ShopConfig && !c.ShopConfig[SHOP] && !c.ShopConfig[String(SHOP)]) {\n      c.ShopConfig[SHOP] = { id: SHOP, icon: '', tab: 10, tag: 0, payId: 0,\n        cost: [{ id: 1, count: PRICE }], costAgain: [], rewards: [{ id: BOX, count: 1 }],\n        extraRewards: [], firstRewards: [], subsequentRewards: [], isDouble: 0, limit: 0,\n        limitType: 0, showConds: [], type: 0, conditions: [], preId: -1, nextId: -1,\n        intervalTri: [], duration: 0, showMultiple: 0, priority: 7 };\n    }",
        "    // The level-10 bag remains usable, but its Yuanbao shop listing is disabled.\n    // Remove only the exact row created by this addon if an old cached table still has it.\n    if (!SHOP_ENABLED && c.ShopConfig) {\n      var oldShop = c.ShopConfig[SHOP] || c.ShopConfig[String(SHOP)];\n      if (oldShop && oldShop.rewards && oldShop.rewards.length === 1\n          && Number(oldShop.rewards[0].id) === BOX) {\n        delete c.ShopConfig[SHOP]; delete c.ShopConfig[String(SHOP)];\n      }\n    } else if (SHOP_ENABLED && c.ShopConfig && !c.ShopConfig[SHOP] && !c.ShopConfig[String(SHOP)]) {\n      c.ShopConfig[SHOP] = { id: SHOP, icon: '', tab: 10, tag: 0, payId: 0,\n        cost: [{ id: 1, count: PRICE }], costAgain: [], rewards: [{ id: BOX, count: 1 }],\n        extraRewards: [], firstRewards: [], subsequentRewards: [], isDouble: 0, limit: 0,\n        limitType: 0, showConds: [], type: 0, conditions: [], preId: -1, nextId: -1,\n        intervalTri: [], duration: 0, showMultiple: 0, priority: 7 };\n    }",
    )
    replace_once(addon, "    api.installed = true; api.boxId = BOX; api.shopId = SHOP; api.price = PRICE;", "    api.installed = true; api.boxId = BOX; api.shopId = SHOP; api.price = PRICE; api.shopEnabled = SHOP_ENABLED;")

    index = OUT / "client" / "index.html"
    shutil.copy2(SRC / "client" / "index.html", index)
    replace_once(index, "lhs-gem10-box-v1.js?v=20261002_gem10_selectable_box_v1", "lhs-gem10-box-v1.js?v=20261002_gem10_selectable_box_v2")

    print(OUT)


if __name__ == "__main__":
    main()
