import type { LlmProvider } from "@/lib/db/schema/api-keys";

export type ProviderConfig = {
  id: LlmProvider;
  label: string;
  tag: string;
  models: readonly string[];
};

export const PROVIDERS: readonly ProviderConfig[] = [
  {
    id: "anthropic",
    label: "Anthropic",
    tag: "Claude",
    models: ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5"],
  },
  {
    id: "openai",
    label: "OpenAI",
    tag: "GPT",
    models: ["gpt-5.5", "gpt-5-mini", "gpt-5-4"],
  },
  {
    id: "google",
    label: "Google",
    tag: "Gemini",
    models: [
      "gemini-3-flash-preview",
      "gemini-3.5-flash",
      "gemini-3.1-pro-preview",
      "gemini-2.5-pro",
      "gemini-2.5-flash",
    ],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    tag: "Multi",
    models: [
      "z-ai/glm-5.2",
      "moonshotai/kimi-k2.7-code",
      "qwen/qwen3.7-plus",
      "deepseek/deepseek-v4-pro",
      "nvidia/nemotron-3-ultra-550b-a55b:free",
      "openrouter/owl-alpha"
    ],
  },
] as const;

export function getProviderConfig(id: LlmProvider) {
  return PROVIDERS.find((p) => p.id === id);
}
