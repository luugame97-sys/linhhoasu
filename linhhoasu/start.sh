#!/bin/bash

# ===== 一键启停脚本 =====
# 启动顺序: newServer → lhs-dist → lhs-admin
# 每个服务之间间隔 5 秒

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

DELAY=5

start() {
    echo -e "${GREEN}===== 开始启动所有服务 =====${NC}"

    # 1. 启动 newServer
    echo -e "${YELLOW}[1/3] 正在启动 newServer...${NC}"
    cd /linhhoasu/lhs/newServer && pm2 start ecosystem.config.js
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}[1/3] newServer 启动成功${NC}"
    else
        echo -e "${RED}[1/3] newServer 启动失败，请检查日志${NC}"
    fi
    sleep $DELAY

    # 2. 启动 lhs-dist
    echo -e "${YELLOW}[2/3] 正在启动 lhs-dist...${NC}"
    cd /linhhoasu/lhs/LHS-dist && pm2 start src/app.js --name lhs-dist
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}[2/3] lhs-dist 启动成功${NC}"
    else
        echo -e "${RED}[2/3] lhs-dist 启动失败，请检查日志${NC}"
    fi
    sleep $DELAY

    # 3. 启动 lhs-admin
    echo -e "${YELLOW}[3/3] 正在启动 lhs-admin...${NC}"
    cd /linhhoasu/lhs/LHS-admin && LHS_ADMIN_PORT=8082 GAME_ADMIN_ORIGIN='http://127.0.0.1:8080' DIST_ADMIN_ORIGIN='http://127.0.0.1:3001' pm2 start server.js --name lhs-admin
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}[3/3] lhs-admin 启动成功${NC}"
    else
        echo -e "${RED}[3/3] lhs-admin 启动失败，请检查日志${NC}"
    fi

    echo -e "${GREEN}===== 所有服务启动完成 =====${NC}"
    pm2 status
}

stop() {
    echo -e "${YELLOW}===== 停止所有服务 =====${NC}"
    pm2 stop newServer 2>/dev/null
    pm2 stop lhs-s1001 2>/dev/null
    pm2 stop lhs-dist 2>/dev/null
    pm2 stop lhs-admin 2>/dev/null
    echo -e "${GREEN}所有服务已停止${NC}"
    pm2 status
}

restart() {
    echo -e "${YELLOW}===== 重启所有服务 =====${NC}"
    stop
    sleep 2
    start
}

status() {
    echo -e "${YELLOW}===== 服务状态 =====${NC}"
    pm2 status
}

case "$1" in
    start)
        start
        ;;
    stop)
        stop
        ;;
    restart)
        restart
        ;;
    status)
        status
        ;;
    *)
        echo "用法: $0 {start|stop|restart|status}"
        exit 1
        ;;
esac
