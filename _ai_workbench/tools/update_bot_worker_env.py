from pathlib import Path
import sys


def main() -> int:
    target = Path(sys.argv[1] if len(sys.argv) > 1 else "/linhhoasu/lhs/newServer/.env")
    token = sys.stdin.readline().strip()
    if len(token) < 32:
        raise SystemExit("BOT_WORKER_TOKEN_INVALID")

    count = sys.argv[2] if len(sys.argv) > 2 else "3"
    map_ids = sys.argv[3] if len(sys.argv) > 3 else "10001,10016,10018"
    connect_interval_ms = sys.argv[4] if len(sys.argv) > 4 else "750"
    farm_min_ms = sys.argv[5] if len(sys.argv) > 5 else "60000"
    farm_max_ms = sys.argv[6] if len(sys.argv) > 6 else "120000"

    keys = {
        "BOT_WORKER_TOKEN",
        "BOT_WORKER_ENABLED",
        "BOT_WORKER_COUNT",
        "BOT_WORKER_WS_URL",
        "BOT_WORKER_SERVER_ID",
        "BOT_WORKER_MAP_IDS",
        "BOT_WORKER_MAP_LINE",
        "BOT_WORKER_CHAT_ENABLED",
        "BOT_WORKER_HEARTBEAT_MS",
        "BOT_WORKER_MOVE_MIN_MS",
        "BOT_WORKER_MOVE_MAX_MS",
        "BOT_WORKER_CHAT_MIN_MS",
        "BOT_WORKER_CHAT_MAX_MS",
        "BOT_WORKER_CONNECT_INTERVAL_MS",
        "BOT_WORKER_FARM_ENABLED",
        "BOT_WORKER_FARM_MIN_MS",
        "BOT_WORKER_FARM_MAX_MS",
    }
    lines = target.read_text(encoding="utf-8").splitlines() if target.exists() else []
    lines = [line for line in lines if line.split("=", 1)[0] not in keys]
    lines.extend(
        [
            f"BOT_WORKER_TOKEN={token}",
            "BOT_WORKER_ENABLED=1",
            f"BOT_WORKER_COUNT={count}",
            "BOT_WORKER_WS_URL=ws://127.0.0.1:9200",
            "BOT_WORKER_SERVER_ID=1001",
            f"BOT_WORKER_MAP_IDS={map_ids}",
            "BOT_WORKER_MAP_LINE=0",
            "BOT_WORKER_CHAT_ENABLED=1",
            "BOT_WORKER_HEARTBEAT_MS=20000",
            "BOT_WORKER_MOVE_MIN_MS=30000",
            "BOT_WORKER_MOVE_MAX_MS=60000",
            "BOT_WORKER_CHAT_MIN_MS=120000",
            "BOT_WORKER_CHAT_MAX_MS=300000",
            f"BOT_WORKER_CONNECT_INTERVAL_MS={connect_interval_ms}",
            "BOT_WORKER_FARM_ENABLED=1",
            f"BOT_WORKER_FARM_MIN_MS={farm_min_ms}",
            f"BOT_WORKER_FARM_MAX_MS={farm_max_ms}",
        ]
    )
    target.write_text("\n".join(lines) + "\n", encoding="utf-8")
    target.chmod(0o600)
    print(f"updated={target} keys={len(keys)} mode=600")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
