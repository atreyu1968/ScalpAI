# ⚡ ScalpAI

Plataforma multi-usuario de crypto scalping con señales de trading impulsadas por IA, datos de mercado en tiempo real vía WebSocket (Binance), modos de paper/live trading, dashboard completo en React totalmente en español, soporte PWA y diseño completamente responsive.

## Características

- **Multi-Proveedor IA**: Soporte para **DeepSeek**, **GPT-4o (OpenAI)**, **Gemini 2.0 Flash (Google)** y **Qwen (Alibaba)** — configurable por usuario o globalmente desde el panel de administración
- **IA por usuario**: Cada usuario puede configurar su propia API key de IA desde Ajustes, eligiendo proveedor, modelo y URL base. Si no configura una, se usa la configuración global del administrador como fallback
- **Tema claro/oscuro**: Toggle de tema en la barra lateral (icono Sol/Luna) con persistencia en localStorage. Todos los gráficos (velas, precio, tooltips) se adaptan automáticamente al tema seleccionado
- **Estrategia Whale Sense**: Fórmula Perfecta de Take Profit basada en RSI, desequilibrio de volumen y momentum
- **Multi Take-Profit (TP1/TP2/TP3)**: Cierre parcial escalonado — TP1 cierra 40% (SL a breakeven), TP2 cierra 35% (SL a TP1), TP3 cierra 25% restante
- **Reversión de posición**: Si la IA detecta señal contraria con alta confianza, cierra la posición actual y abre en dirección opuesta (con cooldown de 60s)
- **Seguimiento de costes IA**: Registro por llamada de tokens input/output y coste en USD, con dashboard de costes diarios, semanales y acumulados
- **Trading en tiempo real**: Conexión WebSocket con Binance (spot y futuros) para datos de mercado en vivo
- **Paper Trading**: Simulación contra libro de órdenes real con slippage y comisiones modeladas
- **Live Trading**: Ejecución real de órdenes vía ccxt (spot/futuros, IOC limit orders)
- **Gestión de riesgo**: Stop-loss por operación (1%), drawdown diario (2%) con auto-pausa, timeout de 10 min por trade, kill switch, botón de pánico
- **Warmup automático**: Al reiniciar el servidor, se cargan 120 velas de 1 min + 60 velas de 5 min desde Binance, para que RSI, EMA, MACD y patrones estén disponibles inmediatamente (sin esperar ~50 min de acumulación)
- **Reconciliación al reiniciar**: Si el servidor se reinicia con posiciones abiertas, se revisan contra el precio actual: cierra automáticamente las que expiraron por timeout o alcanzaron el stop-loss durante el downtime
- **Dashboard completo**: Interfaz React moderna con gráficos TradingView, libro de órdenes en vivo, métricas PnL, indicadores de progreso TP
- **Multi-usuario**: Sistema de roles (admin/usuario), gestión de bots independiente por usuario
- **Registro por invitación**: Solo usuarios con un código de invitación válido pueden registrarse. El admin crea códigos desde el panel (con email opcional y expiración), y los comparte con los usuarios
- **Seguridad**: JWT + Argon2, 2FA con TOTP, cifrado AES-256-GCM para claves API (Binance e IA), protección SSRF (solo HTTPS) para URLs de IA personalizadas, consumo atómico de invitaciones (transacción DB)
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
| IA | DeepSeek / GPT-4o / Gemini 2.0 Flash / Qwen (seleccionable) |
| Mercado | Binance WebSocket (spot + futuros) |
| Trading | ccxt (Binance spot/futuros) |
| Auth | JWT + Argon2 + TOTP (2FA) |
| Email | Nodemailer (SMTP configurable) |
| Monorepo | pnpm workspaces |
| Build | esbuild (server) + Vite (dashboard) |

## Proveedores de IA Soportados

| Proveedor | Modelo | Input/1M tokens | Output/1M tokens | Características |
|---|---|---|---|---|
| DeepSeek | deepseek-chat | $0.27 | $1.10 | El más económico |
| GPT-4o (OpenAI) | gpt-4o | $2.50 | $10.00 | El más fiable y consistente |
| Gemini 2.0 Flash | gemini-2.0-flash | $0.10 | $0.40 | El más rápido y barato |
| Qwen (Alibaba) | qwen-plus | $0.80 | $2.00 | Buen equilibrio calidad/precio |

Todos los proveedores usan la API compatible con OpenAI SDK. El administrador configura el proveedor global desde el panel de administración, y cada usuario puede configurar su propio proveedor y API key desde Ajustes → Configuración de IA.

## Estrategia de Trading (Whale Sense)

### Señales de Entrada
- **LONG**: RSI < 30 (sobreventa) + desequilibrio de volumen positivo + momentum alcista
- **SHORT**: RSI > 70 (sobrecompra) + desequilibrio de volumen negativo + momentum bajista
- **HOLD**: Señales mixtas, RSI neutro (30-70), o spread demasiado amplio

