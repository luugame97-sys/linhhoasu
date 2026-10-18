#!/usr/bin/env bash
set -u

echo 'PM2'
pm2 ls

echo 'PORTS'
ss -lntp | grep -E ':(81|88|8080|8081|9200|9201|3001|9097)[[:space:]]' || true

echo 'DATABASES'
mongosh --quiet --eval "db.adminCommand({listDatabases:1,nameOnly:true}).databases.map(function(x){return x.name}).filter(function(x){return x.indexOf('lhs')===0})"

echo 'S1_SERVERS'
mongosh --quiet mongodb://127.0.0.1:27017/lhs_s1001 --eval "JSON.stringify(db.gameservers.find({},{_id:0,serverId:1,pageId:1,pageName:1,serverName:1,running:1,status:1,openTime:1,rechargeArea:1}).sort({serverId:1}).toArray())"

echo 'S1_COUNTS'
mongosh --quiet mongodb://127.0.0.1:27017/lhs_s1001 --eval "JSON.stringify({accounts:db.accounts.countDocuments({}),players:db.players.countDocuments({}),playersByServer:db.players.aggregate([{\$group:{_id:'\$serverId',n:{\$sum:1}}},{\$sort:{_id:1}}]).toArray()})"

echo 'S2_COUNTS'
mongosh --quiet mongodb://127.0.0.1:27017/lhs_s1002 --eval "JSON.stringify({collections:db.getCollectionNames(),accounts:db.accounts.countDocuments({}),players:db.players.countDocuments({}),servers:db.gameservers.countDocuments({})})"

echo 'NGINX_ROUTES'
nginx -T 2>/dev/null \
  | grep -E '^[[:space:]]*(listen|server_name|root|location|proxy_pass)' \
  | grep -E '81|88|8080|8081|9200|9201|/ws|/api|webgame|newServer' \
  | head -120
