#!/bin/bash
set -e

# ============================================================================
# ScalpAI - Autoinstalador para Ubuntu 22.04/24.04
# Plataforma de crypto scalping con IA
# ============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[✓]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[!]${NC} $1"; }
print_error() { echo -e "${RED}[✗]${NC} $1"; }

print_banner() {
    echo -e "${CYAN}"
    echo "  ╔═══════════════════════════════════════════╗"
    echo "  ║          ⚡ ScalpAI Installer ⚡          ║"
    echo "  ║   Crypto Scalping con IA - DeepSeek AI    ║"
    echo "  ╚═══════════════════════════════════════════╝"
    echo -e "${NC}"
}

APP_NAME="scalpai"
APP_DIR="/var/www/$APP_NAME"
CONFIG_DIR="/etc/$APP_NAME"
APP_PORT="5000"
APP_USER="scalpai"
DB_NAME="scalpai"
DB_USER="scalpai"
GITHUB_REPO="https://github.com/atreyu1968/ScalpAI.git"
NODE_VERSION="20"

if [ "$EUID" -ne 0 ]; then
    print_error "Este script debe ejecutarse como root"
    echo "Usa: sudo bash install.sh"
    exit 1
fi

print_banner

IS_UPDATE=false
if [ -f "$CONFIG_DIR/env" ]; then
    IS_UPDATE=true
    source "$CONFIG_DIR/env"
    print_warning "Instalación existente detectada — MODO ACTUALIZACIÓN"
    echo ""
fi

# ============================================================================
# 1. ACTUALIZAR SISTEMA E INSTALAR DEPENDENCIAS BASE
# ============================================================================

print_status "Actualizando sistema operativo..."
apt-get update -qq
apt-get upgrade -y -qq
print_success "Sistema actualizado"

print_status "Instalando dependencias base..."
apt-get install -y -qq curl git wget gnupg2 lsb-release ca-certificates \
    build-essential python3 software-properties-common unzip jq
print_success "Dependencias base instaladas"

# ============================================================================
# 2. INSTALAR NODE.JS
# ============================================================================

if ! command -v node &>/dev/null || [[ "$(node -v)" != v${NODE_VERSION}* ]]; then
    print_status "Instalando Node.js ${NODE_VERSION}.x..."
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt-get install -y -qq nodejs
    chmod 755 /usr/bin/node /usr/bin/npm
    print_success "Node.js $(node -v) instalado"
else
    print_success "Node.js $(node -v) ya instalado"
fi

if ! command -v pnpm &>/dev/null; then
    print_status "Instalando pnpm..."
    npm install -g pnpm@latest
    print_success "pnpm instalado"
else
    print_success "pnpm ya instalado"
fi

# ============================================================================
# 3. INSTALAR POSTGRESQL
# ============================================================================

if ! command -v psql &>/dev/null; then
    print_status "Instalando PostgreSQL..."
    apt-get install -y -qq postgresql postgresql-contrib
    systemctl enable postgresql
    systemctl start postgresql
    print_success "PostgreSQL instalado"
else
    print_success "PostgreSQL ya instalado"
    systemctl start postgresql 2>/dev/null || true
fi

# ============================================================================
# 4. INSTALAR NGINX
# ============================================================================

if ! command -v nginx &>/dev/null; then
    print_status "Instalando Nginx..."
    apt-get install -y -qq nginx
    apt-mark manual nginx
    print_success "Nginx instalado"
else
    print_success "Nginx ya instalado"
fi

# ============================================================================
# 5. CREAR USUARIO DEL SISTEMA
# ============================================================================

if ! id "$APP_USER" &>/dev/null; then
    useradd --system --create-home --shell /bin/bash "$APP_USER"
    print_success "Usuario '$APP_USER' creado"
else
    print_success "Usuario '$APP_USER' ya existe"
fi

# ============================================================================
# 6. CONFIGURAR BASE DE DATOS (solo instalación nueva)
# ============================================================================

if [ "$IS_UPDATE" = false ]; then
    DB_PASS=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)

    print_status "Configurando base de datos..."

    sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1 || \
        sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';"

    sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 || \
        sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"

    sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"

    PG_HBA=$(sudo -u postgres psql -t -c "SHOW hba_file" | tr -d ' ')
    if ! grep -q "$DB_USER" "$PG_HBA" 2>/dev/null; then
        sed -i "/^# IPv4 local connections/a host    $DB_NAME    $DB_USER    127.0.0.1/32    md5" "$PG_HBA"
        sed -i "/^# IPv6 local connections/a host    $DB_NAME    $DB_USER    ::1/128         md5" "$PG_HBA"
        systemctl reload postgresql
    fi

    print_success "Base de datos configurada"
