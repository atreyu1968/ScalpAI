# ⚡ ScalpAI

Plataforma multi-usuario de crypto scalping con señales de trading impulsadas por IA, datos de mercado en tiempo real vía WebSocket (Binance), modos de paper/live trading, dashboard completo en React totalmente en español, soporte PWA y diseño completamente responsive.

## Características

- **Multi-Proveedor IA**: Soporte para **DeepSeek**, **GPT-4o (OpenAI)**, **Gemini 2.0 Flash (Google)** y **Qwen (Alibaba)** — configurable por usuario o globalmente desde el panel de administración. Modo JSON forzado en DeepSeek/OpenAI/Qwen para respuestas estrictamente parseables
- **IA por usuario**: Cada usuario puede configurar su propia API key de IA desde Ajustes. Si no configura una, se usa la global del administrador como fallback
- **Tema claro/oscuro**: Toggle en la barra lateral con persistencia en localStorage. Gráficos y tooltips se adaptan automáticamente
- **Filtros previos anti-IA-ruido**: antes de llamar a la IA se rechazan condiciones desfavorables (ADX < 20, EMAs mezcladas, spread > 3 bps, sin patrones alineados, contra-sesgo de 1H, flujo vendedor/comprador contrario, TP1 inferior al coste de comisiones × 1.5). Esto reduce llamadas a la IA y evita entradas matemáticamente inviables
- **Multi Take-Profit (TP1/TP2/TP3)**: cierre escalonado — TP1 cierra 40% (SL sube a breakeven ajustado por comisiones), TP2 cierra 35% (SL sube a TP1), TP3 cierra 25% restante
- **Breakeven real (post-fees)**: tras TP1, el stop-loss de seguridad se coloca en `+fees_round_trip` en lugar de 0% para que un cierre en "breakeven" deje PnL neto ≥ 0
- **Reversión de posición con anti-whipsaw**: si la IA detecta señal contraria con confianza ≥ umbral + 25 puntos, edad del trade ≥ 5 min y cooldown de inversión ≥ 10 min, cierra y abre en dirección opuesta
- **Circuit breaker**: tras 3 pérdidas consecutivas en el mismo bot, auto-pausa preventiva. Reactivación manual
- **Timeout dinámico**: 15-45 min según volatilidad del par, con extensión automática si el trade está en ganancias cercanas a TP1
- **Seguimiento de costes IA**: registro por llamada de tokens input/output y coste USD, con dashboard diario/semanal/acumulado por proveedor
- **Trading en tiempo real**: WebSocket Binance (spot y futuros USDT-M) para order book, trades y velas 1m/5m
- **Paper Trading**: simulación contra libro real con fees modelados (Spot 0.1% / Futuros 0.05% taker, 0.05%/0.02% maker)
- **Live Trading**: órdenes reales vía ccxt (spot o futuros según leverage; IOC limit orders; fees leídas del fill real)
- **Gestión de riesgo**: stop-loss configurable por bot, drawdown diario con auto-pausa 24h, kill switch por bot y botón de pánico global
- **Warmup automático**: al arrancar se cargan 120 velas 1m + 60 velas 5m desde Binance para que RSI, EMA, MACD, ADX y patrones estén disponibles en < 10 s
- **Reconciliación al reiniciar**: posiciones abiertas se revisan contra precio actual — se cierran las que expiraron por timeout o ya rompieron stop-loss durante el downtime
- **Sistema de logs descargable**: panel admin con tamaño de log, descarga de las últimas N líneas o del archivo completo, rotación manual. Archivos auto-rotados a 100 MB
- **Dashboard completo**: gráfico TradingView, libro de órdenes en vivo, métricas PnL, indicadores de progreso TP
- **Multi-usuario**: roles admin/usuario, bots independientes por usuario
- **Registro por invitación**: el admin crea códigos (con email opcional y expiración). Consumo atómico en transacción DB
- **Seguridad**: JWT + Argon2, 2FA TOTP, cifrado AES-256-GCM para claves API (Binance e IA), SSRF guard (solo HTTPS) para URLs de IA personalizadas
- **Verificación de correo**: confirmación de cuenta + recuperación de contraseña
- **SMTP configurable**: desde el panel de administración
- **PWA**: instalable en móvil y escritorio
- **Responsive**: optimizado para desktop, tablet y móvil
- **Idioma**: toda la interfaz en español

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

