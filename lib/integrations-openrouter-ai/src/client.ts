import OpenAI from "openai";

let _client: OpenAI | null = null;

export function getOpenRouterClient(): OpenAI {
  if (!_client) {
    if (!process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL) {
      throw new Error(
        "AI_INTEGRATIONS_OPENROUTER_BASE_URL must be set. Did you forget to provision the OpenRouter AI integration?",
      );
    }

    if (!process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY) {
      throw new Error(
        "AI_INTEGRATIONS_OPENROUTER_API_KEY must be set. Did you forget to provision the OpenRouter AI integration?",
      );
    }

    _client = new OpenAI({
      baseURL: process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL,
      apiKey: process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY,
    });
  }
  return _client;
}

export const openrouter = new Proxy({} as OpenAI, {
  get(_target, prop) {
    return (getOpenRouterClient() as any)[prop];
  },
});