else
    print_success "Base de datos existente preservada"
fi

# ============================================================================
# 7. GENERAR CONFIGURACIÓN
# ============================================================================

mkdir -p "$CONFIG_DIR"

if [ "$IS_UPDATE" = false ]; then
    JWT_SECRET=$(openssl rand -base64 48)
    ENCRYPTION_MASTER_KEY=$(openssl rand -base64 48)
    DATABASE_URL="postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME"

    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════${NC}"
    echo -e "${BOLD}  Configuración de IA (OpenRouter/DeepSeek)${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════${NC}"
    echo ""
    echo "ScalpAI usa DeepSeek AI vía OpenRouter para señales de trading."
    echo "Puedes obtener una API key en: https://openrouter.ai/"
    echo ""
    read -s -p "API Key de OpenRouter (Enter para omitir): " OPENROUTER_API_KEY
    echo ""
    if [ -n "$OPENROUTER_API_KEY" ]; then
        OPENROUTER_BASE_URL="https://openrouter.ai/api/v1"
    else
        OPENROUTER_BASE_URL=""
        print_warning "IA no configurada — las señales de trading no estarán disponibles"
    fi

    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════${NC}"
    echo -e "${BOLD}  URL de la Aplicación${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════${NC}"
    echo ""
    echo "Si usas Cloudflare, ingresa la URL pública (ej: https://trading.midominio.com)"
    echo "Si no, se usará la IP del servidor automáticamente."
    echo ""
    read -p "URL pública (Enter para usar IP local): " APP_URL_INPUT
    if [ -z "$APP_URL_INPUT" ]; then
        APP_URL_INPUT="http://$(hostname -I | awk '{print $1}')"
    fi

    cat > "$CONFIG_DIR/env" << ENVEOF
NODE_ENV=production
PORT=$APP_PORT
DATABASE_URL=$DATABASE_URL
JWT_SECRET=$JWT_SECRET
ENCRYPTION_MASTER_KEY=$ENCRYPTION_MASTER_KEY
APP_URL=$APP_URL_INPUT
AI_INTEGRATIONS_OPENROUTER_API_KEY=$OPENROUTER_API_KEY
AI_INTEGRATIONS_OPENROUTER_BASE_URL=$OPENROUTER_BASE_URL
ENVEOF

    chmod 600 "$CONFIG_DIR/env"
    chown root:root "$CONFIG_DIR/env"
    print_success "Configuración generada en $CONFIG_DIR/env"
else
    print_success "Configuración existente preservada"
fi

# ============================================================================
# 8. CLONAR/ACTUALIZAR CÓDIGO
# ============================================================================

git config --global --add safe.directory "$APP_DIR"

if [ -d "$APP_DIR/.git" ]; then
    print_status "Actualizando código desde GitHub..."
    cd "$APP_DIR"
    sudo -u "$APP_USER" git pull --ff-only
    print_success "Código actualizado"
else
    print_status "Clonando repositorio..."
    git clone --depth 1 "$GITHUB_REPO" "$APP_DIR"
    chown -R "$APP_USER:$APP_USER" "$APP_DIR"
    print_success "Repositorio clonado"
fi

# ============================================================================
# 9. INSTALAR DEPENDENCIAS Y BUILD
# ============================================================================

print_status "Instalando dependencias del proyecto (esto puede tardar unos minutos)..."
cd "$APP_DIR"

export HOME="/home/$APP_USER"

sudo -u "$APP_USER" -E bash -c "cd $APP_DIR && pnpm install --frozen-lockfile 2>/dev/null || pnpm install"
print_success "Dependencias instaladas"

print_status "Compilando dashboard y API server..."
source "$CONFIG_DIR/env"

sudo -u "$APP_USER" -E bash -c "cd $APP_DIR && export BASE_PATH=/ && export PORT=$APP_PORT && pnpm --filter @workspace/dashboard run build"
print_success "Dashboard compilado"

sudo -u "$APP_USER" -E bash -c "cd $APP_DIR && pnpm --filter @workspace/api-server run build"
print_success "API Server compilado"

# ============================================================================
# 10. MIGRAR BASE DE DATOS
# ============================================================================

print_status "Aplicando esquema de base de datos..."
source "$CONFIG_DIR/env"
sudo -u "$APP_USER" -E bash -c "cd $APP_DIR && export DATABASE_URL='$DATABASE_URL' && pnpm --filter @workspace/db run push"
print_success "Esquema de base de datos aplicado"

