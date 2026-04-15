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
- **Apalancamiento** — Multiplicador de capital (1x = spot, >1x = futuros)
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

## 10. Preguntas Frecuentes

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
