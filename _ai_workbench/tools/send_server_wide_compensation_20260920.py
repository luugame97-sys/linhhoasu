"""Send server-wide compensation and maintenance gift mail across all 5 servers (S1-S5).
Uses internal HTTP endpoint /api/internal/mail/sendAll with HMAC signature for each node:
- Automatically inserts to MongoDB mails collection
- Automatically pushes realtime via WebSocket to online players
- Performs readback verification on each database
"""
import sys
import json
import time
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
sys.dont_write_bytecode = True

WB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WB / 'tools'))
sys.path.insert(0, str(WB / 'temp/pydeps'))
from snapshot_web_multiserver_20260906 import connect, run

REMOTE_SCRIPT = r"""
const http = require('http');
const crypto = require('crypto');
const { MongoClient } = require('/linhhoasu/lhs/newServer/node_modules/mongodb');
const { signInternalRequest } = require('/linhhoasu/lhs/newServer/src/utils/internalAuth');

const SECRET = '289bdbcffd8dba865cda57e8db55a845f077e57830157c627bc9e30a7f759dde';

const SERVERS = [
  { serverId: 1001, port: 8080, dbName: 'lhs_s1001', name: 'Server 1' },
  { serverId: 1002, port: 8083, dbName: 'lhs_s1002', name: 'Server 2' },
  { serverId: 1003, port: 8084, dbName: 'lhs_s1003', name: 'Server 3' },
  { serverId: 1004, port: 8085, dbName: 'lhs_s1004', name: 'Server 4' },
  { serverId: 1005, port: 8086, dbName: 'lhs_s1005', name: 'Server 5' },
];

const MAIL_PAYLOAD = {
  scope: 'server',
  title: 'Đền bù sự cố & Nâng cấp Thú cưỡi - Hồn ngọc',
  content: 'Chư vị Tiên Hữu thân mến,\n\nBan Điều Hành đã hoàn tất nâng cấp và đồng bộ tính năng Thú Cưỡi (đạt cấp 1000) và Hồn Ngọc (đạt cấp 100), đồng thời đã kiểm tra và bảo toàn dữ liệu cho toàn bộ người chơi.\n\nXin gửi tặng toàn thể Tiên Hữu gói quà hỗ trợ tu luyện. Chúc chư vị trải nghiệm vui vẻ!',
  sender: 'Hệ thống',
  attachments: [
    { id: 1, count: 10000000 },  // 10.000.000 Nguyên Bảo
    { id: 90078, count: 3 },    // 3x Rương Hồn Ngọc cấp 8 tự chọn
    { id: 20, count: 1000 },     // 1.000x Đá thăng cấp thú cưỡi
    { id: 1001, count: 200 }     // 200x Thiên Diễn Lệnh
  ],
  expireDays: 30
};

function sendMailToNode(srv) {
  return new Promise((resolve, reject) => {
    const payload = {
      ...MAIL_PAYLOAD,
      serverId: srv.serverId
    };
    const bodyStr = JSON.stringify(payload);
    const timestamp = Date.now();
    const nonce = crypto.randomBytes(8).toString('hex');
    const path = '/api/internal/mail/sendAll';
    const method = 'POST';

    const signature = signInternalRequest({
      secret: SECRET,
      method,
      path,
      timestamp,
      nonce,
      body: bodyStr
    });

    const req = http.request({
      host: '127.0.0.1',
      port: srv.port,
      path,
      method,
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(bodyStr),
        'x-api-key': SECRET,
        'x-timestamp': timestamp,
        'x-nonce': nonce,
        'x-signature': signature
      },
      timeout: 30000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

(async () => {
  const client = new MongoClient('mongodb://127.0.0.1:27017', { serverSelectionTimeoutMS: 10000 });
  await client.connect();

  const results = [];

  for (const srv of SERVERS) {
    try {
      // 1. Call sendAll endpoint
      const response = await sendMailToNode(srv);

      // 2. Readback DB count
      const db = client.db(srv.dbName);
      const totalPlayers = await db.collection('players').countDocuments();
      const mailCount = await db.collection('mails').countDocuments({
        title: MAIL_PAYLOAD.title
      });

      results.push({
        server: srv.name,
        serverId: srv.serverId,
        port: srv.port,
        dbName: srv.dbName,
        apiStatus: response.status,
        apiResult: response.data,
        dbTotalPlayers: totalPlayers,
        dbMailsCreated: mailCount
      });
    } catch (err) {
      results.push({
        server: srv.name,
        serverId: srv.serverId,
        error: err.message
      });
    }
  }

  await client.close();

  console.log('SEND_MAIL_RESULT_START');
  console.log(JSON.stringify(results, null, 2));
  console.log('SEND_MAIL_RESULT_END');
})();
"""

def main():
    print("==================================================================")
    print("  TIẾN HÀNH PHÁT THƯ ĐỀN BÙ DIỆN RỘNG CHO TOÀN BỘ 5 SERVER (S1-S5)")
    print("==================================================================")
    print("Kết nối VPS 103.116.105.154...")
    ssh = connect()
    try:
        output = run(ssh, 'node', input_text=REMOTE_SCRIPT)
        if 'SEND_MAIL_RESULT_START' in output and 'SEND_MAIL_RESULT_END' in output:
            res_json = output.split('SEND_MAIL_RESULT_START')[1].split('SEND_MAIL_RESULT_END')[0].strip()
            results = json.loads(res_json)
            print("\nKẾT QUẢ PHÁT THƯ TRÊN TỪNG MÁY CHỦ:")
            total_sent = 0
            for r in results:
                server = r.get('server')
                sid = r.get('serverId')
                status = r.get('apiStatus')
                created = r.get('dbMailsCreated', 0)
                players = r.get('dbTotalPlayers', 0)
                total_sent += created
                print(f"  [+] {server} (ID: {sid}):")
                print(f"      - HTTP Response: {status}")
                print(f"      - Tổng số người chơi trong DB: {players}")
                print(f"      - Số thư đền bù đã tạo thành công: {created}")
            print("\n==================================================================")
            print(f"  TỔNG CỘNG ĐÃ GỬI THÀNH CÔNG CHO: {total_sent} NGƯỜI CHƠI TRÊN 5 SERVER")
            print("==================================================================")
        else:
            print("Lỗi phản hồi:", output)
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
