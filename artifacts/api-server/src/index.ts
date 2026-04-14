import app from "./app";
import { logger } from "./lib/logger";
import { botManager } from "./services/botManager";
import { signalService } from "./services/signalService";

botManager.setSignalProvider((bot) => signalService.generateSignal(bot));
signalService.setPauseCallback((botId, reason) => botManager.pauseBotRuntime(botId, reason));
logger.info("AI signal provider (DeepSeek via OpenRouter) registered with bot manager");

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
