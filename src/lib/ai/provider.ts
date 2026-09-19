import { claudeClient } from "./claude-client";
import { deepseekClient } from "./deepseek-client";
import type { AIClient, ProviderName } from "./types";

/**
 * Which model judges a contribution.
 *
 * AI_PROVIDER selects it; leaving it unset keeps Claude, which is what the
 * app has always used. The alternative is added beside it, never in place of
 * it, so the two can be compared on the same submission.
 */

export function configuredAIProvider(): ProviderName {
  const raw = (process.env.AI_PROVIDER ?? "claude").trim().toLowerCase();
  return raw === "deepseek" ? "deepseek" : "claude";
}

export function getAIClient(): AIClient {
  return configuredAIProvider() === "deepseek" ? deepseekClient : claudeClient;
}

/** The env var whose absence turns the selected provider off. */
export function providerKeyName(name: ProviderName): string {
  return name === "deepseek" ? "DEEPSEEK_API_KEY" : "ANTHROPIC_API_KEY";
}

export type { AIClient, ProviderName } from "./types";
