import { EventEmitter } from "events";

export type TradingEventType =
  | "trade_opened"
  | "trade_closed"
  | "tp_hit"
  | "bot_started"
  | "bot_stopped"
  | "bot_paused";

export interface TradingEvent {
  type: TradingEventType;
  userId: number;
  botId: number;
  tradeId?: number;
  data?: Record<string, unknown>;
}

class TradingEventBus extends EventEmitter {
  emitTradeEvent(event: TradingEvent): void {
    this.emit("trading", event);
  }
}

export const tradingEvents = new TradingEventBus();
