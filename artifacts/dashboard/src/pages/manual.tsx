import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

const manualContent = `
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

---

## 2. Registro y Verificación

### Crear una Cuenta

1. En la pantalla de login, haz clic en **"Registrarse"**
2. Completa los campos: correo electrónico, contraseña (mín. 8 caracteres) y confirmación
3. Haz clic en **"Crear Cuenta"**
4. Se enviará un correo de verificación a tu dirección

### Verificar tu Correo

1. Revisa tu bandeja de entrada (y la carpeta de spam)
2. Abre el correo de ScalpAI y haz clic en el enlace de verificación
3. Tu cuenta se verificará automáticamente y podrás iniciar sesión

---

## 3. Iniciar Sesión

1. Ingresa tu correo electrónico y contraseña
2. Haz clic en **"Iniciar Sesión"**
3. Si tienes 2FA activado, se te pedirá un código de 6 dígitos de tu app de autenticación

### Recuperar Contraseña

1. Haz clic en **"¿Olvidaste tu contraseña?"**
2. Ingresa tu correo y sigue las instrucciones del email

---

## 4. Panel Principal (Dashboard)

El dashboard es la pantalla central donde monitorizas toda tu actividad.

### Tarjetas de Resumen

- **Bots Activos** — Número de bots en ejecución
- **PnL Diario** — Beneficio/pérdida del día actual
- **PnL Mensual** — Beneficio/pérdida acumulado del mes
- **Max Drawdown** — Mayor caída de capital registrada
- **Límite API** — Uso actual del límite de Binance

### Datos en Tiempo Real

- **Precio en Vivo** — Gráfico de velas del par seleccionado
- **Libro de Órdenes** — Órdenes de compra (verde) y venta (roja) en tiempo real
- **Sentimiento IA** — Señales actuales: LONG (compra), SHORT (venta) o HOLD (esperar)

---

## 5. Gestión de Bots

Accede desde la barra lateral → **"Bots"**

### Crear un Bot

Haz clic en **"Nuevo Bot"** y configura:

- **Nombre** — Identificador del bot (ej: "Mi Bot BTC")
- **Par** — Par de trading (ej: BTC/USDT, ETH/EUR, SOL/USDT)
- **Modo** — Simulado (paper trading) o Real (dinero real)
- **Mercado** — Spot (sin apalancamiento) o Futuros (con apalancamiento)
- **Apalancamiento exchange** — El que se configura en Binance vía setLeverage (solo futuros)
- **Apalancamiento operativo** — Multiplicador que el bot usa internamente para calcular el tamaño de la posición. Puede ser menor que el del exchange para operar más conservador
- **Capital** — Cantidad asignada al bot
- **Confianza IA** — Umbral mínimo de confianza para operar (0-100%)
- **Stop Loss** — Pérdida máxima por operación (%)
- **Drawdown Diario Máx.** — Pérdida máxima permitida en un día (%)

### Controles

- **Play** ▶ — Iniciar el bot
- **Stop** ■ — Detener el bot de forma ordenada
- **Kill** ☠ — Parada de emergencia (cierra todas las posiciones)
- **Eliminar** 🗑 — Borrar el bot

### Botón de Pánico

**"Detener Todos"** — Kill switch global que detiene todos los bots y cierra todas las posiciones. Solo para emergencias.

### Estados del Bot

- **Detenido** — Inactivo
- **Activo** — Operando normalmente
- **Pausado** — Detenido temporalmente por exceder drawdown diario (se reactiva en 24h)

---

## 6. Detalle de un Bot

Haz clic en cualquier bot para ver:

- **Tasa de Éxito** — Porcentaje de operaciones ganadoras
- **PnL Total/Diario** — Beneficio acumulado y del día
- **PnL Acumulado** — Gráfico de evolución temporal
- **Análisis IA** — Última señal con confianza y razonamiento
- **Historial** — Todas las operaciones del bot

---

## 7. Historial de Operaciones

Accede desde **"Operaciones"** en la barra lateral.

- **Filtro por estado**: Todas, Abiertas, Cerradas, Canceladas
- **Exportar CSV**: Descarga el historial para análisis externo o contabilidad
- **Paginación**: Navega entre páginas con "Anterior" y "Siguiente"

---

## 8. Ajustes de Usuario

Accede desde **"Ajustes"** en la barra lateral.

### Autenticación en Dos Factores (2FA)

1. Haz clic en **"Configurar 2FA"**
2. Escanea el código QR con tu app de autenticación (Google Authenticator, Authy)
3. Ingresa el código de 6 dígitos para confirmar

> Recomendación: Activa 2FA siempre, especialmente para trading real.

### Claves API de Binance

1. Haz clic en **"Añadir Clave"**
2. Ingresa nombre, API Key y Secret Key
3. Las claves se almacenan **cifradas con AES-256-GCM**

**Crear claves en Binance:**
1. Ve a tu cuenta de Binance → Gestión de API
2. Crea una nueva clave con permisos de Lectura + Trading
3. **NO actives permisos de retiro** por seguridad

---

## 9. Panel de Administración

Solo visible para administradores. Accede desde **"Administración"**.

### Configuración de IA

- **API Key** — Clave de DeepSeek ([platform.deepseek.com](https://platform.deepseek.com/))
- **URL Base** — Dirección del servicio de IA
- **Modelo** — Modelo a usar (por defecto: deepseek-chat)
- **Probar Conexión** — Verifica que todo funciona antes de guardar

### Configuración SMTP

- Servidor, puerto, usuario, contraseña, remitente
- Para Gmail: usa una "Contraseña de aplicación" (no tu contraseña normal)
- **Probar Conexión** — Verifica la configuración SMTP

### Gestión de Usuarios

- Lista completa de usuarios con roles, 2FA, bots
- Vista detallada de cada usuario (sus claves API y bots)

---

## 10. Cómo Funciona la IA

### El Rol de la IA

La IA (DeepSeek) actúa como un **analista de mercado automático**. No opera por sí sola — le pasa su decisión al bot, y el bot decide si ejecutarla o no según tus reglas de riesgo. Tú siempre tienes el control final.

### El Ciclo Completo

**Paso 1 — Recolección de datos (cada 100ms)**

El servidor se conecta al WebSocket público de Binance (no requiere cuenta ni claves API) y recibe en tiempo real:

- Cada compra y venta que ocurre en el par (ej: BTC/USDT)
- Las 20 mejores ofertas de compra y venta (libro de órdenes)

**Paso 2 — Procesamiento de indicadores (cada 2 segundos)**

Con esos datos crudos, el sistema calcula automáticamente:

- **Imbalance del libro de órdenes** — Hay más presión compradora o vendedora?
- **Spread** — Diferencia entre mejor compra y mejor venta (spread ancho = mercado arriesgado)
- **Ratio compra/venta** — De los últimos trades, cuántos fueron compras vs ventas
- **RSI (14 períodos)** — Por encima de 70 = sobrecomprado, por debajo de 30 = sobrevendido
- **Momentum** — Cómo cambió el precio en el último minuto
- **Volatilidad** — Qué tan bruscos son los movimientos

**Paso 3 — Consulta a la IA (DeepSeek)**

Toda esa información se empaqueta y se envía a DeepSeek con instrucciones de análisis. La IA responde con:

- **Acción**: LONG (comprar), SHORT (vender) o HOLD (esperar)
- **Confianza**: Nivel del 0 al 100%
- **Razonamiento**: Explicación breve de por qué tomó esa decisión

**Paso 4 — Decisión del bot**

El bot recibe la señal y aplica tus reglas:

- Si la confianza es **mayor** que tu umbral configurado → ejecuta la operación
- Si es menor → no hace nada
- Si la IA dice HOLD → no hace nada

**Paso 5 — Gestión de riesgo**

Una vez abierta la operación, el sistema de riesgo vigila independientemente:

- Si la pérdida llega al **stop loss** → cierra automáticamente
- Si las pérdidas del día superan el **drawdown diario máximo** → pausa el bot 24 horas

### De Dónde Vienen los Datos

Los datos de mercado vienen de **Binance vía WebSocket público**, que es gratuito y no requiere cuenta:

- **Para ver datos y recibir señales de IA** → no necesitas cuenta de Binance
- **Para modo simulado (paper trading)** → tampoco necesitas claves de Binance
- **Solo para trading real** → necesitas cuenta de Binance con claves API

---

## 11. Costes de la IA (DeepSeek)

### Precio por Uso

DeepSeek cobra por **tokens** (unidades de texto procesadas). Cada consulta de señal consume:

- **Entrada (prompt)**: ~800-1200 tokens (datos de mercado + instrucciones)
- **Salida (respuesta)**: ~100-200 tokens (señal + razonamiento)

### Tarifas de DeepSeek (modelo deepseek-chat)

| Concepto | Precio |
|----------|--------|
| Tokens de entrada | $0.14 / millón de tokens |
| Tokens de salida | $0.28 / millón de tokens |
| Tokens de entrada (cache hit) | $0.014 / millón de tokens |

### Coste Estimado por Bot

El coste depende del **intervalo de señal** configurado en el panel de administración:

| Intervalo | Consultas/hora | Coste/hora | Coste/día (24h) |
|-----------|---------------|------------|-----------------|
| 1 segundo | 3,600 | ~$0.15 | ~$3.70 |
| 5 segundos (recomendado) | 720 | ~$0.03 | ~$0.74 |
| 10 segundos | 360 | ~$0.015 | ~$0.37 |
| 30 segundos | 120 | ~$0.005 | ~$0.12 |
| 60 segundos | 60 | ~$0.003 | ~$0.06 |

> Estos costes son **por bot y por par**. Si tienes 2 bots con 1 par cada uno, multiplica x2.

### Cómo Reducir Costes

1. **Aumentar el intervalo de señal** — En Administración → IA, ajusta el intervalo. 5-10 segundos es un buen equilibrio entre precisión y coste.
2. **Menos pares por bot** — Cada par genera consultas independientes.
3. **Usar pocos bots simultáneos** — Especialmente en modo real, 1-2 bots son suficientes.
4. **Horarios de actividad** — Pausar bots en horarios de bajo volumen reduce consumo.

### Ejemplo Práctico

Con la **configuración conservadora recomendada** (1 bot, 1 par, intervalo 5s):

- **Coste mensual estimado**: ~$22 USD
- **Con cache hit frecuente**: puede bajar a ~$5-10 USD

Es importante tener saldo en tu cuenta de DeepSeek ([platform.deepseek.com](https://platform.deepseek.com/)) para que el servicio funcione. Si el saldo se agota, la IA dejará de generar señales (los bots seguirán activos pero en modo HOLD).

---

## 12. Comisiones de Binance

### Tabla de Comisiones

- **Spot**: Maker 0.10% / Taker 0.10%
- **Futuros**: Maker 0.02% / Taker 0.05%
- **Con BNB (descuento 25%)**: 0.075% / 0.075%

En scalping, normalmente eres **taker** (compras/vendes al precio de mercado). Cada operación completa tiene entrada + salida, así que pagas comisión dos veces:

- **Spot**: 0.10% x 2 = **0.20% por operación completa**
- **Futuros**: 0.05% x 2 = **0.10% por operación completa**

Esto significa que tu operación necesita moverse al menos un 0.20% (spot) o 0.10% (futuros) solo para cubrir comisiones.

---

## 13. Estrategia Conservadora Recomendada

### Para Empezar (Modo Simulado)

- **Par**: BTC/USDT o ETH/USDT (los más líquidos, menor spread, más datos para la IA)
- **Modo**: Simulado (hasta ver resultados consistentes durante semanas)
- **Mercado**: Spot (sin riesgo de liquidación)
- **Capital**: 100-500 USDT (suficiente para ver resultados reales)
- **Confianza IA**: 75-80% (solo operar con señales de alta convicción)
- **Stop Loss**: 0.5-1% (limita la pérdida máxima por operación)
- **Drawdown Diario**: 2-3% (si pierdes un 2-3% en el día, el bot se pausa)

### Para Trading Real

- **Par**: BTC/USDT (el más estable y líquido)
- **Mercado**: Spot o Futuros con apalancamiento bajo (máx. 2-3x operativo)
- **Capital**: 5-10% de tu cartera (nunca poner todo en un solo bot)
- **Confianza IA**: 80%+ (en dinero real, solo las señales más fuertes)
- **Stop Loss**: 0.3-0.5% (más ajustado que en simulado)
- **Drawdown Diario**: 1-2% (más estricto con dinero real)

### Ejemplo: Perfil Conservador (Spot, sin apalancamiento)

Ideal para empezar, aprender el comportamiento de la IA y preservar capital. Sin riesgo de liquidación.

| Campo | Valor |
|-------|-------|
| Par | BTC/USDT |
| Modo | Real |
| Mercado | Spot |
| Apalancamiento exchange | — (no aplica) |
| Apalancamiento operativo | — (no aplica) |
| Capital | 500 USDT |
| Confianza IA | 80% |
| Stop Loss | 0.4% |
| Drawdown Diario | 1.5% |

**Comportamiento esperado**: pocas operaciones al día (3-8), ganancia modesta por operación, pérdida máxima diaria acotada a ~7.50 USDT. Las comisiones spot (0.20% ida y vuelta) son el principal gasto: la IA debe batir claramente ese umbral para ser rentable.

### Ejemplo: Perfil Arriesgado (Futuros con apalancamiento)

Más operaciones abiertas con menor comisión, pero con riesgo de liquidación. Solo recomendado tras validar el perfil conservador durante varias semanas.

| Campo | Valor |
|-------|-------|
| Par | BTC/USDT |
| Modo | Real |
| Mercado | Futuros |
| Apalancamiento exchange | 10x |
| Apalancamiento operativo | 3x |
| Capital | 500 USDT |
| Confianza IA | 75% |
| Stop Loss | 0.25% |
| Drawdown Diario | 2% |

**Por qué dos apalancamientos distintos**: en Binance se configura el exchange a 10x (da margen para evitar liquidación ante mechas), pero el bot solo dimensiona la posición con 3x. Así trabajas con un tamaño moderado (500 × 3 = 1500 USDT de exposición) y dejas colchón antes de la liquidación. Nunca pongas el operativo igual al exchange si no quieres operar al límite.

**Comportamiento esperado**: más operaciones al día gracias a menores comisiones (0.10% ida y vuelta), ganancias amplificadas por el apalancamiento operativo, pero también pérdidas más rápidas. Pérdida máxima diaria tope: 10 USDT — al llegar, el bot se pausa automáticamente.

> ⚠️ **Advertencia**: en futuros una racha adversa puede quemar el capital deprisa. Empieza siempre en simulado con los mismos parámetros antes de pasar a real.

### Por Qué Estos Valores

- **Confianza alta (75-80%)** — Menos operaciones pero de mayor calidad. En scalping, las comisiones se comen las ganancias si operas demasiado. Es preferible 5 buenas operaciones al día que 50 mediocres.
- **Stop loss del 0.5%** — En spot con BTC/USDT, un movimiento del 0.5% es bastante común. Te da margen para que la operación respire, pero te saca antes de que la pérdida sea significativa.
- **Drawdown diario del 2-3%** — Si la IA tiene un mal día (mercado errático, noticias inesperadas), el bot se detiene automáticamente. Evita que un mal día destruya semanas de ganancias.
- **Futuros vs Spot** — Los futuros tienen comisiones más bajas (0.10% vs 0.20% por operación completa), ventaja importante en scalping. Pero el apalancamiento añade riesgo, así que mantén el apalancamiento bajo (2-3x máximo).
- **Intervalo de señal 5-10s** — Un intervalo de 5 segundos ofrece buen equilibrio entre precisión y coste de IA. Intervalos más bajos (1s) dan señales más rápidas pero multiplican el gasto sin mejorar mucho el resultado.

### Coste Real por Operación (Comisiones + IA)

Para evaluar si tu estrategia es rentable, debes sumar **comisiones de Binance + coste de IA**:

**Ejemplo con 500 USDT en Spot, intervalo 5s, 1 bot, 1 par:**

| Concepto | Coste |
|----------|-------|
| Comisión Binance (entrada + salida) | 0.20% = **1.00 USDT** por operación |
| Coste IA mensual | ~$22 USD/mes ÷ ~150 operaciones = **~0.15 USDT** por operación |
| **Coste total por operación** | **~1.15 USDT** |

Esto significa que cada operación necesita generar más de **1.15 USDT de beneficio** (un movimiento de ~0.23%) para ser rentable.

**Regla práctica**: Tu beneficio medio por operación debe ser **al menos 2x el coste total** (comisiones + IA) para que la estrategia sea sostenible a largo plazo. Con 500 USDT eso es un movimiento del ~0.46% por operación ganadora.

### Capital Mínimo Recomendado

El coste de la IA es fijo (~$22/mes con intervalo 5s), independiente del capital. Esto tiene una implicación importante:

| Capital | Coste IA/mes | % del capital | Viable? |
|---------|-------------|---------------|---------|
| 50 USDT | $22 | 44% | No — la IA cuesta casi la mitad del capital |
| 100 USDT | $22 | 22% | Arriesgado — necesitas +22% mensual solo para cubrir IA |
| 500 USDT | $22 | 4.4% | Razonable — objetivo realista de rentabilidad |
| 1,000 USDT | $22 | 2.2% | Bueno — el coste de IA es marginal |
| 5,000 USDT | $22 | 0.44% | Óptimo — el coste de IA es despreciable |

> **Recomendación**: No uses trading real con menos de **500 USDT** de capital. Con cantidades menores, el coste fijo de la IA hace muy difícil ser rentable. Usa el modo simulado para practicar sin coste de operaciones (solo pagas la IA).

> Consejo: Empieza en simulado con estas configuraciones durante al menos 2-3 semanas. Observa el historial, la tasa de éxito y el PnL. Si ves una tasa de éxito superior al 55-60% y PnL positivo después de simular comisiones + coste IA, puedes considerar pasar a real con capital suficiente (500+ USDT).

---

## 14. Preguntas Frecuentes

**¿Necesito Binance para usar ScalpAI?**
No para empezar. Usa el modo Simulado sin claves API. Solo necesitas Binance para trading real.

**¿Puedo usar pares en euros?**
Sí. Cualquier par de Binance: BTC/EUR, ETH/EUR, etc.

**¿Qué hace la IA?**
Analiza libro de órdenes, spread, RSI, volumen, momentum y volatilidad. Genera señales LONG/SHORT/HOLD con nivel de confianza.

**¿Qué es el Stop Loss?**
Pérdida máxima permitida por operación. Se cierra automáticamente al alcanzar el límite.

**¿Qué es el Drawdown Diario?**
Pérdida máxima acumulada en un día. El bot se pausa automáticamente 24h al superarlo.

**No recibo el correo de verificación:**
Revisa spam, usa "Reenviar verificación", o pide al admin que verifique tu cuenta manualmente.

**Las señales de IA no funcionan:**
El admin debe configurar la API de IA en Administración → Configuración de IA.
`;