# ============================================================================
# 11. CREAR USUARIO ADMINISTRADOR (si no existe)
# ============================================================================

ADMIN_EXISTS=$(sudo -u postgres psql -t -d "$DB_NAME" -c "SELECT COUNT(*) FROM users WHERE role='admin'" 2>/dev/null | tr -d ' ')

if [ "$ADMIN_EXISTS" = "0" ] || [ -z "$ADMIN_EXISTS" ]; then
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════${NC}"
    echo -e "${BOLD}  Crear Usuario Administrador${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════${NC}"
    echo ""

    while true; do
        read -p "Correo del administrador: " ADMIN_EMAIL
        if [[ "$ADMIN_EMAIL" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
            break
        fi
        print_error "Correo inválido, intenta de nuevo"
    done

    while true; do
        read -s -p "Contraseña (mín. 8 caracteres): " ADMIN_PASS
        echo ""
        if [ ${#ADMIN_PASS} -ge 8 ]; then
            read -s -p "Confirmar contraseña: " ADMIN_PASS_CONFIRM
            echo ""
            if [ "$ADMIN_PASS" = "$ADMIN_PASS_CONFIRM" ]; then
                break
            fi
            print_error "Las contraseñas no coinciden"
        else
            print_error "La contraseña debe tener al menos 8 caracteres"
        fi
    done

    cat > /tmp/scalpai_create_admin.cjs << 'ADMINEOF'
const argon2 = require('argon2');
const { Pool } = require('pg');
async function main() {
    const email = process.env.ADMIN_EMAIL;
    const pass = process.env.ADMIN_PASS;
    const dbUrl = process.env.DATABASE_URL;
    if (!email || !pass || !dbUrl) {
        console.error('Missing ADMIN_EMAIL, ADMIN_PASS, or DATABASE_URL');
        process.exit(1);
    }
    const hash = await argon2.hash(pass);
    const pool = new Pool({ connectionString: dbUrl });
    await pool.query(
        `INSERT INTO users (email, password_hash, role, totp_enabled, email_verified, created_at, updated_at)
         VALUES ($1, $2, 'admin', false, true, NOW(), NOW())
         ON CONFLICT (email) DO UPDATE SET role = 'admin', email_verified = true, password_hash = $2`,
        [email, hash]
    );
    await pool.end();
    process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
ADMINEOF

    source "$CONFIG_DIR/env"
    export ADMIN_EMAIL ADMIN_PASS DATABASE_URL
    export NODE_PATH="$APP_DIR/artifacts/api-server/node_modules:$APP_DIR/node_modules"
    sudo -u "$APP_USER" -E node /tmp/scalpai_create_admin.cjs
    unset ADMIN_PASS
    rm -f /tmp/scalpai_create_admin.cjs

    print_success "Administrador '$ADMIN_EMAIL' creado"
else
    print_success "Usuario administrador ya existe"
fi

# ============================================================================
# 12. CONFIGURAR SERVICIO SYSTEMD
# ============================================================================

print_status "Configurando servicio systemd..."

cat > "/etc/systemd/system/$APP_NAME.service" << SVCEOF
[Unit]
Description=ScalpAI - Crypto Scalping Platform
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR/artifacts/api-server
EnvironmentFile=$CONFIG_DIR/env
ExecStart=/usr/bin/node --enable-source-maps ./dist/index.mjs
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$APP_NAME

LimitNOFILE=65535
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable "$APP_NAME"
print_success "Servicio systemd configurado"

# ============================================================================
# 13. CONFIGURAR NGINX
# ============================================================================

print_status "Configurando Nginx..."

cat > "/etc/nginx/sites-available/$APP_NAME" << NGXEOF
upstream scalpai_backend {
    server 127.0.0.1:$APP_PORT;
    keepalive 64;
}

server {
    listen 80;
    server_name _;

    client_max_body_size 50M;

    # Proxy principal (API + Dashboard estático)
    location / {
        proxy_pass http://scalpai_backend;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }

    # WebSocket para datos de mercado en tiempo real
    location /ws/ {
        proxy_pass http://scalpai_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # Archivos estáticos del dashboard (cache largo)
    location /assets/ {
        proxy_pass http://scalpai_backend;
        proxy_set_header Host \$host;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # PWA manifest y service worker
    location = /manifest.json {
        proxy_pass http://scalpai_backend;
        proxy_set_header Host \$host;
        add_header Cache-Control "no-cache";
    }
    location = /sw.js {
        proxy_pass http://scalpai_backend;
        proxy_set_header Host \$host;
        add_header Cache-Control "no-cache";
    }
}
NGXEOF

ln -sf "/etc/nginx/sites-available/$APP_NAME" /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

nginx -t 2>/dev/null
systemctl restart nginx
print_success "Nginx configurado"

# ============================================================================
# 14. CLOUDFLARE TUNNEL (OPCIONAL)
# ============================================================================

echo ""
echo -e "${CYAN}═══════════════════════════════════════════${NC}"
echo -e "${BOLD}  Cloudflare Tunnel (Opcional)${NC}"
echo -e "${CYAN}═══════════════════════════════════════════${NC}"
echo ""
echo "Si usas Cloudflare para acceder, ingresa tu token de tunnel."
echo "De lo contrario, presiona Enter para omitir."
echo ""
read -s -p "Token de Cloudflare Tunnel: " CF_TOKEN
echo ""

if [ -n "$CF_TOKEN" ]; then
    print_status "Instalando Cloudflare Tunnel..."

    if ! command -v cloudflared &>/dev/null; then
        curl -L -o /tmp/cloudflared.deb \
            https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
        dpkg -i /tmp/cloudflared.deb
        rm -f /tmp/cloudflared.deb
    fi

    if cloudflared service install "$CF_TOKEN"; then
        systemctl enable cloudflared
        systemctl restart cloudflared
        print_success "Cloudflare Tunnel configurado"
    else
        print_error "Error al configurar Cloudflare Tunnel — verifica el token"
        print_warning "Puedes configurarlo manualmente después con: cloudflared service install TU_TOKEN"
    fi
else
    print_warning "Cloudflare Tunnel omitido — acceso solo por IP local"
fi

# ============================================================================
# 15. INICIAR APLICACIÓN
# ============================================================================

print_status "Iniciando ScalpAI..."
systemctl restart "$APP_NAME"
sleep 3

if systemctl is-active --quiet "$APP_NAME"; then
    print_success "ScalpAI está ejecutándose"
else
    print_error "ScalpAI no pudo iniciar. Revisa los logs:"
    echo "  journalctl -u $APP_NAME -n 50 --no-pager"
fi

# ============================================================================
# 16. CONFIGURAR FIREWALL (UFW)
# ============================================================================

if command -v ufw &>/dev/null; then
    print_status "Configurando firewall..."
    ufw allow 22/tcp >/dev/null 2>&1
    ufw allow 80/tcp >/dev/null 2>&1
    ufw allow 443/tcp >/dev/null 2>&1
    ufw --force enable >/dev/null 2>&1
    print_success "Firewall configurado (puertos 22, 80, 443)"
fi

# ============================================================================
# RESUMEN FINAL
# ============================================================================

SERVER_IP=$(hostname -I | awk '{print $1}')

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              ⚡ INSTALACIÓN COMPLETADA ⚡               ║${NC}"
echo -e "${GREEN}╠═══════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║${NC}                                                           ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}  URL Local:    ${BOLD}http://$SERVER_IP${NC}"
if [ -n "$CF_TOKEN" ]; then
echo -e "${GREEN}║${NC}  Cloudflare:   Accede por tu dominio configurado"
fi
echo -e "${GREEN}║${NC}                                                           ${GREEN}║${NC}"
if [ -n "$ADMIN_EMAIL" ]; then
echo -e "${GREEN}║${NC}  Admin:        ${BOLD}$ADMIN_EMAIL${NC}"
fi
echo -e "${GREEN}║${NC}                                                           ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}  ${CYAN}Comandos útiles:${NC}"
echo -e "${GREEN}║${NC}    Estado:     systemctl status $APP_NAME"
echo -e "${GREEN}║${NC}    Logs:       journalctl -u $APP_NAME -f"
echo -e "${GREEN}║${NC}    Reiniciar:  systemctl restart $APP_NAME"
echo -e "${GREEN}║${NC}    Actualizar: cd $APP_DIR && sudo bash install.sh"
echo -e "${GREEN}║${NC}                                                           ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}  ${CYAN}Configuración:${NC} $CONFIG_DIR/env"
echo -e "${GREEN}║${NC}  ${CYAN}Aplicación:${NC}    $APP_DIR"
echo -e "${GREEN}║${NC}  ${CYAN}Logs Nginx:${NC}    /var/log/nginx/"
echo -e "${GREEN}║${NC}                                                           ${GREEN}║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