### Multi Take-Profit (Cierre Escalonado)
- **TP1** (base, 0.5%-2.0%): Cierra 40% de la posición, mueve SL a breakeven
- **TP2** (TP1 × 2.5): Cierra 35% de la posición, mueve SL a TP1
- **TP3** (TP1 × 4): Cierra 25% restante, trade completado

### Gestión de Riesgo
- **Stop Loss**: 1% por operación
- **Drawdown diario máximo**: 2% — auto-pausa de 24h
- **Timeout de trade**: 10 minutos — cierra automáticamente si no se alcanza TP/SL
- **Reversión de posición**: Si la IA da señal contraria con confianza ≥ umbral+10%, cierra y abre en nueva dirección (cooldown 60s)

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
5. Pide la API key de IA (opcional, configurable después desde admin o por usuario)
6. Compila el dashboard y el servidor
7. Aplica el esquema de base de datos
8. **Pide crear un usuario administrador** si no existe
9. Configura systemd, Nginx y firewall
10. Ofrece configurar Cloudflare Tunnel (opcional)

### Modo Desatendido

Para instalar sin interacción (CI/CD, scripts, etc.), exporta las variables antes de ejecutar:

```bash
export SCALPAI_ADMIN_EMAIL="admin@example.com"
export SCALPAI_ADMIN_PASS="MiPassword123!"
export SCALPAI_DEEPSEEK_KEY="sk-..."           # Opcional
export SCALPAI_APP_URL="https://trading.midominio.com"  # Opcional (default: IP local)
export SCALPAI_CF_TOKEN="eyJ..."               # Opcional (Cloudflare Tunnel)
sudo -E bash install.sh
```

Si no se exportan las variables, el instalador las pide interactivamente. En modo desatendido (sin terminal), las opciones no proporcionadas se omiten con valores por defecto.

## Actualización

```bash
cd /var/www/scalpai
sudo bash install.sh
```

El instalador detecta automáticamente que es una actualización y preserva:
- Credenciales de base de datos
- Secretos JWT y de cifrado
- Configuración de IA (proveedor, API key)
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
| `DEEPSEEK_API_KEY` | API key de DeepSeek (fallback si no hay config en BD) |

### Configuración de IA (Multi-Proveedor)

#### Configuración Global (Administrador)

La IA global se configura desde el panel de administración y sirve como fallback para usuarios sin configuración propia:

1. Inicia sesión como administrador
2. Ve a **Administración** en la barra lateral
3. En la sección **Configuración de IA**:
   - Selecciona el **proveedor** (DeepSeek, GPT-4o, Gemini, Qwen)
   - La URL base y el modelo se rellenan automáticamente
   - Ingresa la **API Key** del proveedor seleccionado
   - Ajusta el **intervalo de señal** (recomendado: 5-10 segundos)
4. Usa **Probar Conexión** para verificar
5. **Guardar Configuración**

#### Configuración por Usuario

Cada usuario puede configurar su propia API key de IA, independiente de la configuración global:

1. Ve a **Ajustes** en la barra lateral
2. En la sección **Configuración de IA** (icono de cerebro):
   - Selecciona el **proveedor de IA** — la URL base y modelo se rellenan automáticamente
   - Ingresa tu **API Key** personal
   - Opcionalmente, ajusta la URL Base y el Modelo
3. Usa **Probar Conexión** para verificar que tu clave funciona
4. **Guardar Configuración**

> **Prioridad**: Si el usuario tiene IA configurada, se usa su propia clave. Si no, se usa la configuración global del administrador. Las claves de IA del usuario se cifran con AES-256-GCM, igual que las claves de Binance. Las URLs base personalizadas solo aceptan HTTPS por seguridad (protección SSRF).

