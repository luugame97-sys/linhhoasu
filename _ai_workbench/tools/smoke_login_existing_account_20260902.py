#!/usr/bin/env python3
from __future__ import annotations
import getpass, json
import requests

username = input('QA account: ').strip()
password = getpass.getpass('QA password (not logged): ')
url = 'http://103.116.105.154:81/api/user/login'
response = requests.post(url, json={'accountId': username, 'password': password, 'serverId': 1001}, timeout=15)
try:
    body = response.json()
except Exception:
    body = {}
data = body.get('data') if isinstance(body, dict) else {}
if not isinstance(data, dict):
    data = {}
print(json.dumps({
    'httpStatus': response.status_code,
    'success': body.get('success') if isinstance(body, dict) else None,
    'code': body.get('code') if isinstance(body, dict) else None,
    'message': body.get('message') if isinstance(body, dict) else None,
    'accountId': data.get('accountId'),
    'roleCount': len(data.get('roles') or []) if isinstance(data.get('roles'), list) else None,
    'needCreateRole': data.get('needCreateRole'),
    'activeRolePresent': bool(data.get('activeRoleId')),
    'userTokenPresent': bool(data.get('userToken')),
}, ensure_ascii=False, indent=2))
