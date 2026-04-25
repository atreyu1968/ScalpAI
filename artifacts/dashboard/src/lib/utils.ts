import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function isValidPercent(raw: string | undefined | null): boolean {
  if (raw == null) return false;
  const trimmed = String(raw).trim();
  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) return false;
  const n = Number(trimmed);
  return Number.isFinite(n) && n > 0 && n <= 100;
}
