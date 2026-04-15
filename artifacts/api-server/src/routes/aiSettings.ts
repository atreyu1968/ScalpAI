import { Router, type IRouter } from "express";
import { eq, sql, gte } from "drizzle-orm";
import { db, aiSettingsTable, aiCostLogsTable } from "@workspace/db";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { encrypt, decrypt } from "../lib/crypto";
import { signalService, PROVIDER_PRESETS } from "../services/signalService";

const router: IRouter = Router();

router.get("/admin/ai-settings", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const [settings] = await db.select().from(aiSettingsTable);
  if (!settings) {
    res.json({
      configured: false,
      provider: "deepseek",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-chat",
      signalIntervalS: 5,
    });
    return;
  }

  res.json({
    configured: true,
    provider: settings.provider,
    apiKey: "••••••••",
    baseUrl: settings.baseUrl,
    model: settings.model,
    signalIntervalS: settings.signalIntervalS ?? 5,
  });
});

router.get("/admin/ai-providers", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
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

router.put("/admin/ai-settings", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { apiKey, baseUrl, model, signalIntervalS, provider } = req.body;

  if (!apiKey || !baseUrl || !model) {
    res.status(400).json({ error: "Todos los campos son obligatorios" });
    return;
  }

  const providerValue = provider && PROVIDER_PRESETS[provider] ? provider : "deepseek";
  const intervalValue = Math.max(1, Math.min(300, Number(signalIntervalS) || 5));

  const [existing] = await db.select().from(aiSettingsTable);
  const isKeyMasked = apiKey === "••••••••";

  if (existing && isKeyMasked) {
    await db.update(aiSettingsTable).set({
      provider: providerValue,
      baseUrl,
      model,
      signalIntervalS: intervalValue,
    }).where(eq(aiSettingsTable.id, existing.id));
  } else if (existing) {
    await db.update(aiSettingsTable).set({
      provider: providerValue,
      apiKey: encrypt(apiKey),
      baseUrl,
      model,
      signalIntervalS: intervalValue,
    }).where(eq(aiSettingsTable.id, existing.id));
  } else {
    if (isKeyMasked) {
      res.status(400).json({ error: "La API Key es obligatoria en la primera configuración" });
      return;
    }
    await db.insert(aiSettingsTable).values({
      provider: providerValue,
      apiKey: encrypt(apiKey),
      baseUrl,
      model,
      signalIntervalS: intervalValue,
    });
  }

  signalService.setBatchInterval(intervalValue * 1000);

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

router.get("/admin/ai-cost", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const liveStats = signalService.getDailyCostStats();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    const dailyRows = await db
      .select({
        provider: aiCostLogsTable.provider,
        model: aiCostLogsTable.model,
        totalInput: sql<number>`COALESCE(SUM(${aiCostLogsTable.inputTokens}), 0)::int`,
        totalOutput: sql<number>`COALESCE(SUM(${aiCostLogsTable.outputTokens}), 0)::int`,
        totalCost: sql<string>`COALESCE(SUM(${aiCostLogsTable.costUsd}), 0)::numeric(12,8)`,
        calls: sql<number>`COUNT(*)::int`,
      })
      .from(aiCostLogsTable)
      .where(gte(aiCostLogsTable.createdAt, today))
      .groupBy(aiCostLogsTable.provider, aiCostLogsTable.model);

    const last7d = new Date();
    last7d.setDate(last7d.getDate() - 7);
    last7d.setHours(0, 0, 0, 0);

    const weeklyRows = await db
      .select({
        date: sql<string>`DATE(${aiCostLogsTable.createdAt})::text`,
        totalCost: sql<string>`COALESCE(SUM(${aiCostLogsTable.costUsd}), 0)::numeric(12,8)`,
        calls: sql<number>`COUNT(*)::int`,
      })
      .from(aiCostLogsTable)
      .where(gte(aiCostLogsTable.createdAt, last7d))
      .groupBy(sql`DATE(${aiCostLogsTable.createdAt})`)
      .orderBy(sql`DATE(${aiCostLogsTable.createdAt})`);

    const allTimeRows = await db
      .select({
        totalCost: sql<string>`COALESCE(SUM(${aiCostLogsTable.costUsd}), 0)::numeric(12,8)`,
        totalCalls: sql<number>`COUNT(*)::int`,
      })
      .from(aiCostLogsTable);

    res.json({
      live: liveStats,
      today: dailyRows.map((r) => ({
        provider: r.provider,
        model: r.model,
        inputTokens: r.totalInput,
        outputTokens: r.totalOutput,
        costUsd: parseFloat(r.totalCost),
        calls: r.calls,
      })),
      weekly: weeklyRows.map((r) => ({
        date: r.date,
        costUsd: parseFloat(r.totalCost),
        calls: r.calls,
      })),
      allTime: {
        totalCostUsd: parseFloat(allTimeRows[0]?.totalCost ?? "0"),
        totalCalls: allTimeRows[0]?.totalCalls ?? 0,
      },
    });
  } catch (err) {
    res.json({
      live: liveStats,
      today: [],
      weekly: [],
      allTime: { totalCostUsd: 0, totalCalls: 0 },
    });
  }
});

export default router;
