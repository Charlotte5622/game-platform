#!/bin/bash
# ============================================================
# 游戏平台一键迁移脚本
#
# 旧服务器:  bash migrate.sh export   → 生成 /tmp/game-platform-backup.tar.gz
# 新服务器:  bash migrate.sh import   → 完整部署
# ============================================================
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
PROJECT_DIR="/home/Trui/game-platform"
BACKUP_NAME="game-platform-backup.tar.gz"
DB_NAME="gameplatform"
DB_USER="postgres"

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }
step() { echo -e "\n${CYAN}━━━ $1 ━━━${NC}"; }

# ============================================================
# 导出（旧服务器执行）
# ============================================================
do_export() {
    echo -e "${CYAN}╔══════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║    游戏平台 - 导出备份 (旧服务器)    ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════╝${NC}"
    cd "$PROJECT_DIR"

    step "1/4 导出 PostgreSQL 数据库"
    if pg_dump -U "$DB_USER" -d "$DB_NAME" -F c -f /tmp/gameplatform.dump 2>/dev/null; then
        log "数据库导出成功"
    else
        DB_PASS=$(grep DATABASE_URL ecosystem.config.js | sed -n 's|.*postgres:\([^@]*\)@.*|\1|p')
        if [ -n "$DB_PASS" ]; then
            PGPASSWORD="${DB_PASS}" pg_dump -U "$DB_USER" -h localhost -d "$DB_NAME" -F c -f /tmp/gameplatform.dump
            log "数据库导出成功（密码认证）"
        else
            err "数据库导出失败"
        fi
    fi
    log "数据库大小: $(du -sh /tmp/gameplatform.dump | cut -f1)"

    step "2/4 提取环境变量"
    node -e "
const cfg = require('./ecosystem.config.js');
const env = cfg.apps[0].env;
require('fs').writeFileSync('/tmp/migrate.env',
    Object.entries(env).map(([k,v]) => k+'='+v).join('\n')+'\n');
console.log('提取了 ' + Object.keys(env).length + ' 个变量');
"
    log "环境变量已保存"

    step "3/4 打包项目文件"
    TMPDIR=$(mktemp -d)
    mkdir -p "$TMPDIR/game-platform"
    cp /tmp/gameplatform.dump "$TMPDIR/"
    [ -f /tmp/migrate.env ] && cp /tmp/migrate.env "$TMPDIR/"

    rsync -a --exclude='node_modules' --exclude='.git' \
             --exclude='postgres_data' --exclude='client/dist' \
             --exclude='*.log' --exclude='logs/' \
             "$PROJECT_DIR/" "$TMPDIR/game-platform/"

    cd "$TMPDIR"
    tar czf "/tmp/$BACKUP_NAME" .
    rm -rf "$TMPDIR"

    # 同时把脚本自己也放到 /tmp，方便 scp 后直接用
    cp "$0" /tmp/migrate.sh 2>/dev/null || true

    step "4/4 完成"
    SIZE=$(du -sh "/tmp/$BACKUP_NAME" | cut -f1)
    log "备份文件: /tmp/$BACKUP_NAME ($SIZE)"
    echo ""
    echo "传到新服务器:"
    echo -e "  ${YELLOW}scp /tmp/$BACKUP_NAME /tmp/migrate.sh root@新服务器IP:/tmp/${NC}"
    echo ""
    echo "然后在新服务器执行:"
    echo -e "  ${YELLOW}bash /tmp/migrate.sh import${NC}"
}

