import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, emailSettingsTable } from "@workspace/db";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { encrypt, decrypt } from "../lib/crypto";
import { testSmtpConnection } from "../lib/email";

const router: IRouter = Router();

router.get("/admin/email-settings", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const [settings] = await db.select().from(emailSettingsTable);
  if (!settings) {
    res.json({ configured: false });
    return;
  }

  res.json({
    configured: true,
    smtpHost: settings.smtpHost,
    smtpPort: settings.smtpPort,
    smtpSecure: settings.smtpSecure,
    smtpUser: settings.smtpUser,
    smtpPass: "••••••••",
    fromName: settings.fromName,
    fromEmail: settings.fromEmail,
  });
});

router.put("/admin/email-settings", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass, fromName, fromEmail } = req.body;

  if (!smtpHost || !smtpPort || !smtpUser || !smtpPass || !fromEmail) {
    res.status(400).json({ error: "Todos los campos SMTP son obligatorios" });
    return;
  }

  const [existing] = await db.select().from(emailSettingsTable);

  const isPasswordMasked = smtpPass === "••••••••";

  if (existing && isPasswordMasked) {
    await db.update(emailSettingsTable).set({
      smtpHost,
      smtpPort: Number(smtpPort),
      smtpSecure: Boolean(smtpSecure),
      smtpUser,
      fromName: fromName || "ScalpAI",
      fromEmail,
    }).where(eq(emailSettingsTable.id, existing.id));
  } else if (existing) {
    await db.update(emailSettingsTable).set({
      smtpHost,
      smtpPort: Number(smtpPort),
      smtpSecure: Boolean(smtpSecure),
      smtpUser,
      smtpPass: encrypt(smtpPass),
      fromName: fromName || "ScalpAI",
      fromEmail,
    }).where(eq(emailSettingsTable.id, existing.id));
  } else {
    if (isPasswordMasked) {
      res.status(400).json({ error: "La contraseña SMTP es obligatoria en la primera configuración" });
      return;
    }
    await db.insert(emailSettingsTable).values({
      smtpHost,
      smtpPort: Number(smtpPort),
      smtpSecure: Boolean(smtpSecure),
      smtpUser,
      smtpPass: encrypt(smtpPass),
      fromName: fromName || "ScalpAI",
      fromEmail,
    });
  }

  res.json({ success: true });
});

router.post("/admin/email-settings/test", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass } = req.body;

  if (!smtpHost || !smtpPort || !smtpUser || !smtpPass) {
    res.status(400).json({ error: "Todos los campos SMTP son obligatorios" });
    return;
  }

  let password = smtpPass;
  if (smtpPass === "••••••••") {
    const [settings] = await db.select().from(emailSettingsTable);
    if (settings) {
      try {
        password = decrypt(settings.smtpPass);
      } catch {
        password = settings.smtpPass;
      }
    }
  }

  const result = await testSmtpConnection({
    host: smtpHost,
    port: Number(smtpPort),
    secure: Boolean(smtpSecure),
    user: smtpUser,
    pass: password,
  });

  if (result.ok) {
    res.json({ success: true, message: "Conexión SMTP exitosa" });
  } else {
    res.status(400).json({ error: `Error de conexión: ${result.error}` });
  }
});

export default router;
