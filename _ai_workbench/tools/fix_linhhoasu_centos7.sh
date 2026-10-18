#!/usr/bin/env bash
set -Eeuo pipefail

# FIX-ONLY cho Linh Họa Sư trên CentOS 7.
# Không npm install, không cài lại game, không đụng Nginx/Redis/MongoDB/MySQL.
# Chạy bằng root tại máy đã có /linhhoasu:
#   bash fix_linhhoasu_centos7.sh
# Tuỳ chọn: RESTART_PM2=0 để chỉ sửa runtime/bcrypt, không restart app.

APP_ROOT="${APP_ROOT:-/linhhoasu}"
SOFT_DIR="$APP_ROOT/soft"
NODE_VERSION="${NODE_VERSION:-20.19.1}"
NODE_PREFIX="${NODE_PREFIX:-/usr/local/nodejs}"
RESTART_PM2="${RESTART_PM2:-1}"

log() { printf '\033[0;32m[fix] %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m[fix] %s\033[0m\n' "$*" >&2; }
die() { printf '\033[0;31m[fix] %s\033[0m\n' "$*" >&2; exit 1; }
trap 'die "Lỗi tại dòng $LINENO: $BASH_COMMAND"' ERR

[[ "$(id -u)" -eq 0 ]] || die "Script phải chạy bằng root."
[[ -d "$APP_ROOT/lhs" ]] || die "Không tìm thấy $APP_ROOT/lhs"
[[ "$(uname -m)" == "x86_64" ]] || die "Chỉ hỗ trợ Linux x86_64."

is_centos7=0
if [[ -r /etc/centos-release ]] && grep -qE 'release 7([.]|$)' /etc/centos-release; then
  is_centos7=1
fi

node_works() {
  [[ -x "$NODE_PREFIX/bin/node" ]] && "$NODE_PREFIX/bin/node" -e 'process.exit(0)' >/dev/null 2>&1
}

# 1) Chỉ thay Node khi binary hiện tại thực sự lỗi glibc/không chạy.
if ! node_works; then
  mkdir -p "$SOFT_DIR"
  NODE_DIR="node-v${NODE_VERSION}-linux-x64"
  if [[ "$is_centos7" == "1" ]]; then
    ARCHIVE="${NODE_DIR}-glibc-217.tar.xz"
    EXTRACTED="${NODE_DIR}-glibc-217"
    URL="https://unofficial-builds.nodejs.org/download/release/v${NODE_VERSION}/${ARCHIVE}"
  else
    ARCHIVE="${NODE_DIR}.tar.xz"
    EXTRACTED="$NODE_DIR"
    URL="https://nodejs.org/dist/v${NODE_VERSION}/${ARCHIVE}"
  fi
  if [[ ! -s "$SOFT_DIR/$ARCHIVE" ]]; then
    log "Tải Node.js $NODE_VERSION tương thích hệ thống"
    curl -fL --retry 3 --connect-timeout 20 "$URL" -o "$SOFT_DIR/$ARCHIVE"
  fi
  rm -rf "$SOFT_DIR/$EXTRACTED"
  tar -xJf "$SOFT_DIR/$ARCHIVE" -C "$SOFT_DIR"
  [[ -d "$SOFT_DIR/$EXTRACTED" ]] || die "Giải nén Node thất bại"
  if [[ -d "$NODE_PREFIX" ]]; then
    mv "$NODE_PREFIX" "${NODE_PREFIX}.broken.$(date +%Y%m%d_%H%M%S)"
  fi
  mv "$SOFT_DIR/$EXTRACTED" "$NODE_PREFIX"
else
  log "Node hiện tại đã chạy được; giữ nguyên runtime"
fi

ln -sfn "$NODE_PREFIX/bin/node" /usr/local/bin/node
ln -sfn "$NODE_PREFIX/bin/npm" /usr/local/bin/npm
[[ -x "$NODE_PREFIX/bin/pm2" ]] && ln -sfn "$NODE_PREFIX/bin/pm2" /usr/local/bin/pm2
[[ -x "$NODE_PREFIX/bin/pm2-runtime" ]] && ln -sfn "$NODE_PREFIX/bin/pm2-runtime" /usr/local/bin/pm2-runtime

