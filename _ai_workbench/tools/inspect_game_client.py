import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from snapshot_web_multiserver_20260906 import connect, run

def main():
    s = connect()
    out = run(s, "grep -E '(main\.min|index\.html)' /www/wwwlogs/game-lhs-access.log | tail -n 30")
    print('Recent main/index requests:')
    print(out)
    s.close()

if __name__ == '__main__':
    main()
