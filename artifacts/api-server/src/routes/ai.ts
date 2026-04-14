import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth";
import { signalService } from "../services/signalService";

const router: IRouter = Router();

router.get("/ai/sentiment", requireAuth, async (_req, res): Promise<void> => {
  const allSentiments = signalService.getAllSentiments();

  res.json({
    pairs: allSentiments.map((s) => ({
      pair: s.pair,
      status: s.lastError ? "error" : s.lastSignal ? "active" : "waiting",
      lastSignal: s.lastSignal,
      lastAnalysisAt: s.lastAnalysisAt ? new Date(s.lastAnalysisAt).toISOString() : null,
      analysisCount: s.analysisCount,
      errorCount: s.errorCount,
    })),
    batchIntervalMs: signalService.getBatchInterval(),
  });
});

router.get("/ai/sentiment/:pair", requireAuth, async (req, res): Promise<void> => {
  const pair = decodeURIComponent(req.params.pair as string);
  const sentiment = signalService.getSentiment(pair);

  if (!sentiment) {
    res.json({
      pair,
      status: "no_data",
      lastSignal: null,
      lastSnapshot: null,
      lastAnalysisAt: null,
      analysisCount: 0,
      errorCount: 0,
      lastError: null,
    });
    return;
  }

  res.json({
    pair: sentiment.pair,
    status: sentiment.lastError ? "error" : sentiment.lastSignal ? "active" : "waiting",
    lastSignal: sentiment.lastSignal,
    lastSnapshot: sentiment.lastSnapshot
      ? {
          orderBook: {
            spread: sentiment.lastSnapshot.orderBook.spread,
            spreadBps: sentiment.lastSnapshot.orderBook.spreadBps,
            volumeImbalance: sentiment.lastSnapshot.orderBook.volumeImbalance,
            bidDepth: sentiment.lastSnapshot.orderBook.bidDepth,
            askDepth: sentiment.lastSnapshot.orderBook.askDepth,
          },
          recentTrades: sentiment.lastSnapshot.recentTrades,
          indicators: sentiment.lastSnapshot.indicators,
        }
      : null,
    lastAnalysisAt: sentiment.lastAnalysisAt
      ? new Date(sentiment.lastAnalysisAt).toISOString()
      : null,
    analysisCount: sentiment.analysisCount,
    errorCount: sentiment.errorCount,
    lastError: sentiment.lastError,
  });
});

export default router;
