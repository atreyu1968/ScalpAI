import { Router, type IRouter } from "express";
import { TOTP, Secret } from "otpauth";
import QRCode from "qrcode";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import {
  TotpSetupResponse,
  TotpVerifyBody,
  TotpVerifyResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/auth/totp/setup", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.userId;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (user.totpEnabled) {
    res.status(400).json({ error: "2FA is already enabled" });
    return;
  }

  const secret = new Secret({ size: 20 });
  const totp = new TOTP({
    issuer: "ScalpAI",
    label: user.email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret,
  });

  const uri = totp.toString();
  const qrCodeDataUrl = await QRCode.toDataURL(uri);

  await db
    .update(usersTable)
    .set({ totpSecret: secret.base32 })
    .where(eq(usersTable.id, userId));

  res.json(
    TotpSetupResponse.parse({
      secret: secret.base32,
      qrCode: qrCodeDataUrl,
      uri,
    }),
  );
});

router.post("/auth/totp/verify", requireAuth, async (req, res): Promise<void> => {
  const parsed = TotpVerifyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = req.user!.userId;
  const { code } = parsed.data;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (!user.totpSecret) {
    res.status(400).json({ error: "2FA setup not initiated. Call /auth/totp/setup first" });
    return;
  }

  const totp = new TOTP({
    secret: user.totpSecret,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
  });

  const valid = totp.validate({ token: code, window: 1 });
  if (valid === null) {
    res.status(400).json({ error: "Invalid 2FA code" });
    return;
  }

  await db
    .update(usersTable)
    .set({ totpEnabled: true })
    .where(eq(usersTable.id, userId));

  res.json(TotpVerifyResponse.parse({ enabled: true }));
});

router.post("/auth/totp/disable", requireAuth, async (req, res): Promise<void> => {
  const parsed = TotpVerifyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = req.user!.userId;
  const { code } = parsed.data;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user || !user.totpEnabled || !user.totpSecret) {
    res.status(400).json({ error: "2FA is not enabled" });
    return;
  }

  const totp = new TOTP({
    secret: user.totpSecret,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
  });

  const valid = totp.validate({ token: code, window: 1 });
  if (valid === null) {
    res.status(400).json({ error: "Invalid 2FA code" });
    return;
  }

  await db
    .update(usersTable)
    .set({ totpEnabled: false, totpSecret: null })
    .where(eq(usersTable.id, userId));

  res.json(TotpVerifyResponse.parse({ enabled: false }));
});

export default router;
