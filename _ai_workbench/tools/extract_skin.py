import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from pathlib import Path
sys.path.insert(0, './_ai_workbench/tools')
from snapshot_web_multiserver_20260906 import connect, run

def main():
    s = connect()
    res1 = run(s, "curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:81/index.html")
    res2 = run(s, "curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:81/js/main.min_drop100.js")
    print('index.html:', res1.strip())
    print('main.min_drop100.js:', res2.strip())
    s.close()

def shlex_quote(s):
    import shlex
    return shlex.quote(s)

if __name__ == '__main__':
    main()
