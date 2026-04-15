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
11. [Sistema Multi Take-Profit](#11-sistema-multi-take-profit)
12. [Comisiones de Binance](#12-comisiones-de-binance)
13. [Estrategia Conservadora Recomendada](#13-estrategia-conservadora-recomendada)
14. [Preguntas Frecuentes](#14-preguntas-frecuentes)

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
- **Sentimiento IA**: Señales actuales de la IA para cada par — indica LONG (compra), SHORT (venta) o HOLD (esperar) con nivel de confianza y niveles de Take-Profit (TP1/TP2/TP3)

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
| **Stop Loss** | Pérdida máxima por operación (%) | 1% |
| **Drawdown Diario Máx.** | Pérdida máxima permitida en un día (%) | 2% |

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
- **Take-Profit escalonado**: TP1, TP2 y TP3 con sus porcentajes
- **Razonamiento**: Explicación de la IA sobre por qué tomó esa decisión (basada en RSI, volumen, spread, momentum, etc.)

### Historial de Operaciones

Tabla con todas las operaciones ejecutadas por este bot, incluyendo:
- Precio de entrada/salida, comisiones, PnL y señal IA
- **Progreso TP**: Indicadores visuales (círculos 1-2-3) que muestran qué niveles de Take-Profit se han alcanzado

---

## 7. Historial de Operaciones

Accede desde la barra lateral → **"Operaciones"**

Vista completa de todas las operaciones de todos tus bots.

### Columnas de la Tabla

| Columna | Descripción |
|---|---|
| **ID** | Identificador de la operación |
| **Lado** | COMPRA (long) o VENTA (short) |
| **Par** | Par de trading |
| **Modo** | Simulado o Real |
| **Entrada / Salida** | Precios de entrada y salida |
| **Cant.** | Cantidad operada |
| **PnL** | Beneficio/pérdida (incluye cierres parciales) |
| **Comisión** | Comisiones pagadas |
| **Señal IA** | La señal que generó la operación |
| **TP1/TP2/TP3** | Niveles de Take-Profit configurados (%) |
| **Progreso TP** | Indicadores visuales de qué niveles se alcanzaron |
| **Estado** | Abierta, Cerrada o Cancelada |

### Filtros

- **Estado**: Filtra por estado de la operación (Todas, Abiertas, Cerradas, Canceladas)

### Exportar

Haz clic en **"CSV"** para descargar el historial completo en formato CSV. La exportación incluye todos los datos de TP1/TP2/TP3, nivel de TP alcanzado y PnL parcial. Útil para análisis externo, contabilidad o reportes fiscales.

### Navegación

Usa los botones **"Anterior"** y **"Siguiente"** para navegar entre páginas si tienes muchas operaciones.

---

## 8. Ajustes de Usuario

Accede desde la barra lateral → **"Ajustes"**

### Tema Claro/Oscuro

ScalpAI incluye un toggle de tema en la barra lateral (icono de Sol/Luna). Puedes cambiar entre tema oscuro y claro en cualquier momento:

- **Tema oscuro** (por defecto): Fondo oscuro con texto claro, ideal para sesiones largas o ambientes con poca luz
- **Tema claro**: Fondo blanco con texto oscuro, ideal para uso diurno

El tema seleccionado se guarda automáticamente en tu navegador. Todos los gráficos (velas, precio, libro de órdenes, tooltips) se adaptan automáticamente al tema elegido.

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

### Configuración de IA Personal

Cada usuario puede configurar su propia API key de inteligencia artificial, independiente de la configuración global del administrador. Esto te permite:

- Elegir tu propio proveedor de IA (puede ser diferente al del administrador)
- Usar tu propia API key (tú controlas los costes directamente)
- Personalizar la URL base y el modelo si lo deseas

**Configurar tu IA personal:**

1. En **Ajustes**, busca la sección **"Configuración de IA"** (icono de cerebro)
2. Verás un badge de estado: **"Sin configurar"** (usa la IA global) o **"Configurada"** (usa tu propia clave)
3. Selecciona el **Proveedor de IA** del desplegable — la URL Base y el Modelo se rellenan automáticamente con los presets
4. Ingresa tu **API Key** personal del proveedor seleccionado
5. Haz clic en **"Probar Conexión"** para verificar que la clave funciona
6. Haz clic en **"Guardar Configuración"**

**Eliminar tu configuración:**
Si deseas volver a usar la IA global del administrador, haz clic en **"Eliminar Configuración"**. Tus bots pasarán a usar la configuración global automáticamente.

**Prioridad de configuración:**
1. Si tienes IA personal configurada → se usa tu API key
2. Si no → se usa la configuración global del administrador
3. Si ninguna está configurada → los bots no generarán señales de IA

> **Seguridad**: Tu API key se almacena cifrada con AES-256-GCM, igual que las claves de Binance. Las URLs base personalizadas solo aceptan HTTPS. Nadie puede ver tu clave en texto plano.

**Dónde obtener API keys:**
- **DeepSeek**: [platform.deepseek.com](https://platform.deepseek.com/)
- **OpenAI (GPT-4o)**: [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- **Google (Gemini)**: [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
- **Alibaba (Qwen)**: [dashscope.console.aliyun.com](https://dashscope.console.aliyun.com/)

---

## 9. Panel de Administración

Accede desde la barra lateral → **"Administración"** (solo visible para administradores)

### Estadísticas Globales

Tarjetas con métricas del sistema:
- **Total Usuarios**: Número de usuarios registrados
- **Total Bots**: Número total de bots creados
- **2FA Activado**: Cuántos usuarios tienen verificación en dos pasos

### Configuración de IA (Multi-Proveedor)

Configura el proveedor de inteligencia artificial que genera las señales de trading.

**Proveedores disponibles:**

| Proveedor | Modelo | Coste Input/1M tokens | Coste Output/1M tokens | Características |
|---|---|---|---|---|
| **DeepSeek** | deepseek-chat | $0.27 | $1.10 | El más económico |
| **GPT-4o (OpenAI)** | gpt-4o | $2.50 | $10.00 | El más fiable y consistente |
| **Gemini 2.0 Flash** | gemini-2.0-flash | $0.10 | $0.40 | El más rápido y barato |
| **Qwen (Alibaba)** | qwen-plus | $0.80 | $2.00 | Buen equilibrio calidad/precio |

**Configurar la IA:**
1. Selecciona el **proveedor de IA** del desplegable — la URL base y el modelo se rellenan automáticamente
2. Ingresa la **API Key** del proveedor seleccionado (se cifra en la base de datos)
3. Ajusta el **intervalo de señal** en segundos (cada cuánto analiza el mercado)
   - Menor intervalo = más preciso pero más costoso
   - Recomendado: 5-10 segundos
4. Usa **"Probar Conexión"** para verificar que la API Key funciona
5. Haz clic en **"Guardar Configuración"**

**Dónde obtener API keys:**
- **DeepSeek**: [platform.deepseek.com](https://platform.deepseek.com/)
- **OpenAI (GPT-4o)**: [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- **Google (Gemini)**: [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
- **Alibaba (Qwen)**: [dashscope.console.aliyun.com](https://dashscope.console.aliyun.com/)

> **Nota**: Puedes cambiar de proveedor en cualquier momento sin reiniciar el servidor. El cambio se aplica inmediatamente.

### Coste de IA

Debajo de la configuración de IA, encontrarás el panel de **Coste de IA** con:

| Métrica | Descripción |
|---|---|
| **Hoy** | Coste total en USD de las llamadas del día |
| **Llamadas Hoy** | Número de consultas a la IA realizadas hoy |
| **Total Acumulado** | Coste total desde que se empezó a usar la IA |
| **Total Llamadas** | Número total de llamadas realizadas |
| **Tokens Hoy** | Desglose de tokens de input y output consumidos |
| **Desglose por Proveedor** | Si usaste varios proveedores, muestra el coste de cada uno |
| **Últimos 7 Días** | Historial diario de costes de la última semana |
| **Estimación Diaria** | Coste estimado basado en el intervalo de señal y el proveedor actual |

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

La IA actúa como un **analista de mercado automático**. No opera por sí sola — le pasa su decisión al bot, y el bot decide si ejecutarla o no según tus reglas de riesgo. Tú siempre tienes el control final.

Puedes elegir entre 4 proveedores de IA (DeepSeek, GPT-4o, Gemini, Qwen), cada uno con diferentes velocidades, costes y niveles de precisión. El administrador configura el proveedor global desde el panel de administración, y cada usuario puede configurar su propio proveedor y API key desde **Ajustes → Configuración de IA**.

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

#### Paso 3 — Consulta a la IA

Toda esa información se empaqueta y se envía al proveedor de IA seleccionado con instrucciones de análisis (estrategia Whale Sense). La IA responde con:

- **Acción**: LONG (comprar), SHORT (vender) o HOLD (esperar)
- **Confianza**: Nivel del 0 al 100%
- **Take-Profit**: Porcentaje de ganancia objetivo (0.5% a 2.0%)
- **Razonamiento**: Explicación breve de por qué tomó esa decisión

Cada llamada a la IA se registra con el número de tokens consumidos y el coste en USD, visible en el panel de costes del administrador.

#### Paso 4 — Decisión del bot

El bot recibe la señal y aplica tus reglas:

- Si la confianza es **mayor** que tu umbral configurado → ejecuta la operación
- Si es menor → no hace nada
- Si la IA dice HOLD → no hace nada
- Si hay una operación abierta en dirección **opuesta** y la nueva señal tiene confianza muy alta (umbral + 10%) → cierra la operación actual y abre en la nueva dirección (reversión de posición)

#### Paso 5 — Gestión de riesgo y Take-Profit escalonado

Una vez abierta la operación, el sistema vigila:

1. **TP1 alcanzado** (ej: +0.8%) → Cierra 40% de la posición, mueve stop-loss a breakeven
2. **TP2 alcanzado** (ej: +2.0%) → Cierra 35% de la posición, mueve stop-loss a TP1
3. **TP3 alcanzado** (ej: +3.2%) → Cierra 25% restante, operación completada
4. Si la pérdida llega al **stop loss** (1%) → cierra automáticamente
5. Si las pérdidas del día superan el **drawdown diario** (2%) → pausa el bot 24 horas
6. Si la operación lleva más de **10 minutos** abierta sin alcanzar TP/SL → cierre automático

### De Dónde Vienen los Datos

Los datos de mercado vienen de **Binance vía WebSocket público**, que es gratuito y no requiere cuenta:

- **Para ver datos y recibir señales de IA** → no necesitas cuenta de Binance
- **Para modo simulado (paper trading)** → tampoco necesitas claves de Binance
- **Solo para trading real** → necesitas cuenta de Binance con claves API

---

## 11. Sistema Multi Take-Profit

El sistema de Take-Profit escalonado (Multi-TP) permite maximizar ganancias mientras protege el capital.

### Cómo Funciona

Cuando la IA genera una señal de trading, define un porcentaje de Take-Profit base (entre 0.5% y 2.0% según la volatilidad del mercado). A partir de ese valor, el sistema calcula tres niveles:

| Nivel | Cálculo | Acción | Ejemplo (base=1%) |
|---|---|---|---|
| **TP1** | Base | Cierra 40% de la posición | +1.0% |
| **TP2** | Base × 2.5 | Cierra 35% de la posición | +2.5% |
| **TP3** | Base × 4 | Cierra 25% restante | +4.0% |

### Movimiento del Stop-Loss

El stop-loss se ajusta automáticamente a medida que se alcanzan los niveles de TP:

1. **Antes de TP1**: Stop-loss en el valor configurado del bot (ej: -1%)
2. **Después de TP1**: Stop-loss se mueve a **breakeven** (0%) — ya no puedes perder en esta operación
3. **Después de TP2**: Stop-loss se mueve a **TP1** — garantizas al menos la ganancia del primer nivel

### Indicadores Visuales

En la tabla de operaciones, verás tres círculos numerados (1, 2, 3) que indican el progreso:
- **Círculo gris**: Nivel aún no alcanzado
- **Círculo verde**: Nivel alcanzado con éxito

### Ejemplo Práctico

Imagina que abres una posición LONG de BTC/USDT con capital de $1000 y la IA define TP base = 1%:

1. **Entrada**: Compras BTC a $85,000
2. **TP1** (+1% = $85,850): Se venden $400 en BTC (40%), SL pasa a $85,000 (breakeven)
3. **TP2** (+2.5% = $87,125): Se venden $350 en BTC (35%), SL pasa a $85,850 (TP1)
4. **TP3** (+4% = $88,400): Se venden los $250 restantes (25%), operación completada

Si el precio cae después de TP1 pero antes de TP2, el stop-loss en breakeven cierra la posición restante sin pérdida — ya has asegurado la ganancia del cierre parcial en TP1.

---

## 12. Comisiones de Binance

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

> **Nota con Multi-TP**: Con el cierre escalonado, las comisiones se aplican en cada cierre parcial (TP1, TP2, TP3). El sistema las contabiliza automáticamente en el PnL final.

---

## 13. Estrategia Conservadora Recomendada

### Para Empezar (Modo Simulado)

| Parámetro | Valor recomendado | Por qué |
|---|---|---|
| **Par** | BTC/USDT o ETH/USDT | Son los más líquidos, menor spread, más datos para la IA |
| **Modo** | Simulado | Hasta ver resultados consistentes durante semanas |
| **Apalancamiento** | 1x | Sin apalancamiento = sin riesgo de liquidación |
| **Capital** | 100-500 USDT | Suficiente para ver resultados reales sin arriesgar mucho |
| **Confianza IA** | 75-80% | Solo operar con señales de alta convicción |
| **Stop Loss** | 1% | Limita la pérdida máxima por operación (Whale Sense) |
| **Drawdown Diario** | 2% | Si pierdes un 2% en el día, el bot se pausa |
| **Proveedor IA** | DeepSeek o Gemini | Los más económicos para empezar |

### Para Trading Real

| Parámetro | Valor recomendado | Por qué |
|---|---|---|
| **Par** | BTC/USDT | El más estable y líquido |
| **Apalancamiento** | 1x (máximo 2-3x) | Cada x de apalancamiento multiplica también las pérdidas |
| **Capital** | 5-10% de tu cartera | Nunca poner todo en un solo bot |
| **Confianza IA** | 80%+ | En dinero real, solo las señales más fuertes |
| **Stop Loss** | 1% | Estrategia Whale Sense |
| **Drawdown Diario** | 2% | Más estricto con dinero real |
| **Proveedor IA** | GPT-4o o DeepSeek | GPT-4o para máxima fiabilidad, DeepSeek para economía |

### Lógica Detrás de Estos Valores

- **Confianza alta (75-80%)** — Menos operaciones pero de mayor calidad. En scalping, las comisiones se comen las ganancias si operas demasiado. Es preferible 5 buenas operaciones al día que 50 mediocres.

- **Stop loss del 1%** — Estrategia Whale Sense: con el sistema Multi-TP, una vez que TP1 se alcanza, el stop-loss se mueve a breakeven, eliminando el riesgo de pérdida. El 1% inicial te da margen para que la operación respire.

- **Drawdown diario del 2%** — Si la IA tiene un mal día (mercado errático, noticias inesperadas), el bot se detiene automáticamente. Evita que un mal día destruya semanas de ganancias.

- **Multi-TP escalonado** — En lugar de esperar un solo objetivo de ganancia, el sistema asegura ganancias parciales en el camino. Si el precio alcanza TP1 pero no llega a TP2, al menos has capturado el 40% de la ganancia potencial.

- **Elección de proveedor IA** — Gemini es el más barato ($0.10/1M input), DeepSeek ofrece buen equilibrio, y GPT-4o es el más consistente para señales de alta calidad. Monitoriza los costes en el panel de administración y ajusta según tu presupuesto.

- **Futuros vs Spot** — Los futuros tienen comisiones más bajas (0.10% vs 0.20% por operación completa), lo que es una ventaja importante en scalping. Pero el apalancamiento añade riesgo, así que si usas futuros, mantén el apalancamiento bajo (2-3x máximo).

> **Consejo**: Empieza en simulado con estas configuraciones durante al menos 2-3 semanas. Observa el historial, la tasa de éxito, los niveles de TP alcanzados y el PnL. Si ves una tasa de éxito superior al 55-60% y PnL positivo después de simular comisiones, puedes considerar pasar a real con capital pequeño.

---

## 14. Preguntas Frecuentes

### General

**¿Necesito una cuenta de Binance para usar ScalpAI?**
No para empezar. Puedes usar el modo **Simulado** (paper trading) sin claves API. Solo necesitas una cuenta de Binance y claves API cuando quieras operar con dinero real.

**¿Es seguro ingresar mis claves API de Binance?**
Sí. Las claves se almacenan cifradas con AES-256-GCM. Nunca se almacenan en texto plano. Además, si activas 2FA, cualquier operación con claves requiere tu código de verificación.

**¿Puedo usar pares en euros?**
Sí. Puedes usar cualquier par disponible en Binance: BTC/EUR, ETH/EUR, BTC/USDT, SOL/USDT, etc. Escríbelo en formato BASE/QUOTE al crear el bot.

### Inteligencia Artificial

**¿Qué proveedores de IA puedo usar?**
ScalpAI soporta 4 proveedores: DeepSeek (el más económico), GPT-4o de OpenAI (el más fiable), Gemini 2.0 Flash de Google (el más rápido) y Qwen de Alibaba (buen equilibrio). El administrador configura el proveedor global, pero cada usuario puede configurar su propio proveedor y API key desde **Ajustes → Configuración de IA**.

**¿Puedo usar mi propia API key de IA?**
Sí. Ve a **Ajustes → Configuración de IA**, selecciona tu proveedor, ingresa tu API key y guarda. Tu clave se cifra con AES-256-GCM. Si no configuras una propia, tus bots usarán la configuración global del administrador como fallback. Puedes eliminar tu configuración en cualquier momento para volver al fallback global.

**¿Cuánto cuesta la IA?**
Depende del proveedor y la frecuencia de análisis. Con un intervalo de 5 segundos (~17,280 llamadas/día):
- Gemini: ~$0.17/día
- DeepSeek: ~$0.50/día
- Qwen: ~$1.50/día
- GPT-4o: ~$5.00/día

Puedes monitorizar el gasto real en Administración → Coste de IA.

**¿Puedo cambiar de proveedor de IA?**
Sí. El cambio se aplica inmediatamente sin reiniciar el servidor. Solo necesitas tener una API key válida del nuevo proveedor.

**¿Qué hace la IA exactamente?**
La IA analiza en tiempo real:
- Libro de órdenes (presión de compra/venta)
- Spread (diferencial entre compra y venta)
- Ratio de compras/ventas recientes
- RSI (indicador de sobrecompra/sobreventa)
- Momentum del precio (cambio en 1 minuto)
- Volatilidad

Con esos datos, genera una señal: **LONG** (comprar), **SHORT** (vender) o **HOLD** (esperar), junto con un nivel de confianza (0-100%) y un Take-Profit dinámico. El bot solo opera si la confianza supera el umbral que configuraste.

### Trading

**¿Qué es el modo Simulado?**
El modo simulado (paper trading) ejecuta operaciones contra el libro de órdenes real de Binance, pero sin usar dinero real. Simula slippage (deslizamiento de precio) y comisiones para darte resultados realistas. Es ideal para probar estrategias sin riesgo.

**¿Qué es el modo Real?**
El modo real ejecuta operaciones con dinero real en tu cuenta de Binance. Requiere claves API con permisos de trading. Úsalo solo cuando estés seguro de tu estrategia.

**¿Qué son TP1, TP2 y TP3?**
Son tres niveles de Take-Profit (toma de beneficio) escalonados. En lugar de esperar un solo objetivo, el sistema cierra parcialmente la posición en cada nivel: 40% en TP1, 35% en TP2, y 25% en TP3. Esto te permite asegurar ganancias mientras dejas correr parte de la posición. Consulta la sección [Sistema Multi Take-Profit](#11-sistema-multi-take-profit) para más detalles.

**¿Qué es la reversión de posición?**
Si tienes una operación abierta (ej: LONG) y la IA genera una señal en dirección opuesta (SHORT) con una confianza muy alta (10 puntos por encima de tu umbral), el bot cierra la posición actual y abre una nueva en la dirección contraria. Hay un cooldown de 60 segundos para evitar cambios demasiado frecuentes.

**¿Qué es el Stop Loss?**
Es la pérdida máxima que permites por operación individual. Si una operación alcanza esa pérdida, se cierra automáticamente. Con el sistema Multi-TP, el stop-loss se mueve dinámicamente: tras TP1 pasa a breakeven, tras TP2 sube a TP1.

**¿Qué es el Drawdown Diario?**
Es la pérdida máxima acumulada que permites en un solo día. Si tus pérdidas del día superan este límite, el bot se pausa automáticamente durante 24 horas para proteger tu capital.

**¿Qué es el botón de pánico?**
El botón **"Detener Todos"** es una medida de emergencia que detiene todos tus bots y cierra todas las posiciones abiertas al precio de mercado inmediatamente. Úsalo solo si necesitas salir de todas tus posiciones de golpe.

**¿Qué pasa si una operación lleva mucho tiempo abierta?**
Si una operación no alcanza ningún nivel de Take-Profit ni Stop-Loss en 10 minutos, se cierra automáticamente al precio de mercado. Esto evita que queden posiciones "olvidadas".

### Problemas Comunes

**No recibo el correo de verificación**
- Revisa tu carpeta de spam/correo no deseado
- Usa el botón "Reenviar correo de verificación"
- Verifica que el administrador haya configurado el SMTP correctamente

**El bot está pausado y no puedo reactivarlo**
El bot se pausa automáticamente si supera el drawdown diario máximo. Se reactiva automáticamente después de 24 horas. Si necesitas reactivarlo antes, detén el bot y vuelve a iniciarlo.

**Las señales de IA no funcionan**
Verifica que tengas IA configurada. Puedes configurar tu propia API key en **Ajustes → Configuración de IA**, o verificar que el administrador haya configurado la IA global en **Administración → Configuración de IA**. Se necesita al menos una de las dos con un proveedor seleccionado y una API Key válida.

**El coste de la IA es demasiado alto**
- Aumenta el intervalo de señal (de 5s a 15s o 30s)
- Cambia a un proveedor más económico (Gemini o DeepSeek)
- Monitoriza el coste diario en Administración → Coste de IA
- Si usas tu propia API key, puedes monitorizar el gasto directamente en la plataforma de tu proveedor

**No puedo operar en modo real**
1. Verifica que tienes claves API de Binance configuradas en Ajustes
2. Verifica que las claves tienen permisos de trading
3. Verifica que tienes saldo suficiente en tu cuenta de Binance
4. Si usas apalancamiento, verifica que tienes los permisos de futuros activados

---

*ScalpAI — Trading inteligente con IA*
