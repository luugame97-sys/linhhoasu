process.env.REDIS_HOST = '127.0.0.1';
process.env.REDIS_PORT = '6379';
process.env.REDIS_PREFIX = '';
const Redis = require('/linhhoasu/lhs/newServer/node_modules/ioredis');
const client = new Redis({ host: '127.0.0.1', port: 6379 });

(async () => {
  let cursor = '0';
  let count = 0;
  let invalid = 0;
  let minTtl = null;
  let maxTtl = 0;
  do {
    const [next, keys] = await client.scan(cursor, 'MATCH', 's1001:auth:session:*', 'COUNT', 500);
    cursor = next;
    for (const key of keys) {
      count += 1;
      const [ttl, raw] = await Promise.all([client.ttl(key), client.get(key)]);
      if (ttl >= 0) {
        minTtl = minTtl == null ? ttl : Math.min(minTtl, ttl);
        maxTtl = Math.max(maxTtl, ttl);
      }
      try {
        const payload = JSON.parse(raw || '{}');
        if (!payload.accountId || !payload.userId || !payload.roleId || Number(payload.authVersion) < 1) invalid += 1;
      } catch (_err) { invalid += 1; }
    }
  } while (cursor !== '0');
  console.log(JSON.stringify({ count, invalid, minTtl, maxTtl, secretsPrinted: false }));
  await client.quit();
})().catch(async (err) => { console.error(err.message); try { await client.quit(); } catch (_err) {} process.exit(1); });
