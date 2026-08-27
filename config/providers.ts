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
    models: ["claude-fable-5", "claude-opus-5", "claude-sonnet-5","claude-sonnet-4-6"],
  },
  {
    id: "openai",
    label: "OpenAI",
    tag: "GPT",
    models: ["gpt-5.6-sol", "gpt-5.6-terra","gpt-5.6-luna", "gpt-5.5", "gpt-5-mini", "gpt-5-4"],
  },
  {
    id: "google",
    label: "Google",
    tag: "Gemini",
    models: [
      "gemini-3.7-flash",
      "gemini-3.5-flash",
      "gemini-3-flash-preview",
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
      "moonshotai/kimi-k3",
      "moonshotai/kimi-k2.7-code",
      "z-ai/glm-5.3-flash",
      "z-ai/glm-5.2",
      "qwen/qwen3.8-max",
      "deepseek/deepseek-v4-pro-0813",
      "deepseek/deepseek-v4-flash-0731",
      // FREE OPENROUTER MODELS
      "z-ai/glm-5.2:free",
      "nvidia/nemotron-3-ultra-550b-a55b:free",
      "google/gemma-4-31b-it:free"
    ],
  },
] as const;

export function getProviderConfig(id: LlmProvider) {
  return PROVIDERS.find((p) => p.id === id);
}
