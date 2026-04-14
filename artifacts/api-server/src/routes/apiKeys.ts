import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, usersTable, apiKeysTable } from "@workspace/db";
import { TOTP } from "otpauth";
import { requireAuth } from "../middlewares/auth";
import { encrypt } from "../lib/crypto";
import {
  CreateApiKeyBody,
  UpdateApiKeyBody,
  UpdateApiKeyParams,
  ListApiKeysResponseItem,
  ListApiKeysResponse,
  DeleteApiKeyParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function verify2fa(userId: number, totpCode: string | undefined | null): Promise<string | null> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) return "User not found";

  if (user.totpEnabled) {
    if (!totpCode) return "2FA code required for API key operations";
    const totp = new TOTP({ secret: user.totpSecret ?? "", algorithm: "SHA1", digits: 6, period: 30 });
    const valid = totp.validate({ token: totpCode, window: 1 });
    if (valid === null) return "Invalid 2FA code";
  }

  return null;
}

router.get("/api-keys", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.userId;

  const keys = await db
    .select({
      id: apiKeysTable.id,
      label: apiKeysTable.label,
      permissions: apiKeysTable.permissions,
      createdAt: apiKeysTable.createdAt,
      updatedAt: apiKeysTable.updatedAt,
    })
    .from(apiKeysTable)
    .where(eq(apiKeysTable.userId, userId));

  const masked = keys.map((k) => ({
    ...k,
    maskedKey: "****",
    createdAt: k.createdAt.toISOString(),
    updatedAt: k.updatedAt.toISOString(),
  }));

  res.json(ListApiKeysResponse.parse(masked));
});

router.post("/api-keys", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateApiKeyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = req.user!.userId;
  const { label, apiKey, apiSecret, totpCode } = parsed.data;

  const error = await verify2fa(userId, totpCode);
  if (error) {
    res.status(403).json({ error });
    return;
  }

  const encryptedApiKey = encrypt(apiKey);
  const encryptedApiSecret = encrypt(apiSecret);

  const [created] = await db
    .insert(apiKeysTable)
    .values({
      userId,
      label,
      encryptedApiKey,
      encryptedApiSecret,
      permissions: "read,trade",
    })
    .returning();

  res.status(201).json(
    ListApiKeysResponseItem.parse({
      id: created.id,
      label: created.label,
      permissions: created.permissions,
      maskedKey: "****",
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    }),
  );
});

router.patch("/api-keys/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateApiKeyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateApiKeyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = req.user!.userId;
  const { label, apiKey, apiSecret, totpCode } = parsed.data;

  const error = await verify2fa(userId, totpCode);
  if (error) {
    res.status(403).json({ error });
    return;
  }

  const updateData: Record<string, string> = {};
  if (label) updateData.label = label;
  if (apiKey) updateData.encryptedApiKey = encrypt(apiKey);
  if (apiSecret) updateData.encryptedApiSecret = encrypt(apiSecret);

  if (Object.keys(updateData).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const [updated] = await db
    .update(apiKeysTable)
    .set(updateData)
    .where(and(eq(apiKeysTable.id, params.data.id), eq(apiKeysTable.userId, userId)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "API key not found" });
    return;
  }

  res.json(
    ListApiKeysResponseItem.parse({
      id: updated.id,
      label: updated.label,
      permissions: updated.permissions,
      maskedKey: "****",
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    }),
  );
});

router.delete("/api-keys/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteApiKeyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const userId = req.user!.userId;
  const totpCode = req.headers["x-totp-code"] as string | undefined;

  const error = await verify2fa(userId, totpCode);
  if (error) {
    res.status(403).json({ error });
    return;
  }

  const [deleted] = await db
    .delete(apiKeysTable)
    .where(and(eq(apiKeysTable.id, params.data.id), eq(apiKeysTable.userId, userId)))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "API key not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
