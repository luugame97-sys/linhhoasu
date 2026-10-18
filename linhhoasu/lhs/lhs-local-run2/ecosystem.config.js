/**
 * 多大区多进程启动配置
 * 
 * 每个服务器实例独立进程，独立 WS 端口，共享 MongoDB 和 Redis
 * 通过 pm2 ecosystem 管理
 */

module.exports = {
  apps: [
    // ===== 长安一区 (serverId: 1001) =====
    {
      name: 'lhs-s1001',
      script: 'src/app.js',
      cwd: '/home/u1/LHS-ALL/LHS-server',
      env: {
        NODE_ENV: 'production',
        WS_PORT: 9200,
        HTTP_PORT: 8080,   // 只有主进程提供 HTTP（静态文件 + API）
        SERVER_ID: 1001,
        SERVER_NAME: '长安一区',
        SERVER_HOST: '0.0.0.0',
        MONGO_URI: 'mongodb://localhost:27017/lhs_s1001',
        REDIS_URL: 'redis://localhost:6379',
        REDIS_PREFIX: 's1001:',
      },
    },
    // ===== 长安二区 (serverId: 1002) =====
    {
      name: 'lhs-s1002',
      script: 'src/app.js',
      cwd: '/home/u1/LHS-ALL/LHS-server',
      env: {
        NODE_ENV: 'production',
        WS_PORT: 9201,
        HTTP_PORT: 0,       // 不启动 HTTP（由主进程统一提供）
        SERVER_ID: 1002,
        SERVER_NAME: '长安二区',
        SERVER_HOST: '0.0.0.0',
        MONGO_URI: 'mongodb://localhost:27017/lhs_s1002',
        REDIS_URL: 'redis://localhost:6379',
        REDIS_PREFIX: 's1002:',
      },
    },
    // ===== 苍穹一区 (serverId: 2001) =====
    {
      name: 'lhs-s2001',
      script: 'src/app.js',
      cwd: '/home/u1/LHS-ALL/LHS-server',
      env: {
        NODE_ENV: 'production',
        WS_PORT: 9202,
        HTTP_PORT: 0,
        SERVER_ID: 2001,
        SERVER_NAME: '苍穹一区',
        SERVER_HOST: '0.0.0.0',
        MONGO_URI: 'mongodb://localhost:27017/lhs_s2001',
        REDIS_URL: 'redis://localhost:6379',
        REDIS_PREFIX: 's2001:',
      },
    },
    // ===== 苍穹二区 (serverId: 2002) =====
    {
      name: 'lhs-s2002',
      script: 'src/app.js',
      cwd: '/home/u1/LHS-ALL/LHS-server',
      env: {
        NODE_ENV: 'production',
        WS_PORT: 9203,
        HTTP_PORT: 0,
        SERVER_ID: 2002,
        SERVER_NAME: '苍穹二区',
        SERVER_HOST: '0.0.0.0',
        MONGO_URI: 'mongodb://localhost:27017/lhs_s2002',
        REDIS_URL: 'redis://localhost:6379',
        REDIS_PREFIX: 's2002:',
      },
    },
    // ===== 仙踪一区 (serverId: 3001) =====
    {
      name: 'lhs-s3001',
      script: 'src/app.js',
      cwd: '/home/u1/LHS-ALL/LHS-server',
      env: {
        NODE_ENV: 'production',
        WS_PORT: 9204,
        HTTP_PORT: 0,
        SERVER_ID: 3001,
        SERVER_NAME: '仙踪一区',
        SERVER_HOST: '0.0.0.0',
        MONGO_URI: 'mongodb://localhost:27017/lhs_s3001',
        REDIS_URL: 'redis://localhost:6379',
        REDIS_PREFIX: 's3001:',
      },
    },
  ],
};