Links para obtener API keys:
- **DeepSeek**: [platform.deepseek.com](https://platform.deepseek.com/)
- **OpenAI**: [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- **Gemini**: [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
- **Qwen**: [dashscope.console.aliyun.com](https://dashscope.console.aliyun.com/)

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
3. Configura la IA en **Administración → Configuración de IA** (selecciona proveedor y API key)
4. Configura el SMTP en **Administración → Correo SMTP** para habilitar la verificación de correo
5. Crea códigos de invitación en **Administración → Invitaciones** y compártelos con los usuarios que quieras invitar
6. Los nuevos usuarios se registran con su código de invitación y deben confirmar su correo

### Panel Principal

- **Dashboard**: Métricas generales, estado de bots, sentimiento IA
- **Bots**: Crear y gestionar bots de trading (par, modo, apalancamiento, capital, riesgo)
- **Operaciones**: Historial de trades con filtros, progreso de TP y exportación CSV
- **Ajustes**: Perfil, 2FA, gestión de claves API de Binance, configuración de IA personal (proveedor y API key propios)
- **Administración**: Gestión de usuarios, invitaciones, configuración de IA (multi-proveedor), costes de IA, configuración SMTP (solo admin)

### Gestión de Bots

1. Ve a **Bots** → **Crear Bot**
2. Configura: nombre, par (ej. BTC/USDT), modo (paper/live), apalancamiento, capital
3. Inicia el bot — recibirá señales de IA y ejecutará operaciones automáticamente
4. Usa **Stop** para detener o **Kill** para emergencias

## Monitorización de Costes IA

El panel de administración incluye un dashboard de costes en tiempo real:

- **Coste diario**: Total gastado hoy en llamadas a la IA
- **Llamadas diarias**: Número de consultas a la IA del día
- **Tokens**: Desglose de tokens de input y output consumidos
- **Desglose por proveedor**: Coste separado por cada proveedor utilizado
- **Historial semanal**: Costes de los últimos 7 días
- **Estimación**: Coste diario estimado según el intervalo de señal configurado
- **Total acumulado**: Coste total desde el inicio

## Comportamiento al Reiniciar

Cuando el servidor se reinicia (por actualización, mantenimiento, o caída), ScalpAI ejecuta automáticamente los siguientes pasos antes de reanudar la operación normal:

1. **Warmup de datos históricos**: Descarga 120 velas de 1 minuto y 60 velas de 5 minutos desde Binance para cada par activo. Esto alimenta inmediatamente los indicadores técnicos (RSI, EMA, MACD) y el motor de reconocimiento de patrones, eliminando el período de espera de ~50 minutos que se necesitaría para acumular datos desde cero.

2. **Reconciliación de posiciones abiertas**: Si había trades abiertos al momento de la caída:
   - **Timeout expirado**: Cierra automáticamente trades que superaron los 10 minutos de duración durante el downtime
   - **Stop-loss alcanzado**: Cierra trades donde el precio actual ya ha roto el nivel de stop-loss
   - **Trades válidos**: Continúa el monitoreo normal, registrando en los logs su estado actual (precio de entrada, precio actual, P&L%)

3. **Auto-reanudación de bots**: Todos los bots que estaban activos antes de la caída se reinician automáticamente

4. **Reconexión WebSocket**: Se restablecen las conexiones de datos de mercado con Binance

> **Resultado**: Los bots vuelven a operar en menos de 10 segundos tras el reinicio, con indicadores técnicos completos y sin perder posiciones abiertas.

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
| Señales IA no funcionan | IA no configurada | Configurar proveedor y API key en Admin → Configuración de IA |
| Señales IA tardan en llegar tras reinicio | Warmup no ejecutado | Se ejecuta automáticamente; verificar logs: `journalctl -u scalpai -n 50` |
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
│   │   │   ├── routes/      # Endpoints API (auth, bots, trades, admin, aiSettings)
│   │   │   ├── services/    # Trading engine (market data, bot manager, signal, risk)
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
│   ├── db/                  # Schema Drizzle ORM (users, bots, trades, apiKeys, aiSettings, aiCostLogs, invitations)
│   ├── api-zod/             # Schemas Zod (validación)
│   └── api-client-react/    # React Query hooks (generados por Orval)
├── install.sh               # Autoinstalador para Ubuntu
├── MANUAL_USUARIO.md        # Manual de usuario completo
└── README.md
```

## API Endpoints

### Autenticación
- `POST /api/auth/register` — Registro con código de invitación (envía correo de verificación)
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
- `GET /api/trades` — Historial de trades (con datos TP1/TP2/TP3, progreso, PnL parcial)
- `GET /api/trades/:id` — Detalle de trade

### IA y Sentimiento
- `GET /api/ai/sentiment` — Listar sentimientos activos por par
- `GET /api/ai/sentiment/:pair` — Detalle de análisis IA para un par

### Invitaciones (Admin)
- `GET /api/admin/invitations` — Listar códigos de invitación
- `POST /api/admin/invitations` — Crear código de invitación (email opcional, expiración opcional)
- `DELETE /api/admin/invitations/:id` — Eliminar código de invitación
- `GET /api/invitations/:code/validate` — Validar un código de invitación (público)

### Administración
- `GET /api/admin/users` — Listar usuarios
- `GET /api/admin/users/:id` — Detalle de usuario
- `GET /api/admin/ai-settings` — Configuración de IA actual
- `PUT /api/admin/ai-settings` — Guardar configuración de IA (proveedor, API key, modelo)
- `POST /api/admin/ai-settings/test` — Probar conexión con el proveedor de IA
- `GET /api/admin/ai-providers` — Listar proveedores disponibles con presets y costes
- `GET /api/admin/ai-cost` — Estadísticas de coste (diario, semanal, acumulado, por proveedor)
- `GET /api/admin/email-settings` — Configuración SMTP
- `PUT /api/admin/email-settings` — Guardar configuración SMTP
- `POST /api/admin/email-settings/test` — Probar conexión SMTP

### IA del Usuario
- `GET /api/user/ai-settings` — Obtener configuración de IA personal
- `PUT /api/user/ai-settings` — Guardar configuración de IA personal (proveedor, API key, baseUrl, modelo)
- `DELETE /api/user/ai-settings` — Eliminar configuración de IA personal (vuelve al fallback global)
- `POST /api/user/ai-settings/test` — Probar conexión con la API de IA personal

### WebSocket
- `WS /ws/market?token=JWT` — Datos de mercado en tiempo real (trades, order book)

## Licencia

MIT
