import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import { eq, desc, and, gt, or, isNull } from "drizzle-orm";
import { db, invitationsTable, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/admin/invitations", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const invitations = await db
    .select({
      id: invitationsTable.id,
      code: invitationsTable.code,
      email: invitationsTable.email,
      used: invitationsTable.used,
      usedByUserId: invitationsTable.usedByUserId,
      createdAt: invitationsTable.createdAt,
      expiresAt: invitationsTable.expiresAt,
      usedAt: invitationsTable.usedAt,
    })
    .from(invitationsTable)
    .orderBy(desc(invitationsTable.createdAt));

  const usedByIds = invitations.filter(i => i.usedByUserId).map(i => i.usedByUserId!);
  let usedByEmails: Record<number, string> = {};
  if (usedByIds.length > 0) {
    const users = await db.select({ id: usersTable.id, email: usersTable.email }).from(usersTable);
    usedByEmails = Object.fromEntries(users.map(u => [u.id, u.email]));
  }

  res.json(invitations.map(inv => ({
    id: inv.id,
    code: inv.code,
    email: inv.email,
    used: inv.used,
    usedByEmail: inv.usedByUserId ? usedByEmails[inv.usedByUserId] || null : null,
    expired: inv.expiresAt ? new Date() > inv.expiresAt : false,
    createdAt: inv.createdAt.toISOString(),
    expiresAt: inv.expiresAt?.toISOString() || null,
    usedAt: inv.usedAt?.toISOString() || null,
  })));
});

router.post("/admin/invitations", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const { email, expiresInDays } = req.body;

  const code = crypto.randomBytes(6).toString("hex").toUpperCase();

  const expiresAt = expiresInDays
    ? new Date(Date.now() + Number(expiresInDays) * 24 * 60 * 60 * 1000)
    : null;

  const [invitation] = await db
    .insert(invitationsTable)
    .values({
      code,
      email: email || null,
      createdByUserId: userId,
      expiresAt,
    })
    .returning();

  res.status(201).json({
    id: invitation.id,
    code: invitation.code,
    email: invitation.email,
    expiresAt: invitation.expiresAt?.toISOString() || null,
    createdAt: invitation.createdAt.toISOString(),
  });
});

router.delete("/admin/invitations/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }

  const [inv] = await db.select().from(invitationsTable).where(eq(invitationsTable.id, id));
  if (!inv) {
    res.status(404).json({ error: "Invitación no encontrada" });
    return;
  }
  if (inv.used) {
    res.status(400).json({ error: "No se puede eliminar una invitación ya usada" });
    return;
  }

  await db.delete(invitationsTable).where(eq(invitationsTable.id, id));
  res.sendStatus(204);
});

router.get("/auth/invitation/:code", async (req, res): Promise<void> => {
  const { code } = req.params;

  const [inv] = await db
    .select()
    .from(invitationsTable)
    .where(
      and(
        eq(invitationsTable.code, code.toUpperCase()),
        eq(invitationsTable.used, false),
        or(isNull(invitationsTable.expiresAt), gt(invitationsTable.expiresAt, new Date()))
      )
    );

  if (!inv) {
    res.status(404).json({ valid: false, error: "Código de invitación inválido o expirado" });
    return;
  }

  res.json({
    valid: true,
    email: inv.email || null,
  });
});

export default router;