## Estrategias de Trading

ScalpAI soporta **dos estrategias** que coexisten en la misma plataforma. Cada bot elige la suya en el momento de creación:

| Estrategia | Tipo | Pares | Modo | Default |
|---|---|---|---|---|
| **Trend-Pullback Spot** | Determinista (sin IA) | BTC/USDT, ETH/USDT | Solo paper, solo spot | ✅ Sí |
| **AI (multi-proveedor)** | LLM + filtros pre-trade | Cualquier par soportado | Paper o live, spot o futuros | No |

> El selector de estrategia aparece en la parte superior del formulario "Crear Bot". Los campos del formulario cambian dinámicamente según la estrategia elegida.

---

## Estrategia 1 — Trend-Pullback Spot (recomendada por defecto)

Sistema **determinista, long-only y solo paper trading** sobre BTC/USDT y ETH/USDT. No usa IA ni LLMs: todas las decisiones se toman a partir de indicadores técnicos clásicos sobre velas reales de Binance. Esto la hace **predecible, auditable y gratuita** (no consume API de IA).

### Idea central

> Comprar **retrocesos saludables hacia EMA50 en 1H dentro de una tendencia alcista confirmada en 4H**, con stop por estructura (ATR), tres take-profits escalonados, y **cierres lógicos automáticos cuando la tesis del trade se invalida** — sin esperar a que el precio toque el SL.

### Filtros de entrada (en orden)

Cada ciclo (~2 segundos) el motor evalúa estos filtros sobre velas cerradas. Si cualquiera falla, no se abre operación y el badge muestra el motivo:

1. **Tendencia macro 4H** — el último cierre de 4H debe estar por encima de EMA50_4h **y** EMA50_4h > EMA200_4h (tendencia alcista confirmada en marco superior).
2. **Pullback a EMA50 1H** — la vela 1H actual debe haber tocado o cruzado la EMA50_1h y cerrar por encima (retroceso confirmado, no caída libre).
3. **RSI(14) 1H entre 40 y 60** — zona neutra que descarta sobrecompras (>60) y debilidad excesiva (<40). Configurable vía `rsiMin`/`rsiMax`.
4. **Spread del libro < 5 bps (0.05 %)** — evita ejecuciones caras en momentos de baja liquidez.
5. **Distancia al stop ≥ 0.8 %** — el stop calculado con ATR(14) × 1.5 debe estar al menos a un 0.8 % del precio (`minimumStopDistance`). Si el ATR comprime demasiado, no se opera (stop muy cercano = falsa señal).
6. **RR neto ≥ 1.5 después de comisiones** — el ratio `(TP1 − fees) / (SL + fees)` debe ser ≥ 1.5. Con `tp1RR = 2.0` y `fees = 0.25 %` round-trip, esto se cumple para cualquier stop ≥ ~1.25 %.
7. **Beneficio neto esperado ≥ 1 % en TP1** — `(distancia_stop × tp1RR) − fees ≥ 0.01`. Descarta señales matemáticamente débiles aunque el RR pase el umbral.

### Cálculo del trade

Una vez todos los filtros pasan:

- **Entrada**: orden límite al precio del último cierre 1H (o ajuste por mid-price si el spread lo permite). El trade espera fill durante el ciclo; si no se llena, se cancela y se vuelve a evaluar.
- **Stop-Loss dinámico**: `entry − ATR(14) × 1.5`, almacenado en el campo `dynamicStopPct` del trade. El monitor usa este stop por trade (no el `stopLossPercent` del bot).
- **Multi Take-Profit (configurable por bot, defaults `tp1RR=2.0`, `tp2RR=3.0`, `tp3RR=5.0`)**:
  - **TP1 (2R)** → cierra 50 % de la posición. Tras TP1 el SL sube a breakeven + comisiones.
  - **TP2 (3R)** → cierra 30 %. SL sube al precio de TP1.
  - **TP3 (5R)** → cierra el 20 % restante con trailing stop activado tras 2R.
