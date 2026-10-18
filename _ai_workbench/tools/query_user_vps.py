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
  await mongoose.connect('mongodb://127.0.0.1:27017/lhs_s1001');
  const db = mongoose.connection.db;
  const p = await db.collection('players').findOne(
    { userId: 'u_Wk_1001_770460_1788525948362' },
    { projection: { 'other_attr_info.oldTrekInfo': 1, level: 1, name: 1 } }
  );
  console.log('PLAYER:', JSON.stringify(p));
  await mongoose.disconnect();
}
q();
" """
        out = run(ssh, cmd)
        Path('user_query_result.json').write_text(out, encoding='utf-8')
        print("Wrote to user_query_result.json")
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