# 2) CentOS 7 mặc định g++ 4.8 không hiểu -std=gnu++17; chỉ cài compiler fix.
if [[ "$is_centos7" == "1" ]] && ! command -v /opt/rh/devtoolset-11/root/usr/bin/g++ >/dev/null 2>&1; then
  yum install -y devtoolset-11-gcc-c++
fi
if [[ "$is_centos7" == "1" ]]; then
  # shellcheck disable=SC1091
  source /opt/rh/devtoolset-11/enable
fi

# 3) Cài headers nếu node-gyp chưa có; không chạy npm install.
HEADER_TAR="$SOFT_DIR/node-v${NODE_VERSION}-headers.tar.gz"
if [[ ! -f "$NODE_PREFIX/include/node/common.gypi" ]]; then
  curl -fL --retry 3 --connect-timeout 20 \
    "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-headers.tar.gz" \
    -o "$HEADER_TAR"
  HEADER_DIR="/tmp/node-v${NODE_VERSION}-headers"
  rm -rf "$HEADER_DIR"
  mkdir -p "$HEADER_DIR"
  tar -xzf "$HEADER_TAR" -C "$HEADER_DIR" --strip-components=1
  cp -a "$HEADER_DIR/include" "$NODE_PREFIX/"
fi

# 4) Sửa path cũ trong đúng 3 file script/config, không sửa dữ liệu game.
for file in "$APP_ROOT/setup.sh" "$APP_ROOT/start.sh" "$APP_ROOT/lhs/newServer/ecosystem.config.js"; do
  [[ -f "$file" ]] && sed -i "s#/data/#${APP_ROOT%/}/#g" "$file"
done

# 5) Rebuild bcrypt tại chỗ (không cài lại dependency khác).
for app_dir in "$APP_ROOT/lhs/newServer" "$APP_ROOT/lhs/LHS-dist"; do
  [[ -d "$app_dir/node_modules/bcrypt" ]] || die "Thiếu bcrypt tại $app_dir; hãy cài dependency trước."

  # Một số gói server được copy từ máy khác có @mapbox/node-pre-gyp nhưng mất
  # npm executable shim trong node_modules/.bin. Khôi phục đúng symlink cục bộ
  # thay vì chạy npm install toàn bộ và làm trôi phiên bản dependency.
  node_pre_gyp_target="$app_dir/node_modules/@mapbox/node-pre-gyp/bin/node-pre-gyp"
  node_pre_gyp_shim="$app_dir/node_modules/.bin/node-pre-gyp"
  if [[ ! -x "$node_pre_gyp_shim" ]] && [[ -f "$node_pre_gyp_target" ]]; then
    log "Khôi phục node-pre-gyp shim: $app_dir"
    mkdir -p "$app_dir/node_modules/.bin"
    chmod +x "$node_pre_gyp_target"
    ln -sfn ../@mapbox/node-pre-gyp/bin/node-pre-gyp "$node_pre_gyp_shim"
  fi

  log "Rebuild bcrypt: $app_dir"
  (cd "$app_dir" && npm_config_nodedir="$NODE_PREFIX" npm rebuild bcrypt --build-from-source)
  (cd "$app_dir" && node -e 'const b=require("bcrypt"); if (!b.compareSync("fix", b.hashSync("fix", 4))) process.exit(2);')
done

if [[ "$RESTART_PM2" == "1" ]] && command -v pm2 >/dev/null 2>&1; then
  pm2 describe lhs-s1001 >/dev/null 2>&1 && pm2 restart lhs-s1001 --update-env || true
  pm2 describe lhs-dist >/dev/null 2>&1 && pm2 restart lhs-dist --update-env || true
  sleep 5
fi

log "Node=$(node -v), npm=$(npm -v)"
log "Fix bcrypt/path hoàn tất; không chạy npm install và không thay đổi dịch vụ nền."
if [[ "$RESTART_PM2" == "1" ]] && command -v pm2 >/dev/null 2>&1; then
  pm2 status
fi
