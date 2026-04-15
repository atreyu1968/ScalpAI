# Manual de Usuario — ScalpAI

Plataforma de crypto scalping con inteligencia artificial.

---

## Tabla de Contenidos

1. [Primeros Pasos](#1-primeros-pasos)
2. [Registro y Verificación](#2-registro-y-verificación)
3. [Iniciar Sesión](#3-iniciar-sesión)
4. [Panel Principal (Dashboard)](#4-panel-principal-dashboard)
5. [Gestión de Bots](#5-gestión-de-bots)
6. [Detalle de un Bot](#6-detalle-de-un-bot)
7. [Historial de Operaciones](#7-historial-de-operaciones)
8. [Ajustes de Usuario](#8-ajustes-de-usuario)
9. [Panel de Administración](#9-panel-de-administración)
10. [Cómo Funciona la IA](#10-cómo-funciona-la-ia)
11. [Comisiones de Binance](#11-comisiones-de-binance)
12. [Estrategia Conservadora Recomendada](#12-estrategia-conservadora-recomendada)
13. [Preguntas Frecuentes](#13-preguntas-frecuentes)

---

## 1. Primeros Pasos

### Requisitos

- Un navegador web moderno (Chrome, Firefox, Edge, Safari)
- Conexión a internet
- Para trading real: una cuenta en [Binance](https://www.binance.com/) con claves API

### Instalación como App (PWA)

ScalpAI es una Progressive Web App. Puedes instalarla en tu dispositivo:

- **En PC (Chrome/Edge)**: Haz clic en el icono de instalación en la barra de direcciones
- **En móvil (Android)**: Menú del navegador → "Añadir a pantalla de inicio"
- **En móvil (iOS/Safari)**: Botón compartir → "Añadir a pantalla de inicio"

Una vez instalada, se abrirá como una aplicación nativa sin barra del navegador.

---

## 2. Registro y Verificación

### Crear una Cuenta

1. En la pantalla de login, haz clic en **"Registrarse"**
2. Completa los campos:
   - **Correo electrónico**: Tu dirección de email
   - **Contraseña**: Mínimo 8 caracteres
   - **Confirmar contraseña**: Repite la contraseña
3. Haz clic en **"Crear Cuenta"**
4. Se mostrará una pantalla de confirmación indicando que se ha enviado un correo de verificación

### Verificar tu Correo

1. Revisa tu bandeja de entrada (y la carpeta de spam)
2. Abre el correo de ScalpAI y haz clic en el enlace de verificación
3. Se abrirá la app, verificará tu cuenta y te iniciará sesión automáticamente
4. Si no recibiste el correo, puedes hacer clic en **"Reenviar correo de verificación"**

> **Nota**: Si el servidor no tiene SMTP configurado, el administrador puede verificar tu cuenta manualmente.

---

## 3. Iniciar Sesión

1. Ingresa tu **correo electrónico** y **contraseña**
2. Haz clic en **"Iniciar Sesión"**
3. Si tienes **2FA activado**, se te pedirá un código de 6 dígitos de tu app de autenticación (Google Authenticator, Authy, etc.)

### Recuperar Contraseña

1. En la pantalla de login, haz clic en **"¿Olvidaste tu contraseña?"**
2. Ingresa tu correo electrónico
3. Haz clic en **"Enviar Instrucciones"**
4. Revisa tu correo y sigue el enlace para crear una nueva contraseña

---

## 4. Panel Principal (Dashboard)

El dashboard es la pantalla central donde monitorizas toda tu actividad de trading.

### Tarjetas de Resumen

En la parte superior verás tarjetas con métricas clave:

| Tarjeta | Descripción |
|---|---|
| **Bots Activos** | Número de bots en ejecución |
| **PnL Diario** | Beneficio/pérdida del día actual |
| **PnL Mensual** | Beneficio/pérdida acumulado del mes |
| **Max Drawdown** | Mayor caída de capital registrada |
| **Límite API** | Uso actual del límite de Binance (barra de progreso) |

### Gráficos

- **PnL por Bot**: Gráfico de barras que compara el rendimiento de cada bot
- **Simulado vs Real**: Proporción de capital en modo simulado y real

### Datos en Tiempo Real

- **Conexiones de Mercado**: Estado de la conexión WebSocket con Binance (Spot y Futuros)
- **Sentimiento IA**: Señales actuales de la IA para cada par — indica LONG (compra), SHORT (venta) o HOLD (esperar) con nivel de confianza

### Vista de Mercado

- **Precio en Vivo**: Gráfico de velas del par seleccionado (seleccionable desde un desplegable)
- **Libro de Órdenes**: Visualización en tiempo real de las órdenes de compra (verde) y venta (roja) con profundidad del mercado

### Tablas

- **Operaciones Recientes**: Últimas operaciones ejecutadas por tus bots
- **Resumen de Bots**: Estado actual de todos tus bots con sus métricas

---

## 5. Gestión de Bots

Accede desde la barra lateral → **"Bots"**

### Crear un Bot

1. Haz clic en **"Nuevo Bot"**
2. Completa la configuración:

| Campo | Descripción | Ejemplo |
|---|---|---|
| **Nombre** | Identificador del bot | "Mi Bot BTC" |
| **Par** | Par de trading (cualquier par válido de Binance) | BTC/USDT, ETH/EUR, SOL/USDT |
| **Modo** | Simulado (paper trading) o Real (dinero real) | Simulado |
| **Apalancamiento** | Multiplicador de capital (1x = spot, >1x = futuros) | 1 a 125 |
| **Capital** | Cantidad de capital asignado al bot | 1000 |
| **Confianza IA** | Umbral mínimo de confianza de la IA para operar (0-100) | 70 |
| **Stop Loss** | Pérdida máxima por operación (%) | 2% |
| **Drawdown Diario Máx.** | Pérdida máxima permitida en un día (%) | 5% |

3. Haz clic en **"Crear"**

### Controles del Bot

Cada bot tiene controles de acción:

| Botón | Acción |
|---|---|
| **Play** (triángulo) | Iniciar el bot — empieza a recibir señales y operar |
| **Stop** (cuadrado) | Detener el bot de forma ordenada |
| **Kill** (calavera) | Parada de emergencia — cierra todas las posiciones abiertas inmediatamente |
| **Eliminar** (papelera) | Borrar el bot (lo detiene primero si está activo) |

### Botón de Pánico

El botón **"Detener Todos"** (rojo, en la parte superior) es el kill switch global: detiene todos los bots y cierra todas las posiciones abiertas de inmediato. Úsalo solo en caso de emergencia.

### Estados del Bot

| Estado | Significado |
|---|---|
| **Detenido** | Bot inactivo, no ejecuta operaciones |
| **Activo** | Bot operando normalmente |
| **Pausado** | Bot temporalmente detenido (ej: por exceder drawdown diario). Se reactiva automáticamente tras 24h |

---

## 6. Detalle de un Bot

Haz clic en cualquier bot para ver su detalle completo.

### Métricas de Rendimiento

- **Tasa de Éxito**: Porcentaje de operaciones ganadoras
- **PnL Total**: Beneficio/pérdida acumulado total
- **PnL Diario**: Beneficio/pérdida del día
- **Max Drawdown**: Peor caída registrada

### Gráficos

- **PnL Acumulado**: Línea temporal de evolución del beneficio
- **Precio en Vivo**: Gráfico de velas del par del bot
- **Libro de Órdenes**: Profundidad de mercado del par

### Configuración de Estrategia

Muestra todos los parámetros del bot: par, modo, apalancamiento, capital, umbrales de riesgo, etc.

### Análisis IA

Muestra la última señal de la IA con:
- **Señal**: LONG, SHORT o HOLD
- **Confianza**: Nivel de certeza (0-100%)
- **Razonamiento**: Explicación de la IA sobre por qué tomó esa decisión (basada en RSI, volumen, spread, momentum, etc.)

### Historial de Operaciones

Tabla con todas las operaciones ejecutadas por este bot, incluyendo precio de entrada/salida, comisiones, PnL y señal IA asociada.

---

## 7. Historial de Operaciones

Accede desde la barra lateral → **"Operaciones"**

Vista completa de todas las operaciones de todos tus bots.

### Filtros

- **Estado**: Filtra por estado de la operación:
  - **Todas**: Muestra todas
  - **Abiertas**: Operaciones actualmente en curso
  - **Cerradas**: Operaciones completadas
  - **Canceladas**: Operaciones canceladas

### Exportar

Haz clic en **"CSV"** para descargar el historial de operaciones en formato CSV. Útil para análisis externo, contabilidad o reportes fiscales.

### Navegación

Usa los botones **"Anterior"** y **"Siguiente"** para navegar entre páginas si tienes muchas operaciones.

---

## 8. Ajustes de Usuario

Accede desde la barra lateral → **"Ajustes"**

### Autenticación en Dos Factores (2FA)

La verificación en dos pasos añade una capa extra de seguridad a tu cuenta.

**Activar 2FA:**
1. Haz clic en **"Configurar 2FA"**
2. Se mostrará un código QR
3. Escanéalo con tu app de autenticación (Google Authenticator, Authy, Microsoft Authenticator)
4. Ingresa el código de 6 dígitos que aparece en la app
5. 2FA queda activado

**Desactivar 2FA:**
1. Haz clic en **"Desactivar 2FA"**
2. Se te pedirá un código de verificación de tu app

> **Recomendación**: Activa 2FA siempre, especialmente si vas a operar con dinero real.

### Gestión de Claves API (Binance)

Las claves API conectan ScalpAI con tu cuenta de Binance para ejecutar operaciones.

**Añadir una Clave API:**
1. Haz clic en **"Añadir Clave"**
2. Completa los campos:
   - **Nombre**: Identificador para la clave (ej: "Mi Binance Principal")
   - **API Key**: La clave API de Binance
   - **Secret Key**: El secreto de la API
   - **Código TOTP**: Si tienes 2FA activado, necesitas tu código actual
3. Haz clic en **"Guardar"**

**Seguridad de las claves:**
- Las claves se almacenan **cifradas con AES-256-GCM** en la base de datos
- Nadie puede ver tus claves en texto plano, ni siquiera el administrador
- En la lista de claves, solo se muestra una versión enmascarada (ej: `sk-****...1234`)
- Para modificar o eliminar una clave, se requiere tu código 2FA (si está activado)

**Crear claves API en Binance:**
1. Entra en tu cuenta de [Binance](https://www.binance.com/)
2. Ve a Perfil → **Gestión de API**
3. Crea una nueva clave
4. Activa los permisos necesarios:
   - **Lectura** (obligatorio)
   - **Trading Spot** (para trading sin apalancamiento)
   - **Trading Futuros** (para trading con apalancamiento)
5. **NO actives permisos de retiro** por seguridad
6. Opcionalmente, restringe por IP (la IP de tu servidor)

---

## 9. Panel de Administración

Accede desde la barra lateral → **"Administración"** (solo visible para administradores)

### Estadísticas Globales

Tarjetas con métricas del sistema:
- **Total Usuarios**: Número de usuarios registrados
- **Total Bots**: Número total de bots creados
- **2FA Activado**: Cuántos usuarios tienen verificación en dos pasos

### Configuración de IA (DeepSeek)

Configura la conexión con el modelo de inteligencia artificial que genera las señales de trading.

1. **API Key**: Tu clave de API de DeepSeek (se obtiene en [platform.deepseek.com](https://platform.deepseek.com/))
2. **URL Base**: Dirección del servicio de IA (por defecto: `https://api.deepseek.com`)
3. **Modelo**: El modelo de IA a usar (por defecto: `deepseek-chat`)

**Probar Conexión**: Envía una solicitud de prueba al modelo para verificar que la API Key y la configuración son correctas.

**Guardar Configuración**: Almacena la configuración de forma segura (la API Key se cifra en la base de datos).

> **Nota**: Sin esta configuración, los bots no podrán generar señales de trading con IA.

### Configuración de Correo (SMTP)

Configura el servidor de correo para enviar emails de verificación y recuperación de contraseña.

| Campo | Descripción | Ejemplo |
|---|---|---|
| **Servidor SMTP** | Host del servidor de correo | smtp.gmail.com |
| **Puerto** | Puerto SMTP | 587 |
| **SSL/TLS** | Activar para puerto 465 | No (para 587) |
| **Usuario SMTP** | Correo para autenticación | tu@gmail.com |
| **Contraseña SMTP** | Contraseña o App Password | (contraseña de app) |
| **Nombre remitente** | Nombre que aparece en los correos | ScalpAI |
| **Correo remitente** | Dirección "de" en los correos | noreply@tudominio.com |

**Configuración para Gmail:**
1. Activa la verificación en 2 pasos en tu cuenta de Google
2. Ve a Google Account → Seguridad → Contraseñas de aplicaciones
3. Genera una contraseña para "Correo"
4. Usa esa contraseña (no tu contraseña normal) en el campo "Contraseña SMTP"
5. Host: `smtp.gmail.com`, Puerto: `587`, SSL: desactivado

**Probar Conexión**: Verifica que el servidor SMTP responde correctamente antes de guardar.

### Gestión de Usuarios

Tabla con todos los usuarios registrados mostrando:
- ID, correo, rol, estado de 2FA, número de bots, fecha de registro
- Botón **"Ver"** para ver los detalles de un usuario específico (sus claves API y bots)

---

## 10. Cómo Funciona la IA

### El Rol de la IA

La IA (DeepSeek) actúa como un **analista de mercado automático**. No opera por sí sola — le pasa su decisión al bot, y el bot decide si ejecutarla o no según tus reglas de riesgo. Tú siempre tienes el control final.

### El Ciclo Completo

#### Paso 1 — Recolección de datos (cada 100ms)

El servidor se conecta al WebSocket público de Binance (no requiere cuenta ni claves API) y recibe en tiempo real:

- Cada compra y venta que ocurre en el par (ej: BTC/USDT)
- Las 20 mejores ofertas de compra y venta (libro de órdenes)

#### Paso 2 — Procesamiento de indicadores (cada 2 segundos)

Con esos datos crudos, el sistema calcula automáticamente:

- **Imbalance del libro de órdenes** — ¿Hay más presión compradora o vendedora?
- **Spread** — Diferencia entre mejor compra y mejor venta (spread ancho = mercado arriesgado)
- **Ratio compra/venta** — De los últimos trades, ¿cuántos fueron compras vs ventas?
- **RSI (14 períodos)** — Por encima de 70 = sobrecomprado, por debajo de 30 = sobrevendido
- **Momentum** — Cómo cambió el precio en el último minuto
- **Volatilidad** — Qué tan bruscos son los movimientos

#### Paso 3 — Consulta a la IA (DeepSeek)

Toda esa información se empaqueta y se envía a DeepSeek con instrucciones de análisis. La IA responde con:

- **Acción**: LONG (comprar), SHORT (vender) o HOLD (esperar)
- **Confianza**: Nivel del 0 al 100%
- **Razonamiento**: Explicación breve de por qué tomó esa decisión

#### Paso 4 — Decisión del bot

El bot recibe la señal y aplica tus reglas:

- Si la confianza es **mayor** que tu umbral configurado → ejecuta la operación
- Si es menor → no hace nada
- Si la IA dice HOLD → no hace nada

#### Paso 5 — Gestión de riesgo

Una vez abierta la operación, el sistema de riesgo vigila independientemente:

- Si la pérdida llega al **stop loss** configurado → cierra automáticamente
- Si las pérdidas del día superan el **drawdown diario máximo** → pausa el bot 24 horas

### De Dónde Vienen los Datos

Los datos de mercado vienen de **Binance vía WebSocket público**, que es gratuito y no requiere cuenta:

- **Para ver datos y recibir señales de IA** → no necesitas cuenta de Binance
- **Para modo simulado (paper trading)** → tampoco necesitas claves de Binance
- **Solo para trading real** → necesitas cuenta de Binance con claves API

---

## 11. Comisiones de Binance

### Tabla de Comisiones

| Tipo | Maker | Taker |
|---|---|---|
| **Spot** | 0.10% | 0.10% |
| **Futuros** | 0.02% | 0.05% |
| **Con BNB (descuento 25%)** | 0.075% | 0.075% |

En scalping, normalmente eres **taker** (compras/vendes al precio de mercado). Cada operación completa tiene entrada + salida, así que pagas comisión dos veces:

- **Spot**: 0.10% × 2 = **0.20% por operación completa**
- **Futuros**: 0.05% × 2 = **0.10% por operación completa**

Esto significa que tu operación necesita moverse al menos un 0.20% (spot) o 0.10% (futuros) solo para cubrir comisiones, antes de ganar nada.

---

## 12. Estrategia Conservadora Recomendada

### Para Empezar (Modo Simulado)

| Parámetro | Valor recomendado | Por qué |
|---|---|---|
| **Par** | BTC/USDT o ETH/USDT | Son los más líquidos, menor spread, más datos para la IA |
| **Modo** | Simulado | Hasta ver resultados consistentes durante semanas |
| **Apalancamiento** | 1x | Sin apalancamiento = sin riesgo de liquidación |
| **Capital** | 100-500 USDT | Suficiente para ver resultados reales sin arriesgar mucho |
| **Confianza IA** | 75-80% | Solo operar con señales de alta convicción |
| **Stop Loss** | 0.5-1% | Limita la pérdida máxima por operación |
| **Drawdown Diario** | 2-3% | Si pierdes un 2-3% en el día, el bot se pausa |

### Para Trading Real

| Parámetro | Valor recomendado | Por qué |
|---|---|---|
| **Par** | BTC/USDT | El más estable y líquido |
| **Apalancamiento** | 1x (máximo 2-3x) | Cada x de apalancamiento multiplica también las pérdidas |
| **Capital** | 5-10% de tu cartera | Nunca poner todo en un solo bot |
| **Confianza IA** | 80%+ | En dinero real, solo las señales más fuertes |
| **Stop Loss** | 0.3-0.5% | Más ajustado que en simulado |
| **Drawdown Diario** | 1-2% | Más estricto con dinero real |

### Lógica Detrás de Estos Valores

- **Confianza alta (75-80%)** — Menos operaciones pero de mayor calidad. En scalping, las comisiones se comen las ganancias si operas demasiado. Es preferible 5 buenas operaciones al día que 50 mediocres.

- **Stop loss del 0.5%** — En spot con BTC/USDT, un movimiento del 0.5% es bastante común. Te da margen para que la operación respire, pero te saca antes de que la pérdida sea significativa.

- **Drawdown diario del 2-3%** — Si la IA tiene un mal día (mercado errático, noticias inesperadas), el bot se detiene automáticamente. Evita que un mal día destruya semanas de ganancias.

- **Futuros vs Spot** — Los futuros tienen comisiones más bajas (0.10% vs 0.20% por operación completa), lo que es una ventaja importante en scalping. Pero el apalancamiento añade riesgo, así que si usas futuros, mantén el apalancamiento bajo (2-3x máximo).

> **Consejo**: Empieza en simulado con estas configuraciones durante al menos 2-3 semanas. Observa el historial, la tasa de éxito y el PnL. Si ves una tasa de éxito superior al 55-60% y PnL positivo después de simular comisiones, puedes considerar pasar a real con capital pequeño.

---

## 13. Preguntas Frecuentes

### General

**¿Necesito una cuenta de Binance para usar ScalpAI?**
No para empezar. Puedes usar el modo **Simulado** (paper trading) sin claves API. Solo necesitas una cuenta de Binance y claves API cuando quieras operar con dinero real.

**¿Es seguro ingresar mis claves API de Binance?**
Sí. Las claves se almacenan cifradas con AES-256-GCM. Nunca se almacenan en texto plano. Además, si activas 2FA, cualquier operación con claves requiere tu código de verificación.

**¿Puedo usar pares en euros?**
Sí. Puedes usar cualquier par disponible en Binance: BTC/EUR, ETH/EUR, BTC/USDT, SOL/USDT, etc. Escríbelo en formato BASE/QUOTE al crear el bot.

### Trading

**¿Qué es el modo Simulado?**
El modo simulado (paper trading) ejecuta operaciones contra el libro de órdenes real de Binance, pero sin usar dinero real. Simula slippage (deslizamiento de precio) y comisiones para darte resultados realistas. Es ideal para probar estrategias sin riesgo.

**¿Qué es el modo Real?**
El modo real ejecuta operaciones con dinero real en tu cuenta de Binance. Requiere claves API con permisos de trading. Úsalo solo cuando estés seguro de tu estrategia.

**¿Qué hace la IA exactamente?**
La IA (DeepSeek) analiza en tiempo real:
- Libro de órdenes (presión de compra/venta)
- Spread (diferencial entre compra y venta)
- Ratio de compras/ventas recientes
- RSI (indicador de sobrecompra/sobreventa)
- Momentum del precio (cambio en 1 minuto)
- Volatilidad

Con esos datos, genera una señal: **LONG** (comprar), **SHORT** (vender) o **HOLD** (esperar), junto con un nivel de confianza (0-100%). El bot solo opera si la confianza supera el umbral que configuraste.

**¿Qué es el Stop Loss?**
Es la pérdida máxima que permites por operación individual. Si una operación alcanza esa pérdida, se cierra automáticamente. Por ejemplo, un Stop Loss del 2% significa que si pierdes el 2% del capital asignado a esa operación, se cierra.

**¿Qué es el Drawdown Diario?**
Es la pérdida máxima acumulada que permites en un solo día. Si tus pérdidas del día superan este límite, el bot se pausa automáticamente durante 24 horas para proteger tu capital.

**¿Qué es el botón de pánico?**
El botón **"Detener Todos"** es una medida de emergencia que detiene todos tus bots y cierra todas las posiciones abiertas al precio de mercado inmediatamente. Úsalo solo si necesitas salir de todas tus posiciones de golpe.

### Problemas Comunes

**No recibo el correo de verificación**
- Revisa tu carpeta de spam/correo no deseado
- Usa el botón "Reenviar correo de verificación"
- Verifica que el administrador haya configurado el SMTP correctamente

**El bot está pausado y no puedo reactivarlo**
El bot se pausa automáticamente si supera el drawdown diario máximo. Se reactiva automáticamente después de 24 horas. Si necesitas reactivarlo antes, detén el bot y vuelve a iniciarlo.

**Las señales de IA no funcionan**
Verifica que el administrador haya configurado la API de IA en Administración → Configuración de IA. Sin una API Key de DeepSeek válida, no se generan señales.

**No puedo operar en modo real**
1. Verifica que tienes claves API de Binance configuradas en Ajustes
2. Verifica que las claves tienen permisos de trading
3. Verifica que tienes saldo suficiente en tu cuenta de Binance
4. Si usas apalancamiento, verifica que tienes los permisos de futuros activados

---

*ScalpAI — Trading inteligente con IA*
