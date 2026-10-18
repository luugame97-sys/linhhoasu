"""Read the fixed PHP 7.4 FPM status route through its local Unix socket.

Python 3.6+ standard library only. This client cannot select another PHP script,
URL, query, socket, or method. It never exposes request query strings, users,
headers, environment, or raw FPM errors. No restart, reload, or state mutation.
"""
import json
import socket
import struct
import sys
import time


SOCKET_PATH = '/tmp/php-cgi-74.sock'
STATUS_PATH = '/phpfpm_74_status'
TIMEOUT_SECONDS = 8.0
MAX_RESPONSE_BYTES = 2 * 1024 * 1024
REQUEST_ID = 1


def record(kind, content=b''):
    padding = (-len(content)) % 8
    return struct.pack('!BBHHBB', 1, kind, REQUEST_ID, len(content), padding, 0) + content + (b'\0' * padding)


def length(value):
    if value < 128:
        return struct.pack('!B', value)
    return struct.pack('!I', value | 0x80000000)


def params_bytes(params):
    content = bytearray()
    for name, value in params.items():
        name = name.encode('ascii')
        value = value.encode('ascii')
        content.extend(length(len(name)))
        content.extend(length(len(value)))
        content.extend(name)
        content.extend(value)
    return bytes(content)


def receive_exact(sock, size, deadline):
    chunks = []
    remaining = size
    while remaining:
        seconds_left = deadline - time.monotonic()
        if seconds_left <= 0:
            raise RuntimeError('FPM_STATUS_TIMEOUT')
        sock.settimeout(seconds_left)
        chunk = sock.recv(remaining)
        if not chunk:
            raise RuntimeError('FPM_STATUS_EARLY_EOF')
        chunks.append(chunk)
        remaining -= len(chunk)
    return b''.join(chunks)


def fetch_status():
    if not hasattr(socket, 'AF_UNIX'):
        raise RuntimeError('FPM_STATUS_REQUIRES_UNIX_HOST')
    # FPM intercepts this exact status script name; no actual PHP file runs.
    parameters = {
        'GATEWAY_INTERFACE': 'CGI/1.1',
        'SERVER_PROTOCOL': 'HTTP/1.1',
        'REQUEST_METHOD': 'GET',
        'SCRIPT_NAME': STATUS_PATH,
        'SCRIPT_FILENAME': STATUS_PATH,
        'REQUEST_URI': STATUS_PATH + '?json&full',
        'QUERY_STRING': 'json&full',
        'DOCUMENT_ROOT': '/',
        'SERVER_NAME': 'localhost',
        'SERVER_ADDR': '127.0.0.1',
        'SERVER_PORT': '80',
        'REMOTE_ADDR': '127.0.0.1',
        'REMOTE_PORT': '0',
        'CONTENT_LENGTH': '0',
    }
    payload = record(1, struct.pack('!HB5x', 1, 0))
    payload += record(4, params_bytes(parameters)) + record(4) + record(5)
    stdout = bytearray()
    response_size = 0
    deadline = time.monotonic() + TIMEOUT_SECONDS
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as sock:
        sock.settimeout(TIMEOUT_SECONDS)
        sock.connect(SOCKET_PATH)
        sock.sendall(payload)
        while True:
            header = receive_exact(sock, 8, deadline)
            version, kind, request_id, content_length, padding_length, _ = struct.unpack('!BBHHBB', header)
            if version != 1 or request_id not in (0, REQUEST_ID):
                raise RuntimeError('FPM_STATUS_INVALID_RECORD')
            response_size += content_length + padding_length + 8
            if response_size > MAX_RESPONSE_BYTES:
                raise RuntimeError('FPM_STATUS_RESPONSE_TOO_LARGE')
            content = receive_exact(sock, content_length, deadline) if content_length else b''
            if padding_length:
                receive_exact(sock, padding_length, deadline)
            if kind == 6:
                stdout.extend(content)
            elif kind == 3:
                if len(content) != 8 or content[4] != 0 or struct.unpack('!I', content[:4])[0] != 0:
                    raise RuntimeError('FPM_STATUS_END_REQUEST_FAILED')
                break
            # STDERR is deliberately discarded: it can expose request data.
    raw = bytes(stdout)
    delimiter = b'\r\n\r\n' if b'\r\n\r\n' in raw else b'\n\n'
    parts = raw.split(delimiter, 1)
    if len(parts) != 2:
        raise RuntimeError('FPM_STATUS_INVALID_HTTP_RESPONSE')
    try:
        data = json.loads(parts[1].decode('utf-8'))
    except (ValueError, UnicodeError):
        raise RuntimeError('FPM_STATUS_NOT_JSON')
    if not isinstance(data, dict) or not isinstance(data.get('processes'), list):
        raise RuntimeError('FPM_STATUS_FULL_PROCESS_LIST_MISSING')
    return data


def safe_uri(value):
    # Keep the path only. Never return query strings, fragments, or line breaks.
    value = str(value or '').split('?', 1)[0].split('#', 1)[0]
    return ''.join(char for char in value if ord(char) >= 32 and ord(char) != 127)[:512]


def sanitized_status(data):
    active = []
    for process in data['processes']:
        if not isinstance(process, dict) or process.get('state') == 'Idle':
            continue
        uri = safe_uri(process.get('request URI') or process.get('script'))
        if uri == STATUS_PATH:
            continue  # Exclude this read-only status probe itself.
        duration = process.get('request duration', 0)
        active.append({'pid': int(process.get('pid', 0)), 'scriptURI': uri,
                       'request_duration_us': max(0, int(duration))})
    return {'result': 'PASS', 'readOnly': True, 'socket': SOCKET_PATH,
            'statusPath': STATUS_PATH, 'activeRequestCountExcludingStatus': len(active),
            'active': active}


def main():
    if len(sys.argv) != 1:
        raise RuntimeError('FPM_STATUS_NO_ARGUMENTS_ALLOWED')
    print(json.dumps(sanitized_status(fetch_status()), ensure_ascii=True, sort_keys=True))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # No raw socket/FPM/JSON exception content or response is printed.
        code = str(error) if isinstance(error, RuntimeError) and str(error).startswith('FPM_STATUS_') else 'FPM_STATUS_UNAVAILABLE'
        print(json.dumps({'result': 'FAIL', 'readOnly': True, 'error': code}))
        sys.exit(1)
