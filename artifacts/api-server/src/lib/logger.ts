import pino from "pino";
import path from "node:path";
import fs from "node:fs";

const isProduction = process.env.NODE_ENV === "production";

const LOG_DIR = process.env.LOG_DIR ?? path.resolve(process.cwd(), "logs");
try {
  fs.mkdirSync(LOG_DIR, { recursive: true });
} catch {
}

export const LOG_FILE_PATH = path.join(LOG_DIR, "app.log");

const targets: pino.TransportTargetOptions[] = [
  {
    target: "pino/file",
    options: { destination: LOG_FILE_PATH, mkdir: true },
    level: process.env.LOG_LEVEL ?? "info",
  },
];

if (isProduction) {
  targets.push({
    target: "pino/file",
    options: { destination: 1 },
    level: process.env.LOG_LEVEL ?? "info",
  });
} else {
  targets.push({
    target: "pino-pretty",
    options: { colorize: true, destination: 1 },
    level: process.env.LOG_LEVEL ?? "info",
  });
}

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  transport: { targets },
});

export function getLogFileInfo(): { path: string; size: number; exists: boolean } {
  try {
    const stat = fs.statSync(LOG_FILE_PATH);
    return { path: LOG_FILE_PATH, size: stat.size, exists: true };
  } catch {
    return { path: LOG_FILE_PATH, size: 0, exists: false };
  }
}

const MAX_LOG_SIZE_BYTES = 100 * 1024 * 1024;

export function rotateLogIfNeeded(): void {
  try {
    const stat = fs.statSync(LOG_FILE_PATH);
    if (stat.size > MAX_LOG_SIZE_BYTES) {
      const rotated = `${LOG_FILE_PATH}.1`;
      try {
        fs.unlinkSync(rotated);
      } catch {}
      fs.renameSync(LOG_FILE_PATH, rotated);
    }
  } catch {
  }
}

setInterval(rotateLogIfNeeded, 60 * 60 * 1000).unref();
