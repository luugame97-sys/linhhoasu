#!/bin/bash
set -euo pipefail

# Cài Node.js + PM2 cho Linh Họa Sư.
# CentOS 7 dùng bản glibc-217; Node.js official 20.x yêu cầu glibc 2.28.

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOFT_DIR="$BASE_DIR/soft"
NODE_VERSION="${NODE_VERSION:-20.19.1}"
NODE_PREFIX="/usr/local/nodejs"
NODE_ARCHIVE="node-v${NODE_VERSION}-linux-x64.tar.xz"
NODE_DIR="node-v${NODE_VERSION}-linux-x64"

echo -e "\033[0;32mĐang cài môi trường tại ${BASE_DIR}...\033[0m"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Vui lòng chạy script bằng root." >&2
  exit 1
fi

yum install -y gcc-c++ make python3 python3-pip curl tar xz
if [[ -r /etc/centos-release ]] && grep -qE 'release 7([.]|$)' /etc/centos-release; then
  # bcrypt 5.x cần C++17; CentOS 7 mặc định chỉ có g++ 4.8.
  yum install -y devtoolset-11-gcc-c++
fi
mkdir -p "$SOFT_DIR"

node_works() {
  [[ -x "$NODE_PREFIX/bin/node" ]] && "$NODE_PREFIX/bin/node" -e 'process.exit(0)' >/dev/null 2>&1
}

if ! node_works; then
  # Bản glibc-217 chạy được trên CentOS 7; bản official dùng cho CentOS 8/9.
  if [[ -r /etc/centos-release ]] && grep -qE 'release 7([.]|$)' /etc/centos-release; then
    NODE_URL="https://unofficial-builds.nodejs.org/download/release/v${NODE_VERSION}/${NODE_ARCHIVE%.tar.xz}-glibc-217.tar.xz"
    GLIBC_ARCHIVE="${NODE_DIR}-glibc-217.tar.xz"
  else
    NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_ARCHIVE}"
    GLIBC_ARCHIVE="$NODE_ARCHIVE"
  fi

  if [[ ! -f "$SOFT_DIR/$GLIBC_ARCHIVE" ]]; then
    echo "Tải Node.js ${NODE_VERSION} từ ${NODE_URL}"
    curl -fL --retry 3 --connect-timeout 15 "$NODE_URL" -o "$SOFT_DIR/$GLIBC_ARCHIVE"
  fi

  rm -rf "$SOFT_DIR/$NODE_DIR" "$SOFT_DIR/${NODE_DIR}-glibc-217"
  tar -xJf "$SOFT_DIR/$GLIBC_ARCHIVE" -C "$SOFT_DIR"
  extracted="$SOFT_DIR/$NODE_DIR"
  [[ -d "$SOFT_DIR/${NODE_DIR}-glibc-217" ]] && extracted="$SOFT_DIR/${NODE_DIR}-glibc-217"

  if [[ -d "$NODE_PREFIX" ]]; then
    mv "$NODE_PREFIX" "${NODE_PREFIX}.incompatible.$(date +%Y%m%d_%H%M%S)"
  fi
  mv "$extracted" "$NODE_PREFIX"
fi

ln -sfn "$NODE_PREFIX/bin/node" /usr/local/bin/node
ln -sfn "$NODE_PREFIX/bin/npm" /usr/local/bin/npm

if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2 --unsafe-perm
fi
ln -sfn "$NODE_PREFIX/bin/pm2" /usr/local/bin/pm2
ln -sfn "$NODE_PREFIX/bin/pm2-runtime" /usr/local/bin/pm2-runtime

echo "node=$(node -v)"
echo "npm=$(npm -v)"
echo "pm2=$(pm2 -v | tail -n 1)"
echo -e "\033[0;32mCài môi trường thành công.\033[0m"
