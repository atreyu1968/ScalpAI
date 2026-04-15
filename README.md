# ⚡ ScalpAI

Plataforma multi-usuario de crypto scalping con señales de trading impulsadas por IA (DeepSeek), datos de mercado en tiempo real vía WebSocket (Binance), modos de paper/live trading, dashboard completo en React totalmente en español, soporte PWA y diseño completamente responsive.

## Características

- **Señales de IA**: Análisis de mercado con DeepSeek AI — indicadores técnicos (RSI, VWAP, volatilidad), volumen, profundidad del libro de órdenes
- **Trading en tiempo real**: Conexión WebSocket con Binance (spot y futuros) para datos de mercado en vivo
- **Paper Trading**: Simulación contra libro de órdenes real con slippage y comisiones modeladas
- **Live Trading**: Ejecución real de órdenes vía ccxt (spot/futuros, IOC limit orders)
- **Gestión de riesgo**: Stop-loss por operación, drawdown diario con auto-pausa, kill switch, botón de pánico
- **Dashboard completo**: Interfaz React moderna con gráficos TradingView, libro de órdenes en vivo, métricas PnL
- **Multi-usuario**: Sistema de roles (admin/usuario), gestión de bots independiente por usuario
- **Seguridad**: JWT + Argon2, 2FA con TOTP, cifrado AES-256-GCM para claves API de Binance
- **Verificación de correo**: Confirmación de cuenta por email y recuperación de contraseña
- **SMTP configurable**: Configuración del servidor de correo desde el panel de administración
- **PWA**: Instalable en móvil y escritorio como aplicación nativa
- **Responsive**: Optimizado para desktop, tablet y móvil
- **Idioma**: Toda la interfaz en español

## Stack Tecnológico

| Componente | Tecnología |
|---|---|
| Backend | Node.js + Express 5 + TypeScript |
| Frontend | React 18 + Vite + TailwindCSS + shadcn/ui |
| Base de datos | PostgreSQL + Drizzle ORM |
| IA | DeepSeek (deepseek-chat) API directa |
| Mercado | Binance WebSocket (spot + futuros) |
| Trading | ccxt (Binance spot/futuros) |
| Auth | JWT + Argon2 + TOTP (2FA) |
| Email | Nodemailer (SMTP configurable) |
| Monorepo | pnpm workspaces |
| Build | esbuild (server) + Vite (dashboard) |

## Requisitos del Servidor

- **OS**: Ubuntu 22.04 o 24.04
- **RAM**: 1 GB mínimo (2 GB recomendado)
- **Disco**: 2 GB libres
- **Acceso**: root o sudo

## Instalación Rápida

En un servidor Ubuntu limpio, ejecuta:

```bash
apt update && apt install -y curl git
curl -fsSL https://raw.githubusercontent.com/atreyu1968/ScalpAI/main/install.sh | sudo bash
```

O manualmente:

```bash
apt update && apt install -y curl git
git clone https://github.com/atreyu1968/ScalpAI.git
cd ScalpAI
sudo bash install.sh
```

El instalador automáticamente:
1. Actualiza el sistema operativo
2. Instala Node.js 20, PostgreSQL, Nginx, pnpm
3. Crea la base de datos y usuario del sistema
4. Genera secretos seguros (JWT, cifrado)
5. Pide la API key de DeepSeek (opcional, para señales de IA)
6. Compila el dashboard y el servidor
7. Aplica el esquema de base de datos
8. **Pide crear un usuario administrador** si no existe
9. Configura systemd, Nginx y firewall
10. Ofrece configurar Cloudflare Tunnel (opcional)

## Actualización

```bash
cd /var/www/scalpai
sudo bash install.sh
```

El instalador detecta automáticamente que es una actualización y preserva:
- Credenciales de base de datos
- Secretos JWT y de cifrado
- API key de DeepSeek
- Usuario administrador existente

## Configuración

### Variables de Entorno

La configuración se guarda en `/etc/scalpai/env` (fuera del repositorio):

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Conexión PostgreSQL |
| `JWT_SECRET` | Secreto para tokens JWT |
| `ENCRYPTION_MASTER_KEY` | Clave maestra AES-256 para cifrado de API keys |
| `PORT` | Puerto del servidor (default: 5000) |
| `APP_URL` | URL pública de la app (para links en emails) |
| `DEEPSEEK_API_KEY` | API key de DeepSeek (para señales de IA) |

