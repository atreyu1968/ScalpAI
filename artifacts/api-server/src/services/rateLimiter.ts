import { logger } from "../lib/logger";

const BINANCE_WEIGHT_LIMIT = 1200;
const WEIGHT_WINDOW_MS = 60_000;
const THROTTLE_THRESHOLD = 0.8;

interface WeightEntry {
  weight: number;
  timestamp: number;
}

class RateLimitMonitor {
  private weightLog: Map<string, WeightEntry[]> = new Map();

  recordWeight(userId: string, weight: number): void {
    const entries = this.weightLog.get(userId) ?? [];
    entries.push({ weight, timestamp: Date.now() });
    this.weightLog.set(userId, entries);
    this.cleanup(userId);
  }

  getCurrentWeight(userId: string): number {
    this.cleanup(userId);
    const entries = this.weightLog.get(userId) ?? [];
    return entries.reduce((sum, e) => sum + e.weight, 0);
  }

  canProceed(userId: string, additionalWeight: number = 1): boolean {
    const current = this.getCurrentWeight(userId);
    return (current + additionalWeight) < (BINANCE_WEIGHT_LIMIT * THROTTLE_THRESHOLD);
  }

  shouldThrottle(userId: string): boolean {
    const current = this.getCurrentWeight(userId);
    const ratio = current / BINANCE_WEIGHT_LIMIT;

    if (ratio >= THROTTLE_THRESHOLD) {
      logger.warn({ userId, currentWeight: current, limit: BINANCE_WEIGHT_LIMIT }, "API rate limit throttle triggered");
      return true;
    }
    return false;
  }

  getStatus(userId: string): { currentWeight: number; limit: number; remaining: number; resetInMs: number } {
    this.cleanup(userId);
    const current = this.getCurrentWeight(userId);
    const entries = this.weightLog.get(userId) ?? [];
    const oldestTs = entries.length > 0 ? entries[0].timestamp : Date.now();
    const resetInMs = Math.max(0, WEIGHT_WINDOW_MS - (Date.now() - oldestTs));

    return {
      currentWeight: current,
      limit: BINANCE_WEIGHT_LIMIT,
      remaining: Math.max(0, BINANCE_WEIGHT_LIMIT - current),
      resetInMs,
    };
  }

  private cleanup(userId: string): void {
    const cutoff = Date.now() - WEIGHT_WINDOW_MS;
    const entries = this.weightLog.get(userId) ?? [];
    const filtered = entries.filter((e) => e.timestamp > cutoff);
    if (filtered.length > 0) {
      this.weightLog.set(userId, filtered);
    } else {
      this.weightLog.delete(userId);
    }
  }
}

export const rateLimiter = new RateLimitMonitor();