# ============================================================
# 导入（新服务器执行）
# ============================================================
do_import() {
    echo -e "${CYAN}╔══════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║    游戏平台 - 一键部署 (新服务器)    ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════╝${NC}"

    # 检查备份文件
    if [ -f "/tmp/$BACKUP_NAME" ]; then
        BACKUP_PATH="/tmp/$BACKUP_NAME"
    elif [ -f "./$BACKUP_NAME" ]; then
        BACKUP_PATH="./$BACKUP_NAME"
    else
        err "找不到备份文件，请先传输到 /tmp/"
    fi

    step "1/8 安装基础环境"
    if command -v apt-get &>/dev/null; then
        PKG="apt-get"; apt-get update -qq
    elif command -v yum &>/dev/null; then
        PKG="yum"
    else
        err "不支持的系统"
    fi

    if ! command -v node &>/dev/null || [[ "$(node -v)" < "v18" ]]; then
        warn "安装 Node.js 22..."
        if [ "$PKG" = "apt-get" ]; then
            curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
            apt-get install -y nodejs
        else
            curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
            yum install -y nodejs
        fi
    fi
    log "Node.js $(node -v) | npm $(npm -v)"

    if ! command -v psql &>/dev/null; then
        warn "安装 PostgreSQL..."
        if [ "$PKG" = "apt-get" ]; then
            sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
            wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add -
            apt-get update -qq && apt-get install -y postgresql
        else
            yum install -y postgresql-server postgresql
            postgresql-setup --initdb
        fi
        systemctl enable postgresql && systemctl start postgresql
    fi
    log "PostgreSQL $(psql --version | awk '{print $3}')"

    command -v pm2 &>/dev/null || npm install -g pm2
    command -v git &>/dev/null || $PKG install -y git
    log "PM2 $(pm2 -v)"

    step "2/8 解压项目"
    mkdir -p "$(dirname "$PROJECT_DIR")"
    tar xzf "$BACKUP_PATH" -C "$(dirname "$PROJECT_DIR")" game-platform/ 2>/dev/null || true
    tar xzf "$BACKUP_PATH" -C /tmp gameplatform.dump migrate.env 2>/dev/null || true
    log "项目已解压到 $PROJECT_DIR"

    step "3/8 加载环境变量"
    if [ -f "/tmp/migrate.env" ]; then
        set -a; source /tmp/migrate.env; set +a
        log "环境变量已加载"
    else
        warn "未找到环境变量文件，需手动配置 ecosystem.config.js"
    fi

    DB_PASS=$(echo "$DATABASE_URL" | sed -n 's|.*postgres:\([^@]*\)@.*|\1|p')

    step "4/8 配置 PostgreSQL"
    sudo -u postgres psql -c "SELECT 1" &>/dev/null || {
        PG_HBA=$(sudo -u postgres psql -t -c "SHOW hba_file" | tr -d ' ')
        [ -f "$PG_HBA" ] && {
            cp "$PG_HBA" "${PG_HBA}.bak"
            sed -i '1i local   all             all                                     trust' "$PG_HBA"
            systemctl restart postgresql; sleep 2
        }
    }
    sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1 || \
        sudo -u postgres createuser -s "$DB_USER"
    sudo -u postgres psql -c "ALTER USER $DB_USER PASSWORD '${DB_PASS:-postgres}';" 2>/dev/null || true
    sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 || \
        sudo -u postgres createdb -O "$DB_USER" "$DB_NAME"
    log "数据库就绪"

    step "5/8 导入数据库"
    if [ -f "/tmp/gameplatform.dump" ]; then
        PGPASSWORD="${DB_PASS}" pg_restore -U "$DB_USER" -h localhost -d "$DB_NAME" \
            --clean --if-exists /tmp/gameplatform.dump 2>&1 | grep -v "WARNING\|does not exist\|already exists" || true
        log "数据库导入完成"
    else
        warn "无数据库备份，将创建空表"
        cd "$PROJECT_DIR/server" && npx prisma db push 2>&1 | tail -3
    fi

    step "6/8 安装依赖"
    cd "$PROJECT_DIR/server"
    npm install --production 2>&1 | tail -2
    npx prisma generate 2>&1 | tail -2
    log "服务端依赖 OK"

    cd "$PROJECT_DIR/client"
    npm install 2>&1 | tail -2
    log "客户端依赖 OK"

    step "7/8 构建前端"
    npm run build 2>&1 | tail -3
    log "前端构建完成"

    NEW_IP=$(hostname -I | awk '{print $1}')
    OLD_IP=$(grep -oP '\d+\.\d+\.\d+\.\d+' "$PROJECT_DIR/ecosystem.config.js" | head -1)
    if [ -n "$NEW_IP" ] && [ "$NEW_IP" != "$OLD_IP" ] && [ -n "$OLD_IP" ]; then
        log "更新 IP: $OLD_IP → $NEW_IP"
        sed -i "s/$OLD_IP/$NEW_IP/g" "$PROJECT_DIR/ecosystem.config.js"
    fi

    step "8/8 启动服务"
    cd "$PROJECT_DIR"
    pm2 delete all 2>/dev/null || true
    pm2 start ecosystem.config.js
    pm2 save
    pm2 startup 2>/dev/null | tail -3 || true
    sleep 3
    pm2 status

    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║         部署完成！                   ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════╝${NC}"
    echo ""
    echo "  前端: http://${NEW_IP}:3001"
    echo "  后端: http://${NEW_IP}:8080"
    echo ""
    echo "  ⚠️  更新 GitHub OAuth 回调地址:"
    echo "    GitHub → Settings → OAuth Apps → Edit"
    echo "    Homepage:  http://${NEW_IP}:3001"
    echo "    Callback:  http://${NEW_IP}:8080/api/auth/github/callback"
    echo ""
}

case "${1:-}" in
    export) do_export ;;
    import) do_import ;;
    *) echo "用法: bash migrate.sh {export|import}" ;;
esac