### Configuración SMTP

La configuración del servidor de correo se realiza desde el panel de administración:

1. Inicia sesión como administrador
2. Ve a **Administración** en la barra lateral
3. Completa la sección **Configuración de Correo (SMTP)**
4. Usa **Probar Conexión** para verificar
5. Guarda la configuración

Ejemplos de configuración SMTP:

| Proveedor | Host | Puerto | SSL/TLS |
|---|---|---|---|
| Gmail | smtp.gmail.com | 587 | No (STARTTLS) |
| Gmail (SSL) | smtp.gmail.com | 465 | Sí |
| Outlook | smtp.office365.com | 587 | No (STARTTLS) |
| SendGrid | smtp.sendgrid.net | 587 | No |

> **Gmail**: Usa una "Contraseña de aplicación" (no tu contraseña normal). Actívala en: Google Account → Seguridad → Verificación en 2 pasos → Contraseñas de aplicaciones.

### DeepSeek (IA)

Para habilitar las señales de trading con IA:

1. Crea una cuenta en [platform.deepseek.com](https://platform.deepseek.com/)
2. Genera una API key
3. Agrégala durante la instalación o edita `/etc/scalpai/env`:
   ```
   DEEPSEEK_API_KEY=tu_api_key
   ```
4. Reinicia: `sudo systemctl restart scalpai`

También puedes configurar la API desde el panel de administración → Configuración de IA.

### Cloudflare Tunnel

Si configuraste Cloudflare Tunnel durante la instalación, tu app será accesible vía HTTPS a través de tu dominio. Para configurarlo después:

1. Crea un tunnel en el [dashboard de Cloudflare Zero Trust](https://one.dash.cloudflare.com/)
2. En la configuración del tunnel, añade un **Public Hostname**:
   - **Subdomain**: el subdominio deseado (ej: `trading`)
   - **Domain**: tu dominio (ej: `midominio.com`)
   - **Service**: `HTTP` → `localhost:80`
3. Copia el token del tunnel e instálalo en el servidor:

```bash
curl -L -o /tmp/cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i /tmp/cloudflared.deb
sudo cloudflared service install TU_TOKEN
sudo systemctl enable cloudflared
sudo systemctl start cloudflared
```

4. Actualiza `APP_URL` en `/etc/scalpai/env` con tu dominio público:
   ```
   APP_URL=https://trading.midominio.com
   ```
5. Reinicia el servicio: `sudo systemctl restart scalpai`

## Uso

### Primer Acceso

1. Abre la app en tu navegador (IP del servidor o dominio Cloudflare)
2. Inicia sesión con el usuario administrador creado durante la instalación
3. Configura el SMTP en **Administración** para habilitar la verificación de correo
4. Los nuevos usuarios se registran y deben confirmar su correo

### Panel Principal

- **Dashboard**: Métricas generales, estado de bots, sentimiento IA
- **Bots**: Crear y gestionar bots de trading (par, modo, apalancamiento, capital, riesgo)
- **Operaciones**: Historial de trades con filtros y exportación CSV
- **Ajustes**: Perfil, 2FA, gestión de claves API de Binance
- **Administración**: Gestión de usuarios, configuración SMTP (solo admin)

### Gestión de Bots

1. Ve a **Bots** → **Crear Bot**
2. Configura: nombre, par (ej. BTC/USDT), modo (paper/live), apalancamiento, capital
3. Inicia el bot — recibirá señales de IA y ejecutará operaciones automáticamente
4. Usa **Stop** para detener o **Kill** para emergencias

## Comandos de Administración

```bash
# Estado del servicio
sudo systemctl status scalpai

# Ver logs en tiempo real
sudo journalctl -u scalpai -f

# Reiniciar la aplicación
sudo systemctl restart scalpai

# Reiniciar todo
sudo systemctl restart scalpai nginx postgresql

# Ver configuración
sudo cat /etc/scalpai/env

# Verificar puertos
ss -ltnp | grep :5000

# Probar conexión local
curl http://localhost:5000/api/healthz

# Acceder a la base de datos
sudo -u postgres psql -d scalpai
```

## Solución de Problemas

| Problema | Causa | Solución |
|---|---|---|
| No carga la página | Servicio caído | `sudo systemctl restart scalpai` |
| Error 502 en Nginx | Servidor no responde | Revisar logs: `journalctl -u scalpai -n 50` |
| No se envían correos | SMTP no configurado | Configurar en Admin → Correo SMTP |
| Login falla después de registrarse | Email no verificado | Verificar correo o verificar manualmente en BD |
| Señales IA no funcionan | API key faltante | Agregar `DEEPSEEK_API_KEY` en `/etc/scalpai/env` o configurar en Admin → IA |
| WebSocket desconecta | Timeout de proxy | Verificar configuración de Nginx (proxy_read_timeout) |
| Error 521 en Cloudflare | Tunnel no conecta | `sudo systemctl restart cloudflared` |
| Base de datos no conecta | PostgreSQL caído | `sudo systemctl start postgresql` |

### Verificar Email Manualmente (sin SMTP)

Si no tienes SMTP configurado, puedes verificar usuarios directamente:

```bash
sudo -u postgres psql -d scalpai -c "UPDATE users SET email_verified = true WHERE email = 'usuario@correo.com';"
```

## Estructura del Proyecto

```
ScalpAI/
├── artifacts/
│   ├── api-server/          # Servidor Express + WebSocket
│   │   ├── src/
│   │   │   ├── routes/      # Endpoints API (auth, bots, trades, admin, etc.)
│   │   │   ├── services/    # Trading engine (market data, bot manager, risk)
│   │   │   ├── lib/         # JWT, crypto, email, logger
│   │   │   └── middlewares/ # Auth, admin
│   │   └── dist/            # Build de producción
│   └── dashboard/           # React + Vite + TailwindCSS
│       ├── src/
│       │   ├── pages/       # Login, register, dashboard, bots, trades, settings, admin
│       │   ├── components/  # Layout, price-chart, order-book, UI components
│       │   └── contexts/    # AuthContext
│       └── dist/public/     # Build estático (servido por Express)
├── lib/
│   ├── db/                  # Schema Drizzle ORM (users, bots, trades, apiKeys, emailSettings)
│   ├── api-zod/             # Schemas Zod (validación)
│   └── api-client-react/    # React Query hooks (generados por Orval)
├── install.sh               # Autoinstalador para Ubuntu
└── README.md
```

## API Endpoints

### Autenticación
- `POST /api/auth/register` — Registro (envía correo de verificación)
- `POST /api/auth/login` — Login (requiere email verificado, soporta 2FA)
- `POST /api/auth/verify-email` — Verificar correo con token
- `POST /api/auth/resend-verification` — Reenviar verificación
- `POST /api/auth/forgot-password` — Solicitar reseteo de contraseña
- `POST /api/auth/reset-password` — Restablecer contraseña con token
- `GET /api/auth/profile` — Perfil del usuario

### Bots
- `GET /api/bots` — Listar bots
- `POST /api/bots` — Crear bot
- `GET /api/bots/:id` — Detalle de bot
- `PATCH /api/bots/:id` — Actualizar bot
- `DELETE /api/bots/:id` — Eliminar bot
- `POST /api/bots/:id/start` — Iniciar bot
- `POST /api/bots/:id/stop` — Detener bot
- `POST /api/bots/:id/kill` — Kill switch de emergencia
- `POST /api/bots/kill-all` — Botón de pánico (detener todos)

### Operaciones
- `GET /api/trades` — Historial de trades
- `GET /api/trades/:id` — Detalle de trade

### Administración
- `GET /api/admin/users` — Listar usuarios
- `GET /api/admin/users/:id` — Detalle de usuario
- `GET /api/admin/email-settings` — Configuración SMTP
- `PUT /api/admin/email-settings` — Guardar configuración SMTP
- `POST /api/admin/email-settings/test` — Probar conexión SMTP

### WebSocket
- `WS /ws/market?token=JWT` — Datos de mercado en tiempo real (trades, order book)

## Licencia

MIT
