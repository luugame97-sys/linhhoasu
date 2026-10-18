#!/usr/bin/env python3
"""
Patch GMT+7 for Linh Họa Sư client and server files.
"""
import os
import re

BASE = r"i:/Linhhoasu/server/server"

def update_file(path, old, new, count=1):
    with open(path, 'r', encoding='utf-8') as f:
        c = f.read()
    if old not in c:
        raise ValueError(f"Target pattern not found in {path}: {repr(old[:50])}")
    c_new = c.replace(old, new, count)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(c_new)
    print(f"OK: {os.path.relpath(path, BASE)}")

def main():
    # 1. Update index.html
    idx_path = os.path.join(BASE, "linhhoasu/webgame/game/index.html")
    update_file(
        idx_path,
        '"js/main.min_drop100.js?v=20260920_full_8_subgames_v1"',
        '"js/main.min_drop100.js?v=20260920_gmt7_sync_v1"'
    )

    # 2. Server: FarmShopService.js
    farm_shop = os.path.join(BASE, "linhhoasu/lhs/newServer/src/services/FarmShopService.js")
    update_file(
        farm_shop,
        "const GMT8_OFFSET_MS = 8 * 60 * 60 * 1000;\n\nfunction getShopDayKey(now = Date.now()) {\n  return Math.floor((now + GMT8_OFFSET_MS) / 86400000);\n}",
        "const GMT7_OFFSET_MS = 7 * 60 * 60 * 1000;\n\nfunction getShopDayKey(now = Date.now()) {\n  return Math.floor((now + GMT7_OFFSET_MS) / 86400000);\n}"
    )

    # 3. Server: activity.js
    act_path = os.path.join(BASE, "linhhoasu/lhs/newServer/src/handlers/activity.js")
    update_file(
        act_path,
        "const GMT8_OFFSET_MS = 8 * 60 * 60 * 1000;\nconst FORTUNE_FREE_SHOP_ID = 11018000;",
        "const GMT7_OFFSET_MS = 7 * 60 * 60 * 1000;\nconst FORTUNE_FREE_SHOP_ID = 11018000;"
    )
    update_file(
        act_path,
        "function getGmt8DayKey(timestamp = Date.now()) {\n  return Math.floor((Math.max(0, Number(timestamp) || 0) + GMT8_OFFSET_MS) / MS_PER_DAY);\n}",
        "function getGmt8DayKey(timestamp = Date.now()) {\n  return Math.floor((Math.max(0, Number(timestamp) || 0) + GMT7_OFFSET_MS) / MS_PER_DAY);\n}"
    )

    # 4. Server: commerce-compat.js
    comm_path = os.path.join(BASE, "linhhoasu/lhs/newServer/src/handlers/commerce-compat.js")
    update_file(
        comm_path,
        "const GMT8_OFFSET_MS = 8 * 60 * 60 * 1000;\nconst KNOWN_MONTH_CARD_IDS",
        "const GMT7_OFFSET_MS = 7 * 60 * 60 * 1000;\nconst KNOWN_MONTH_CARD_IDS"
    )
    update_file(
        comm_path,
        "function getGmt8DayKey(timestamp) {\n  const safe = Math.max(0, Number(timestamp) || 0);\n  return Math.floor((safe + GMT8_OFFSET_MS) / DAY_MS);\n}",
        "function getGmt8DayKey(timestamp) {\n  const safe = Math.max(0, Number(timestamp) || 0);\n  return Math.floor((safe + GMT7_OFFSET_MS) / DAY_MS);\n}"
    )

    # 5. Server: reborn.js
    reborn_path = os.path.join(BASE, "linhhoasu/lhs/newServer/src/handlers/reborn.js")
    update_file(
        reborn_path,
        "function getGmt8DayKey(now = Date.now()) {\n  return new Date(now + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);\n}",
        "function getGmt8DayKey(now = Date.now()) {\n  return new Date(now + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);\n}"
    )

    # 6. Server: temple.js
    temple_path = os.path.join(BASE, "linhhoasu/lhs/newServer/src/handlers/temple.js")
    update_file(
        temple_path,
        "function getGmt8DateParts(nowMs = Date.now()) {\n  const shifted = new Date(nowMs + 8 * 60 * 60 * 1000);",
        "function getGmt8DateParts(nowMs = Date.now()) {\n  const shifted = new Date(nowMs + 7 * 60 * 60 * 1000);"
    )

    # 7. Server: dungeon.js
    dungeon_path = os.path.join(BASE, "linhhoasu/lhs/newServer/src/handlers/dungeon.js")
    update_file(
        dungeon_path,
        "const day = String(new Date(Date.now() + 8 * 60 * 60 * 1000).getUTCDay() || 7);",
        "const day = String(new Date(Date.now() + 7 * 60 * 60 * 1000).getUTCDay() || 7);"
    )

    # 8. Server: playerPayload.js
    payload_path = os.path.join(BASE, "linhhoasu/lhs/newServer/src/handlers/playerPayload.js")
    update_file(
        payload_path,
        "function getGameDayKey(ts = Date.now()) {\n  const date = new Date(ts + 8 * 60 * 60 * 1000);",
        "function getGameDayKey(ts = Date.now()) {\n  const date = new Date(ts + 7 * 60 * 60 * 1000);"
    )

    # 9. Server: RechargeRewardResolver.js
    recharge_path = os.path.join(BASE, "linhhoasu/lhs/newServer/src/services/RechargeRewardResolver.js")
    update_file(
        recharge_path,
        "  if (type === 1) {\n    return { type: 'day', key: String(Math.floor((now + (8 * 60 * 60 * 1000)) / (24 * 60 * 60 * 1000))) };\n  }\n  if (type === 2) {\n    const day = new Date(now + (8 * 60 * 60 * 1000));",
        "  if (type === 1) {\n    return { type: 'day', key: String(Math.floor((now + (7 * 60 * 60 * 1000)) / (24 * 60 * 60 * 1000))) };\n  }\n  if (type === 2) {\n    const day = new Date(now + (7 * 60 * 60 * 1000));"
    )

    # 10. Server: logger.js
    logger_path = os.path.join(BASE, "linhhoasu/lhs/newServer/src/logger.js")
    update_file(
        logger_path,
        "const LOG_TIMEZONE = String(process.env.LOG_TIMEZONE || 'Asia/Shanghai').trim() || 'Asia/Shanghai';",
        "const LOG_TIMEZONE = String(process.env.LOG_TIMEZONE || 'Asia/Ho_Chi_Minh').trim() || 'Asia/Ho_Chi_Minh';"
    )
    update_file(
        logger_path,
        "return new Intl.DateTimeFormat('en-CA', { ...options, timeZone: 'Asia/Shanghai' });",
        "return new Intl.DateTimeFormat('en-CA', { ...options, timeZone: 'Asia/Ho_Chi_Minh' });"
    )

    print("\nALL FILES PATCHED TO GMT+7 SUCCESSFULLY!")

if __name__ == '__main__':
    main()
