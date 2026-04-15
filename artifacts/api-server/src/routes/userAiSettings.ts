import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, userAiSettingsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { encrypt, decrypt } from "../lib/crypto";
import { PROVIDER_PRESETS } from "../services/signalService";

const ALLOWED_BASE_URLS = new Set(
  Object.values(PROVIDER_PRESETS).map((p) => p.baseUrl)
);

function isAllowedBaseUrl(url: string): boolean {
  if (ALLOWED_BASE_URLS.has(url)) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

const router: IRouter = Router();

router.get("/user/ai-settings", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const [settings] = await db.select().from(userAiSettingsTable).where(eq(userAiSettingsTable.userId, userId));

  if (!settings) {
    res.json({
      configured: false,
      provider: "deepseek",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-chat",
    });
    return;
  }

  res.json({
    configured: true,
    provider: settings.provider,
    apiKey: "••••••••",
    baseUrl: settings.baseUrl,
    model: settings.model,
  });
});

router.get("/user/ai-providers", requireAuth, async (_req, res): Promise<void> => {
  const providers = Object.values(PROVIDER_PRESETS).map((p) => ({
    provider: p.provider,
    label: p.label,
    baseUrl: p.baseUrl,
    model: p.model,
    inputCostPer1M: p.inputCostPer1M,
    outputCostPer1M: p.outputCostPer1M,
  }));
  res.json(providers);
});

router.put("/user/ai-settings", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const { apiKey, baseUrl, model, provider } = req.body;

  if (!apiKey || !baseUrl || !model) {
    res.status(400).json({ error: "Todos los campos son obligatorios" });
    return;
  }

  if (!isAllowedBaseUrl(baseUrl)) {
    res.status(400).json({ error: "URL base no válida. Debe ser HTTPS." });
    return;
  }

  const providerValue = provider && PROVIDER_PRESETS[provider] ? provider : "deepseek";
  const isKeyMasked = apiKey === "••••••••";

  const [existing] = await db.select().from(userAiSettingsTable).where(eq(userAiSettingsTable.userId, userId));

  if (existing && isKeyMasked) {
    await db.update(userAiSettingsTable).set({
      provider: providerValue,
      baseUrl,
      model,
    }).where(eq(userAiSettingsTable.id, existing.id));
  } else if (existing) {
    await db.update(userAiSettingsTable).set({
      provider: providerValue,
      apiKey: encrypt(apiKey),
      baseUrl,
      model,
    }).where(eq(userAiSettingsTable.id, existing.id));
  } else {
    if (isKeyMasked) {
      res.status(400).json({ error: "La API Key es obligatoria en la primera configuración" });
      return;
    }
    await db.insert(userAiSettingsTable).values({
      userId,
      provider: providerValue,
      apiKey: encrypt(apiKey),
      baseUrl,
      model,
    });
  }

  res.json({ success: true });
});

router.post("/user/ai-settings/test", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const { apiKey, baseUrl, model } = req.body;

  if (!apiKey || !baseUrl) {
    res.status(400).json({ error: "API Key y URL base son obligatorios" });
    return;
  }

  if (!isAllowedBaseUrl(baseUrl)) {
    res.status(400).json({ error: "URL base no válida. Debe ser HTTPS." });
    return;
  }

  let key = apiKey;
  if (apiKey === "••••••••") {
    const [settings] = await db.select().from(userAiSettingsTable).where(eq(userAiSettingsTable.userId, userId));
    if (settings) {
      try {
        key = decrypt(settings.apiKey);
      } catch {
        key = settings.apiKey;
      }
    } else {
      res.status(400).json({ error: "No hay API Key guardada para probar" });
      return;
    }
  }

  try {
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({ baseURL: baseUrl, apiKey: key });
    const response = await client.chat.completions.create({
      model: model || "deepseek-chat",
      messages: [{ role: "user", content: "Respond with just: OK" }],
      max_tokens: 5,
    });
    if (response.choices?.[0]?.message?.content) {
      res.json({ success: true, message: "Conexión exitosa con el modelo de IA" });
    } else {
      res.status(400).json({ error: "Respuesta vacía del modelo" });
    }
  } catch (err: any) {
    const status = err?.status || err?.statusCode;
    let msg = "Error de conexión con el proveedor de IA";
    if (status === 401 || status === 403) {
      msg = "API Key inválida o sin permisos";
    } else if (status === 404) {
      msg = "Modelo no encontrado — verifica el nombre del modelo";
    } else if (status === 429) {
      msg = "Límite de llamadas excedido — intenta más tarde";
    } else if (err?.code === "ENOTFOUND" || err?.code === "ECONNREFUSED") {
      msg = "No se pudo conectar al servidor — verifica la URL base";
    }
    res.status(400).json({ error: msg });
  }
});

router.delete("/user/ai-settings", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  await db.delete(userAiSettingsTable).where(eq(userAiSettingsTable.userId, userId));
  res.json({ success: true });
});

export default router;
