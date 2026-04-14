import nodemailer from "nodemailer";
import { db, emailSettingsTable } from "@workspace/db";
import { decrypt } from "./crypto";
import { logger } from "./logger";

async function getSmtpConfig() {
  const [settings] = await db.select().from(emailSettingsTable);
  if (!settings) return null;

  let smtpPass = settings.smtpPass;
  try {
    smtpPass = decrypt(smtpPass);
  } catch {
    // pass
  }

  return {
    host: settings.smtpHost,
    port: settings.smtpPort,
    secure: settings.smtpSecure,
    auth: { user: settings.smtpUser, pass: smtpPass },
    fromName: settings.fromName,
    fromEmail: settings.fromEmail,
  };
}

async function sendMail(to: string, subject: string, html: string): Promise<boolean> {
  const config = await getSmtpConfig();
  if (!config) {
    logger.warn("No SMTP settings configured — email not sent");
    return false;
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth,
  });

  try {
    await transporter.sendMail({
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to,
      subject,
      html,
    });
    logger.info({ to, subject }, "Email sent successfully");
    return true;
  } catch (err) {
    logger.error({ err, to, subject }, "Failed to send email");
    return false;
  }
}

function getBaseUrl(): string {
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  return process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;
}

export async function sendVerificationEmail(email: string, token: string): Promise<boolean> {
  const link = `${getBaseUrl()}/verify-email?token=${token}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #059669; margin: 0;">⚡ ScalpAI</h1>
      </div>
      <h2 style="color: #333;">Confirma tu correo electrónico</h2>
      <p style="color: #555; font-size: 16px;">
        Gracias por registrarte en ScalpAI. Para activar tu cuenta, haz clic en el siguiente enlace:
      </p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${link}" style="background-color: #059669; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: bold;">
          Confirmar Correo
        </a>
      </div>
      <p style="color: #888; font-size: 14px;">
        Este enlace expira en 24 horas. Si no creaste esta cuenta, ignora este mensaje.
      </p>
      <p style="color: #888; font-size: 12px; margin-top: 20px; border-top: 1px solid #eee; padding-top: 15px;">
        Si el botón no funciona, copia y pega este enlace en tu navegador:<br/>
        <a href="${link}" style="color: #059669;">${link}</a>
      </p>
    </div>
  `;
  return sendMail(email, "Confirma tu correo - ScalpAI", html);
}

export async function sendPasswordResetEmail(email: string, token: string): Promise<boolean> {
  const link = `${getBaseUrl()}/reset-password?token=${token}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #059669; margin: 0;">⚡ ScalpAI</h1>
      </div>
      <h2 style="color: #333;">Restablecer contraseña</h2>
      <p style="color: #555; font-size: 16px;">
        Recibimos una solicitud para restablecer la contraseña de tu cuenta. Haz clic en el siguiente enlace:
      </p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${link}" style="background-color: #059669; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: bold;">
          Restablecer Contraseña
        </a>
      </div>
      <p style="color: #888; font-size: 14px;">
        Este enlace expira en 1 hora. Si no solicitaste el cambio, ignora este mensaje.
      </p>
      <p style="color: #888; font-size: 12px; margin-top: 20px; border-top: 1px solid #eee; padding-top: 15px;">
        Si el botón no funciona, copia y pega este enlace en tu navegador:<br/>
        <a href="${link}" style="color: #059669;">${link}</a>
      </p>
    </div>
  `;
  return sendMail(email, "Restablecer contraseña - ScalpAI", html);
}

export async function testSmtpConnection(config: {
  host: string; port: number; secure: boolean; user: string; pass: string;
}): Promise<{ ok: boolean; error?: string }> {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
  });

  try {
    await transporter.verify();
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: (err as Error).message };
  }
}