function renderMarkdown(md: string) {
  const lines = md.split("\n");
  const elements: React.ReactNode[] = [];
  let inList = false;
  let listItems: React.ReactNode[] = [];
  let listKey = 0;

  const flushList = () => {
    if (inList && listItems.length > 0) {
      const isOrdered = (listItems as any).__ordered;
      if (isOrdered) {
        elements.push(<ol key={`ol-${listKey}`} className="list-decimal list-inside space-y-1 mb-4 text-sm text-muted-foreground">{listItems}</ol>);
      } else {
        elements.push(<ul key={`ul-${listKey}`} className="list-disc list-inside space-y-1 mb-4 text-sm text-muted-foreground">{listItems}</ul>);
      }
      listItems = [];
      inList = false;
      listKey++;
    }
  };

  const formatInline = (text: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = [];
    const regex = /\*\*(.+?)\*\*|\[(.+?)\]\((.+?)\)|`(.+?)`/g;
    let lastIndex = 0;
    let match;
    let partKey = 0;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }
      if (match[1]) {
        parts.push(<strong key={`b-${partKey}`} className="text-foreground font-semibold">{match[1]}</strong>);
      } else if (match[2] && match[3]) {
        parts.push(<a key={`a-${partKey}`} href={match[3]} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{match[2]}</a>);
      } else if (match[4]) {
        parts.push(<code key={`c-${partKey}`} className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">{match[4]}</code>);
      }
      lastIndex = match.index + match[0].length;
      partKey++;
    }
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }
    return parts;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === "") {
      flushList();
      continue;
    }

    if (trimmed === "---") {
      flushList();
      elements.push(<hr key={`hr-${i}`} className="my-6 border-border" />);
      continue;
    }

    if (trimmed.startsWith("## ")) {
      flushList();
      elements.push(<h2 key={`h2-${i}`} className="text-xl font-bold mt-8 mb-3 text-foreground">{trimmed.slice(3)}</h2>);
      continue;
    }

    if (trimmed.startsWith("### ")) {
      flushList();
      elements.push(<h3 key={`h3-${i}`} className="text-lg font-semibold mt-6 mb-2 text-foreground">{trimmed.slice(4)}</h3>);
      continue;
    }

    if (trimmed.startsWith("> ")) {
      flushList();
      elements.push(
        <div key={`bq-${i}`} className="border-l-4 border-primary/50 bg-primary/5 pl-4 py-2 my-3 rounded-r text-sm text-muted-foreground">
          {formatInline(trimmed.slice(2))}
        </div>
      );
      continue;
    }

    const orderedMatch = trimmed.match(/^(\d+)\.\s+(.+)/);
    if (orderedMatch) {
      if (!inList) {
        inList = true;
        listItems = [];
        (listItems as any).__ordered = true;
      }
      listItems.push(<li key={`li-${i}`}>{formatInline(orderedMatch[2])}</li>);
      continue;
    }

    if (trimmed.startsWith("- ")) {
      if (!inList) {
        inList = true;
        listItems = [];
        (listItems as any).__ordered = false;
      }
      listItems.push(<li key={`li-${i}`}>{formatInline(trimmed.slice(2))}</li>);
      continue;
    }

    flushList();
    elements.push(<p key={`p-${i}`} className="text-sm text-muted-foreground mb-2 leading-relaxed">{formatInline(trimmed)}</p>);
  }

  flushList();
  return elements;
}

export default function ManualPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Manual de Usuario</h1>
        <p className="text-muted-foreground">Guía completa para usar ScalpAI</p>
      </div>
      <Card>
        <CardContent className="pt-6">
          <ScrollArea className="h-[calc(100vh-200px)]">
            <div className="pr-4 max-w-3xl">
              {renderMarkdown(manualContent)}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
