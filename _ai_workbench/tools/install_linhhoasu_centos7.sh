#!/usr/bin/env bash
set -Eeuo pipefail

# Installer Linh Họa Sư cho CentOS 7/9.
# Chạy bằng root:
#   APP_ROOT=/linhhoasu bash install_linhhoasu_centos7.sh
# Tuỳ chọn:
#   DISABLE_FIREWALL=1  (chỉ dùng cho VM test nếu thật sự cần)
#   START_SERVICES=0    (chỉ cài môi trường, không khởi động PM2)

APP_ROOT="${APP_ROOT:-/linhhoasu}"
SOFT_DIR="$APP_ROOT/soft"
NODE_VERSION="${NODE_VERSION:-20.19.1}"
NODE_PREFIX="${NODE_PREFIX:-/usr/local/nodejs}"
START_SERVICES="${START_SERVICES:-1}"
DISABLE_FIREWALL="${DISABLE_FIREWALL:-0}"

log() { printf '\033[0;32m[linhhoasu] %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m[linhhoasu] %s\033[0m\n' "$*" >&2; }
die() { printf '\033[0;31m[linhhoasu] %s\033[0m\n' "$*" >&2; exit 1; }
trap 'die "Lỗi tại dòng $LINENO: $BASH_COMMAND"' ERR

[[ "$(id -u)" -eq 0 ]] || die "Script phải chạy bằng root."
[[ -d "$APP_ROOT" ]] || die "Không tìm thấy APP_ROOT=$APP_ROOT"
[[ "$(uname -m)" == "x86_64" ]] || die "Chỉ hỗ trợ Linux x86_64."

if [[ -r /etc/centos-release ]]; then
  OS_NAME="$(cat /etc/centos-release)"
else
  OS_NAME="$(. /etc/os-release && printf '%s' "${PRETTY_NAME:-unknown}")"
fi
log "OS: $OS_NAME"

yum install -y gcc-c++ make python3 python3-pip curl tar xz

TOOLSET=""
if grep -qE 'release 7([.]|$)' /etc/centos-release 2>/dev/null; then
  for candidate in 11 10 9 8; do
    if yum install -y "devtoolset-${candidate}-gcc-c++" >/dev/null 2>&1; then
      TOOLSET="$candidate"
      break
    fi
  done
  [[ -n "$TOOLSET" ]] || die "Không cài được devtoolset GCC 8+ từ repo SCLo."
  # shellcheck disable=SC1090
  source "/opt/rh/devtoolset-${TOOLSET}/enable"
  log "Compiler: $(g++ --version | head -n 1)"
fi

mkdir -p "$SOFT_DIR"
NODE_DIR="node-v${NODE_VERSION}-linux-x64"
ARCHIVE_NAME="$NODE_DIR.tar.xz"

node_works() {
  [[ -x "$NODE_PREFIX/bin/node" ]] && "$NODE_PREFIX/bin/node" -e 'process.exit(0)' >/dev/null 2>&1
}

if ! node_works; then
  if grep -qE 'release 7([.]|$)' /etc/centos-release 2>/dev/null; then
    ARCHIVE_NAME="${NODE_DIR}-glibc-217.tar.xz"
    NODE_URL="https://unofficial-builds.nodejs.org/download/release/v${NODE_VERSION}/${ARCHIVE_NAME}"
    EXTRACTED_DIR="${NODE_DIR}-glibc-217"
  else
    NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/${ARCHIVE_NAME}"
    EXTRACTED_DIR="$NODE_DIR"
  fi

  ARCHIVE_PATH="$SOFT_DIR/$ARCHIVE_NAME"
  if [[ ! -s "$ARCHIVE_PATH" ]]; then
    log "Tải Node.js $NODE_VERSION"
    curl -fL --retry 3 --connect-timeout 20 "$NODE_URL" -o "$ARCHIVE_PATH"
  fi

  rm -rf "$SOFT_DIR/$NODE_DIR" "$SOFT_DIR/${NODE_DIR}-glibc-217"
  tar -xJf "$ARCHIVE_PATH" -C "$SOFT_DIR"
  [[ -d "$SOFT_DIR/$EXTRACTED_DIR" ]] || die "Giải nén Node thất bại: $EXTRACTED_DIR"

  if [[ -d "$NODE_PREFIX" ]]; then
    mv "$NODE_PREFIX" "${NODE_PREFIX}.backup.$(date +%Y%m%d_%H%M%S)"
  fi
  mv "$SOFT_DIR/$EXTRACTED_DIR" "$NODE_PREFIX"
