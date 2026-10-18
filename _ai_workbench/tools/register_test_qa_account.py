"""Create or validate a QA account on the isolated test VPS without logging its password."""
from __future__ import annotations

import argparse
import getpass
import json
import urllib.error
import urllib.request


BASE_URL = "http://192.168.200.151:81"


def post_json(path: str, payload: dict[str, str]) -> tuple[int, dict]:
    body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    request = urllib.request.Request(
        BASE_URL + path,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            raw = response.read().decode("utf-8", "replace")
            return response.status, json.loads(raw)
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", "replace")
        try:
            payload_out = json.loads(raw)
        except json.JSONDecodeError:
            payload_out = {"message": raw[:500]}
        return exc.code, payload_out


def safe_summary(status: int, payload: dict) -> dict:
    return {
        "http": status,
        "ok": bool(payload.get("success") or payload.get("ok")),
        "code": payload.get("code"),
        "message": payload.get("message") or payload.get("msg"),
        "keys": sorted(key for key in payload if key.lower() not in {"password", "token"}),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--account", required=True)
    parser.add_argument("--invite", required=True)
    args = parser.parse_args()
    password = getpass.getpass("QA account password (not logged): ")

    register_status, register_payload = post_json(
        "/api/user/register",
        {
            "accountId": args.account,
            "password": password,
            "confirmPassword": password,
            "inviteCode": args.invite,
        },
    )
    login_status, login_payload = post_json(
        "/api/user/login",
        {"accountId": args.account, "password": password},
    )
    result = {
        "host": "192.168.200.151",
        "account": args.account,
        "register": safe_summary(register_status, register_payload),
        "login": safe_summary(login_status, login_payload),
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if login_status != 200 or not (login_payload.get("success") or login_payload.get("ok")):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
