import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import { db, usersTable, apiKeysTable, botsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/auth";
import { LOG_FILE_PATH, getLogFileInfo } from "../lib/logger";
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

router.get("/admin/logs/info", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const info = getLogFileInfo();
  res.json({
    exists: info.exists,
    sizeBytes: info.size,
    sizeMB: Number((info.size / 1024 / 1024).toFixed(2)),
    path: info.path,
  });
});

async function readLastNLines(filePath: string, n: number): Promise<string> {
  const stat = await fs.promises.stat(filePath);
  const fileSize = stat.size;
  if (fileSize === 0) return "";

  const CHUNK_SIZE = 64 * 1024;
  const MAX_BYTES = 200 * 1024 * 1024;
  const handle = await fs.promises.open(filePath, "r");
  try {
    let position = fileSize;
    let lineCount = 0;
    const chunks: Buffer[] = [];
    let bytesRead = 0;

    while (position > 0 && lineCount <= n && bytesRead < MAX_BYTES) {
      const readSize = Math.min(CHUNK_SIZE, position);
      position -= readSize;
      const buf = Buffer.alloc(readSize);
      await handle.read(buf, 0, readSize, position);
      chunks.unshift(buf);
      bytesRead += readSize;

      for (let i = buf.length - 1; i >= 0; i--) {
        if (buf[i] === 0x0a) {
          lineCount++;
          if (lineCount > n) {
            const remainder = buf.subarray(i + 1);
            chunks[0] = remainder;
            const combined = Buffer.concat(chunks);
            return combined.toString("utf-8");
          }
        }
      }
    }
    return Buffer.concat(chunks).toString("utf-8");
  } finally {
    await handle.close();
  }
}

router.get("/admin/logs/download", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const info = getLogFileInfo();
  if (!info.exists) {
    res.status(404).json({ error: "No log file available yet" });
    return;
  }

  const linesParam = req.query.lines ? parseInt(String(req.query.lines), 10) : null;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `scalpai-logs-${timestamp}.log`;

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  if (linesParam && linesParam > 0) {
    try {
      const safeLines = Math.min(linesParam, 1_000_000);
      const tail = await readLastNLines(LOG_FILE_PATH, safeLines);
      res.send(tail);
    } catch (err) {
      if (!res.headersSent) res.status(500).json({ error: "Failed to read log file" });
    }
    return;
  }

  const stream = fs.createReadStream(LOG_FILE_PATH);
  stream.on("error", () => {
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to stream log file" });
    } else {
      res.destroy();
    }
  });
  res.on("close", () => stream.destroy());
  stream.pipe(res);
});

router.post("/admin/logs/clear", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  try {
    const rotated = `${LOG_FILE_PATH}.1`;
    try { fs.unlinkSync(rotated); } catch {}
    try { fs.renameSync(LOG_FILE_PATH, rotated); } catch {}
    res.json({ ok: true, message: "Logs rotated. Previous logs saved as .1 backup." });
  } catch (err) {
    res.status(500).json({ error: "Failed to clear logs" });
  }
});

export default router;
