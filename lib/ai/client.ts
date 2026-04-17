import OpenAI from "openai";

let cached: OpenAI | null = null;

export function isAiEnabled(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY);
}

export function aiClient(): OpenAI {
  if (cached) return cached;
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) {
    throw new Error("AI_GATEWAY_API_KEY is not set");
  }
  cached = new OpenAI({
    apiKey,
    baseURL: process.env.AI_GATEWAY_BASE_URL || "https://ai-gateway.vercel.sh/v1",
  });
  return cached;
}

export function aiModel(): string {
  return process.env.AI_GATEWAY_MODEL || "anthropic/claude-haiku-4.5";
}