- **Tamaño de posición**: deriva de **0.5 % del capital del bot** entre la distancia al stop. Garantiza que el peor caso por trade es siempre el mismo en porcentaje del capital.

> **Invariante RR/comisiones**: el formulario de creación valida `tp1RR > minimumRiskRewardNet` y `tp1RR < tp2RR < tp3RR`. La validación se aplica también en PATCH, fusionando los nuevos overrides con los `strategyParams` previos para detectar combinaciones inválidas.

### Cierres lógicos (independientes del SL/TP)

Esta es la diferencia clave respecto a estrategias clásicas: **el bot no espera a que el precio toque el SL para cerrar un trade cuya tesis se ha invalidado**. En cada ciclo del monitor, *antes* de los chequeos de TP/SL/trailing, se ejecuta `evaluateLogicalExit(bot)` sobre velas cerradas. Si dispara, el trade se cierra a mercado con `reason="logical_exit"` y un motivo específico:

| Motivo | Condición | Lectura |
|---|---|---|
| `ema_cross_bearish_4h` | EMA50_4h ≤ EMA200_4h | Las medias largas se cruzaron a la baja → la tendencia macro se invierte |
| `trend_4h_lost` | Último cierre 4H < EMA200_4h | El precio rompió por debajo de la media de 200 períodos en 4H → tendencia macro perdida |
| `structure_break_1h` | Último cierre 1H < EMA50_1h − k·ATR_1h (k = `structureBreakAtrMultiplier`, default 0.5) | La estructura intermedia se rompió antes de que el SL salte → preserva PnL aún positivo o reduce pérdida |

**Garantías de seguridad de los cierres lógicos**:

- **Sólo velas cerradas**: nunca se cierra por valores intra-vela (evita whipsaw).
- **Defensiva en warmup**: si las velas o los indicadores aún no están listos, `shouldExit = false`. Nunca se cierra por falta de datos.
- **Preserva el PnL parcial**: si TP1 o TP2 ya cerraron porciones, el cierre lógico aplica sólo sobre `remainingQuantity` y suma el `realizedPnl` previo. **No se pierde nada de las ganancias parciales**.
- **Desactivable**: con `enableLogicalExits: false` en `strategyParams` el bot vuelve al comportamiento clásico (sólo SL/TP por precio).
- **Visible en la UI**: el badge del bot muestra "Cierre lógico: tendencia 4H rota / cruce bajista 4H / estructura 1H rota" tras la salida, en color púrpura.

### Precarga eager de velas (warmup instantáneo)

Cuando se arranca un bot trend_pullback (manual o auto-reanudado tras reinicio del servidor), `preloadTrendPullbackKlines(pair)` carga **300 velas 1H + 300 velas 4H** desde Binance REST y suscribe los streams WebSocket `<symbol>@kline_1h` / `_4h` **en paralelo** con el warmup AI clásico de 1m/5m. Para bots ETH/USDT también se precarga BTC/USDT como referencia.

> 300 velas 1H ≈ 12 días de histórico, 300 velas 4H ≈ 50 días — sobra para alimentar EMA50/EMA200 y cubre con margen amplio las últimas 4-8 horas. **El bot deja de mostrar "Calentando velas 4H/1H" en el primer ciclo**: tiene datos completos antes de la primera evaluación a los 2 segundos del start.

### Parámetros configurables (`strategyParams` en `bots`)

Se editan desde el formulario de creación / edición del bot. Todos tienen defaults seguros:

| Parámetro | Default | Significado |
|---|---|---|
| `tp1RR` | `2.0` | Múltiplo R del primer take-profit |
| `tp2RR` | `3.0` | Múltiplo R del segundo take-profit |
| `tp3RR` | `5.0` | Múltiplo R del tercero |
| `minimumStopDistance` | `0.008` (0.8 %) | Distancia mínima al SL para operar |
| `minimumRiskRewardNet` | `1.5` | RR neto mínimo después de fees |
| `estimatedFees` | `0.0025` (0.25 %) | Comisiones round-trip estimadas |
| `rsiMin` / `rsiMax` | `40` / `60` | Banda de RSI(14) 1H aceptada |
| `enableLogicalExits` | `true` | Activa los cierres lógicos por tesis |
| `structureBreakAtrMultiplier` | `0.5` | Holgura del cierre por ruptura de estructura 1H (k·ATR) |
| `capitalRiskPct` | `0.005` (0.5 %) | Riesgo por trade respecto al capital |

