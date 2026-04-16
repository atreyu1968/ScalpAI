import type { Bot } from "@workspace/db";

const SPOT_ROUND_TRIP_PCT = 0.20;
const FUTURES_ROUND_TRIP_PCT = 0.10;

export const TP1_FEE_SAFETY_FACTOR = 1.5;

export function getRoundTripFeePct(bot: Pick<Bot, "leverage">): number {
  return bot.leverage > 1 ? FUTURES_ROUND_TRIP_PCT : SPOT_ROUND_TRIP_PCT;
}

export function getMinViableTp1Pct(bot: Pick<Bot, "leverage">): number {
  return getRoundTripFeePct(bot) * TP1_FEE_SAFETY_FACTOR;
}
