import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, aiSettingsTable } from "@workspace/db";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { encrypt, decrypt } from "../lib/crypto";

const router: IRouter = Router();

router.get("/admin/ai-settings", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const [settings] = await db.select().from(aiSettingsTable);
  if (!settings) {
    res.json({
      configured: false,
      provider: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      model: "deepseek/deepseek-chat-v3.1",
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

router.put("/admin/ai-settings", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { apiKey, baseUrl, model } = req.body;

  if (!apiKey || !baseUrl || !model) {
    res.status(400).json({ error: "Todos los campos son obligatorios" });
    return;
  }

  const [existing] = await db.select().from(aiSettingsTable);
  const isKeyMasked = apiKey === "••••••••";

  if (existing && isKeyMasked) {
    await db.update(aiSettingsTable).set({
      baseUrl,
      model,
    }).where(eq(aiSettingsTable.id, existing.id));
  } else if (existing) {
    await db.update(aiSettingsTable).set({
      apiKey: encrypt(apiKey),
      baseUrl,
      model,
    }).where(eq(aiSettingsTable.id, existing.id));
  } else {
    if (isKeyMasked) {
      res.status(400).json({ error: "La API Key es obligatoria en la primera configuración" });
      return;
    }
    await db.insert(aiSettingsTable).values({
      provider: "openrouter",
      apiKey: encrypt(apiKey),
      baseUrl,
      model,
    });
  }

  res.json({ success: true });
});

router.post("/admin/ai-settings/test", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { apiKey, baseUrl, model } = req.body;

  if (!apiKey || !baseUrl) {
    res.status(400).json({ error: "API Key y URL base son obligatorios" });
    return;
  }

  let key = apiKey;
  if (apiKey === "••••••••") {
    const [settings] = await db.select().from(aiSettingsTable);
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
      model: model || "deepseek/deepseek-chat-v3.1",
      messages: [{ role: "user", content: "Respond with just: OK" }],
      max_tokens: 5,
    });
    if (response.choices?.[0]?.message?.content) {
      res.json({ success: true, message: "Conexión exitosa con el modelo de IA" });
    } else {
      res.status(400).json({ error: "Respuesta vacía del modelo" });
    }
  } catch (err: any) {
    const msg = err?.message || "Error desconocido";
    res.status(400).json({ error: `Error de conexión: ${msg}` });
  }
});

export default router;