fi

ln -sfn "$NODE_PREFIX/bin/node" /usr/local/bin/node
ln -sfn "$NODE_PREFIX/bin/npm" /usr/local/bin/npm

if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2 --unsafe-perm
fi
ln -sfn "$NODE_PREFIX/bin/pm2" /usr/local/bin/pm2
ln -sfn "$NODE_PREFIX/bin/pm2-runtime" /usr/local/bin/pm2-runtime

# Headers chính thức giúp node-gyp không phải tải từ mirror unofficial.
HEADER_DIR="/tmp/node-v${NODE_VERSION}-headers"
HEADER_TAR="$SOFT_DIR/node-v${NODE_VERSION}-headers.tar.gz"
if [[ ! -f "$NODE_PREFIX/include/node/common.gypi" ]]; then
  curl -fL --retry 3 --connect-timeout 20 \
    "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-headers.tar.gz" \
    -o "$HEADER_TAR"
  rm -rf "$HEADER_DIR"
  mkdir -p "$HEADER_DIR"
  tar -xzf "$HEADER_TAR" -C "$HEADER_DIR" --strip-components=1
  cp -a "$HEADER_DIR/include" "$NODE_PREFIX/"
fi

# Đồng bộ path của bộ source nếu gói được copy từ bản dùng /data.
for file in "$APP_ROOT/setup.sh" "$APP_ROOT/start.sh" "$APP_ROOT/lhs/newServer/ecosystem.config.js"; do
  if [[ -f "$file" ]]; then
    sed -i "s#/data/#${APP_ROOT%/}/#g" "$file"
  fi
done

rebuild_app() {
  local app_dir="$1"
  [[ -f "$app_dir/package.json" ]] || { warn "Bỏ qua $app_dir (không có package.json)"; return 0; }
  log "Cài dependency: $app_dir"
  cd "$app_dir"
  npm install --production
  if [[ -d node_modules/bcrypt ]]; then
    npm_config_nodedir="$NODE_PREFIX" npm rebuild bcrypt --build-from-source
  fi
}

rebuild_app "$APP_ROOT/lhs/newServer"
rebuild_app "$APP_ROOT/lhs/LHS-dist"

if [[ "$DISABLE_FIREWALL" == "1" ]]; then
  warn "DISABLE_FIREWALL=1: dừng và disable firewalld trên máy này."
  systemctl stop firewalld 2>/dev/null || true
  systemctl disable firewalld 2>/dev/null || true
fi

if [[ "$START_SERVICES" == "1" ]]; then
  log "Khởi động PM2"
  cd "$APP_ROOT"
  if [[ -x "$APP_ROOT/start.sh" ]]; then
    "$APP_ROOT/start.sh" start || true
  else
    pm2 describe lhs-s1001 >/dev/null 2>&1 && pm2 restart lhs-s1001 || (cd "$APP_ROOT/lhs/newServer" && pm2 start ecosystem.config.js)
    pm2 describe lhs-dist >/dev/null 2>&1 && pm2 restart lhs-dist || (cd "$APP_ROOT/lhs/LHS-dist" && pm2 start src/app.js --name lhs-dist)
    pm2 describe lhs-admin >/dev/null 2>&1 && pm2 restart lhs-admin || (cd "$APP_ROOT/lhs/LHS-admin" && LHS_ADMIN_PORT=8082 GAME_ADMIN_ORIGIN='http://127.0.0.1:8080' DIST_ADMIN_ORIGIN='http://127.0.0.1:3001' pm2 start server.js --name lhs-admin)
  fi
  sleep 5
fi

log "node=$(node -v) npm=$(npm -v) pm2=$(pm2 -v | tail -n 1)"
if [[ "$START_SERVICES" == "1" ]]; then
  for spec in "8080 /health" "9200 /health" "3001 /health" "8082 /health"; do
    set -- $spec
    port="$1"; path="$2"
    code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "http://127.0.0.1:${port}${path}" || true)"
    [[ "$code" == "200" ]] || die "Health fail: ${port}${path} => ${code}"
    log "Health ${port}${path} => 200"
  done
  pm2 status
fi

log "Cài đặt hoàn tất."
