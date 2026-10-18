import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('103.116.104.165', username='root', password='anhduc11')

cmd = """node -e "
const mongoose = require('/linhhoasu/lhs/newServer/node_modules/mongoose');
const Player = require('/linhhoasu/lhs/newServer/src/db/models/Player');

(async () => {
  await mongoose.connect('mongodb://localhost:27017/lhs_s1005');
  const doc = await Player.findOne({ userId: 'u_Wk_1005_1a02fb_1790229573870' }).lean();
  if (doc) {
    for (const [k, v] of Object.entries(doc)) {
      const len = JSON.stringify(v).length;
      if (len > 1000) console.log(k, ':', len, 'bytes');
    }
  }
  process.exit(0);
})();
"
"""
_, out, err = client.exec_command(cmd)
print(out.read().decode('utf-8'))
client.close()