### Estados visibles en el badge del bot

El endpoint `/api/ai/bot-phase/:botId` deriva el estado en tiempo real desde la última decisión registrada:

| Estado | Significado |
|---|---|
| `Calentando velas 4H/1H` | Klines aún no están listas (raro tras la precarga eager) |
| `Analizando — tendencia 4H` | Filtro 1 falló |
| `Analizando — sin pullback 1H` | Filtro 2 falló |
| `Analizando — RSI fuera de banda` | Filtro 3 falló |
| `Analizando — spread alto` | Filtro 4 falló |
| `Analizando — stop muy cercano` | Filtro 5 falló |
| `Analizando — RR insuficiente` | Filtro 6 falló |
| `Analizando — beneficio insuficiente` | Filtro 7 falló |
| `Orden límite pendiente` | Entrada colocada, esperando fill |
| `En operación` | Trade abierto, monitor activo |
| `Cierre lógico: tendencia 4H rota` | Cerrado por `trend_4h_lost` |
| `Cierre lógico: cruce bajista 4H` | Cerrado por `ema_cross_bearish_4h` |
| `Cierre lógico: estructura 1H rota` | Cerrado por `structure_break_1h` |

---

## Estrategia 2 — AI (multi-proveedor)

### Cadena de filtros previos (antes de llamar a la IA)

Cada candidato a señal atraviesa estos filtros en orden. Si falla cualquiera, se descarta sin consumir llamada a la IA:

1. **Régimen de mercado** — ADX ≥ 20 (descarta rangos)
2. **Alineación de EMAs** — EMA9/21/50 alineadas (descarta "mezcladas")
3. **Spread del libro** — ≤ 3 bps (0.03%)
4. **Patrones de vela** — al menos un patrón 1m en la dirección del trend
5. **Sesgo 1H** — precio alineado con EMA50 de 1 hora (descarta contracorriente)
6. **Confirmación de flujo** — buyRatio de trades recientes compatible con la dirección (bull ≥ 45% buy, bear ≤ 55%)
7. **Viabilidad de comisiones** — TP1 propuesto por la IA ≥ fees round-trip × 1.5

### Decisión de la IA (si la señal pasa los filtros)

La IA recibe un snapshot con order book (bids/asks, spread, imbalance, VWAP), velas 1m/5m, RSI, EMAs, MACD, ATR, ADX, patrones detectados, trades recientes y el historial de trades cerrados del bot con PnL, para que ajuste su nivel de confianza según qué viene funcionando. Devuelve `{action, confidence, reasoning, takeProfitPct}` en JSON estricto.

### Multi Take-Profit escalonado

- **TP1** (base, 0.5%-2.0%): cierra 40% de la posición, SL sube a **breakeven ajustado por comisiones** (+0.10% Futuros / +0.20% Spot)
- **TP2** (TP1 × 2.5): cierra 35%, SL sube al nivel de TP1
- **TP3** (TP1 × 4): cierra el 25% restante

### Gestión de Riesgo

- **Stop Loss por bot**: configurable (default 0.2%)
- **Drawdown diario máximo**: configurable (default 5%) — auto-pausa 24h
- **Timeout dinámico**: 15-45 min según volatilidad, con extensión si el trade va en ganancias cercanas a TP1
- **Reversión con anti-whipsaw**: señal contraria ejecuta inversión solo si confianza ≥ umbral + 25, edad del trade ≥ 5 min y cooldown de inversión ≥ 10 min
- **Circuit breaker**: 3 pérdidas consecutivas → auto-pausa del bot
- **Pausa por fallos de IA**: 3 errores consecutivos de IA → auto-pausa

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
