import { Router, type IRouter } from "express";
import argon2 from "argon2";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { signToken } from "../lib/jwt";
import { requireAuth } from "../middlewares/auth";
import {
  RegisterBody,
  LoginBody,
  LoginResponse,
  GetProfileResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password } = parsed.data;

  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email));

  if (existing) {
    res.status(409).json({ error: "Email already registered" });
    return;
  }

  const passwordHash = await argon2.hash(password);
  const [user] = await db
    .insert(usersTable)
    .values({ email, passwordHash, role: "user", totpEnabled: false })
    .returning();

  const token = signToken({ userId: user.id, email: user.email, role: user.role });

  res.status(201).json(
    LoginResponse.parse({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        totpEnabled: user.totpEnabled,
        createdAt: user.createdAt.toISOString(),
      },
    }),
  );
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password, totpCode } = parsed.data;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));

  if (!user) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const valid = await argon2.verify(user.passwordHash, password);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  if (user.totpEnabled) {
    if (!totpCode) {
      res.status(403).json({ error: "2FA code required" });
      return;
    }
    const { TOTP } = await import("otpauth");
    const totp = new TOTP({ secret: user.totpSecret ?? "", algorithm: "SHA1", digits: 6, period: 30 });
    const valid2fa = totp.validate({ token: totpCode, window: 1 });
    if (valid2fa === null) {
      res.status(401).json({ error: "Invalid 2FA code" });
      return;
    }
  }

  const token = signToken({ userId: user.id, email: user.email, role: user.role });

  res.json(
    LoginResponse.parse({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        totpEnabled: user.totpEnabled,
        createdAt: user.createdAt.toISOString(),
      },
    }),
  );
});

router.get("/auth/profile", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(
    GetProfileResponse.parse({
      id: user.id,
      email: user.email,
      role: user.role,
      totpEnabled: user.totpEnabled,
      createdAt: user.createdAt.toISOString(),
    }),
  );
});

export default router;
