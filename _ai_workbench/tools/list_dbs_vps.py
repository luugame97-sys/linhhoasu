import sys
from pathlib import Path
sys.path.append(str(Path(__file__).resolve().parent))
from snapshot_web_multiserver_20260906 import connect, run

def main():
    ssh = connect()
    try:
        cmd = """node -e "
const mongoose = require('/linhhoasu/lhs/newServer/node_modules/mongoose');
async function q() {
  await mongoose.connect('mongodb://127.0.0.1:27017/admin');
  const dbs = await mongoose.connection.db.admin().listDatabases();
  console.log('DATABASES:', JSON.stringify(dbs.databases.map(d => d.name)));
  await mongoose.disconnect();
}
q();
" """
        out = run(ssh, cmd)
        print(out)
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
