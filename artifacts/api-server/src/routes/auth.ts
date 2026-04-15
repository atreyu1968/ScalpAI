import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import argon2 from "argon2";
import { eq, and, gt, or, isNull } from "drizzle-orm";
import { db, usersTable, invitationsTable } from "@workspace/db";
import { signToken } from "../lib/jwt";
import { requireAuth } from "../middlewares/auth";
import { sendVerificationEmail, sendPasswordResetEmail } from "../lib/email";
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
  const invitationCode = req.body.invitationCode;

  if (!invitationCode) {
    res.status(400).json({ error: "Se requiere un código de invitación para registrarse" });
    return;
  }

  const [invitation] = await db
    .select()
    .from(invitationsTable)
    .where(
      and(
        eq(invitationsTable.code, String(invitationCode).toUpperCase()),
        eq(invitationsTable.used, false),
        or(isNull(invitationsTable.expiresAt), gt(invitationsTable.expiresAt, new Date()))
      )
    );

  if (!invitation) {
    res.status(400).json({ error: "Código de invitación inválido o expirado" });
    return;
  }

  if (invitation.email && invitation.email.toLowerCase() !== email.toLowerCase()) {
    res.status(400).json({ error: "Este código de invitación está reservado para otro correo electrónico" });
    return;
  }

  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email));

  if (existing) {
    res.status(409).json({ error: "Este correo ya está registrado" });
    return;
  }

  const passwordHash = await argon2.hash(password);
  const verificationToken = crypto.randomBytes(32).toString("hex");
  const verificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

  let user: { id: number; email: string };
  try {
    const result = await db.transaction(async (tx) => {
      const [claimed] = await tx
        .update(invitationsTable)
        .set({ used: true, usedAt: new Date() })
        .where(
          and(
            eq(invitationsTable.id, invitation.id),
            eq(invitationsTable.used, false)
          )
        )
        .returning({ id: invitationsTable.id });

      if (!claimed) {
        throw new Error("INVITATION_ALREADY_USED");
      }

      const [newUser] = await tx
        .insert(usersTable)
        .values({
          email,
          passwordHash,
          role: "user",
          totpEnabled: false,
          emailVerified: false,
          emailVerificationToken: verificationToken,
          emailVerificationExpiry: verificationExpiry,
        })
        .returning();

      await tx
        .update(invitationsTable)
        .set({ usedByUserId: newUser.id })
        .where(eq(invitationsTable.id, invitation.id));

      return { id: newUser.id, email: newUser.email };
    });
    user = result;
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "INVITATION_ALREADY_USED") {
      res.status(400).json({ error: "Código de invitación inválido o expirado" });
      return;
    }
    throw err;
  }

  const emailSent = await sendVerificationEmail(email, verificationToken);

  res.status(201).json({
    message: emailSent
      ? "Cuenta creada. Revisa tu correo para confirmar tu cuenta."
      : "Cuenta creada. El servidor de correo no está configurado — contacta al administrador.",
    emailSent,
    user: {
      id: user.id,
      email: user.email,
    },
  });
});

router.post("/auth/verify-email", async (req, res): Promise<void> => {
  const { token } = req.body;
  if (!token) {
    res.status(400).json({ error: "Token requerido" });
    return;
  }

  const [updated] = await db
    .update(usersTable)
    .set({
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpiry: null,
    })
    .where(
      and(
        eq(usersTable.emailVerificationToken, token),
        gt(usersTable.emailVerificationExpiry, new Date()),
      )
    )
    .returning();

  if (!updated) {
    res.status(400).json({ error: "Token inválido o expirado" });
    return;
  }

  const jwtToken = signToken({ userId: updated.id, email: updated.email, role: updated.role });

  res.json(
    LoginResponse.parse({
      token: jwtToken,
      user: {
        id: updated.id,
        email: updated.email,
        role: updated.role,
        totpEnabled: updated.totpEnabled,
        createdAt: updated.createdAt.toISOString(),
      },
    }),
  );
});

router.post("/auth/resend-verification", async (req, res): Promise<void> => {
  const { email } = req.body;
  if (!email) {
    res.status(400).json({ error: "Correo requerido" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));

  if (!user) {
    res.json({ message: "Si el correo existe, se envió un nuevo enlace de verificación." });
    return;
  }

  if (user.emailVerified) {
    res.json({ message: "El correo ya está verificado. Puedes iniciar sesión." });
    return;
  }

  const verificationToken = crypto.randomBytes(32).toString("hex");
  const verificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await db
    .update(usersTable)
    .set({ emailVerificationToken: verificationToken, emailVerificationExpiry: verificationExpiry })
    .where(eq(usersTable.id, user.id));

  await sendVerificationEmail(email, verificationToken);

  res.json({ message: "Si el correo existe, se envió un nuevo enlace de verificación." });
});

router.post("/auth/forgot-password", async (req, res): Promise<void> => {
  const { email } = req.body;
  if (!email) {
    res.status(400).json({ error: "Correo requerido" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));

  if (user) {
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetExpiry = new Date(Date.now() + 60 * 60 * 1000);

    await db
      .update(usersTable)
      .set({ passwordResetToken: resetToken, passwordResetExpiry: resetExpiry })
      .where(eq(usersTable.id, user.id));

    await sendPasswordResetEmail(email, resetToken);
  }

  res.json({ message: "Si el correo existe, recibirás instrucciones para restablecer tu contraseña." });
});

router.post("/auth/reset-password", async (req, res): Promise<void> => {
  const { token, password } = req.body;
  if (!token || !password) {
    res.status(400).json({ error: "Token y nueva contraseña son requeridos" });
    return;
  }

  if (password.length < 8) {
    res.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres" });
    return;
  }

  const passwordHash = await argon2.hash(password);

  const [updated] = await db
    .update(usersTable)
    .set({
      passwordHash,
      passwordResetToken: null,
      passwordResetExpiry: null,
    })
    .where(
      and(
        eq(usersTable.passwordResetToken, token),
        gt(usersTable.passwordResetExpiry, new Date()),
      )
    )
    .returning({ id: usersTable.id });

  if (!updated) {
    res.status(400).json({ error: "Token inválido o expirado" });
    return;
  }

  res.json({ message: "Contraseña actualizada correctamente. Ya puedes iniciar sesión." });
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
    res.status(401).json({ error: "Correo o contraseña inválidos" });
    return;
  }

  const valid = await argon2.verify(user.passwordHash, password);
  if (!valid) {
    res.status(401).json({ error: "Correo o contraseña inválidos" });
    return;
  }

  if (!user.emailVerified) {
    res.status(403).json({ error: "EMAIL_NOT_VERIFIED", message: "Debes confirmar tu correo electrónico antes de iniciar sesión." });
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
      res.status(401).json({ error: "Código 2FA inválido" });
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
