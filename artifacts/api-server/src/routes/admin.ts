import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, usersTable, apiKeysTable, botsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/auth";
import {
  AdminListUsersResponseItem,
  AdminListUsersResponse,
  AdminGetUserParams,
  AdminGetUserResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/admin/users", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const users = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      role: usersTable.role,
      totpEnabled: usersTable.totpEnabled,
      createdAt: usersTable.createdAt,
      botCount: sql<number>`(SELECT COUNT(*) FROM bots WHERE bots.user_id = ${usersTable.id})::int`,
    })
    .from(usersTable)
    .orderBy(usersTable.createdAt);

  const result = users.map((u) => ({
    ...u,
    createdAt: u.createdAt.toISOString(),
  }));

  res.json(AdminListUsersResponse.parse(result));
});

router.get("/admin/users/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const params = AdminGetUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, params.data.id));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const keys = await db
    .select({
      id: apiKeysTable.id,
      label: apiKeysTable.label,
      permissions: apiKeysTable.permissions,
      createdAt: apiKeysTable.createdAt,
      updatedAt: apiKeysTable.updatedAt,
    })
    .from(apiKeysTable)
    .where(eq(apiKeysTable.userId, user.id));

  const bots = await db
    .select({
      id: botsTable.id,
      name: botsTable.name,
      pair: botsTable.pair,
      mode: botsTable.mode,
      status: botsTable.status,
      createdAt: botsTable.createdAt,
    })
    .from(botsTable)
    .where(eq(botsTable.userId, user.id));

  res.json(
    AdminGetUserResponse.parse({
      id: user.id,
      email: user.email,
      role: user.role,
      totpEnabled: user.totpEnabled,
      createdAt: user.createdAt.toISOString(),
      apiKeys: keys.map((k) => ({
        ...k,
        maskedKey: "****",
        createdAt: k.createdAt.toISOString(),
        updatedAt: k.updatedAt.toISOString(),
      })),
      bots: bots.map((b) => ({
        ...b,
        createdAt: b.createdAt.toISOString(),
      })),
    }),
  );
});

export default router;
