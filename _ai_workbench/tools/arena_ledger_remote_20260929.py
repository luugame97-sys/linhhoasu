"""Bounded SSH operations; never print environment or player documents."""
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
sys.dont_write_bytecode = True
from snapshot_web_multiserver_20260906 import connect, run

if __name__ == '__main__':
    ssh = connect()
    try:
        if sys.argv[1] == 'node':
            output=run(ssh, 'node -', Path(sys.argv[2]).read_text(encoding='utf-8'))
            if len(sys.argv)>3:
                Path(sys.argv[3]).write_text(output,encoding='utf-8')
            print(output)
        elif sys.argv[1] == 'shell':
            print(run(ssh, sys.argv[2]))
        elif sys.argv[1] == 'get':
            with ssh.open_sftp() as sftp:
                sftp.get(sys.argv[2], sys.argv[3])
            print('Downloaded', sys.argv[3])
    finally:
        ssh.close()
