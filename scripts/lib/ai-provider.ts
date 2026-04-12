// scripts/lib/ai-provider.ts
//
// Provider abstraction for scenario generation. The pipeline reads the
// AI_PROVIDER env var and picks one of:
//   - "claude"   (Anthropic SDK, default)
//   - "chunfeng" (OpenAI-compatible Responses API proxy)
//
// Every provider returns the raw text of the model's response (or null on
// failure); the caller is responsible for JSON slicing and validation.

import { ClaudeProvider } from "./providers/claude.js";
import { ChunfengProvider } from "./providers/chunfeng.js";

export interface AiProvider {
  /** Stable name ("claude" | "chunfeng"). Mixed into the cache key. */
  name: string;
  /**
   * Invoke the underlying model with the given system + user prompt.
   * Returns the raw text response, or `null` if the call failed (missing
   * key, network error, SDK error, etc.). The caller decides what to do
   * with a null (typically fall back to the placeholder scenarios).
   */
  generate(system: string, user: string, wordId: string): Promise<string | null>;
}

/**
 * Resolve the provider from `AI_PROVIDER` env var. Defaults to "claude".
 * Throws with a clear message for unknown values so misconfiguration fails
 * loudly rather than silently falling back.
 */
export function resolveProvider(): AiProvider {
  const raw = (process.env.AI_PROVIDER ?? "claude").trim().toLowerCase();
  switch (raw) {
    case "claude":
      return new ClaudeProvider();
    case "chunfeng":
      return new ChunfengProvider();
    default:
      throw new Error(
        `Unknown AI_PROVIDER="${raw}". Expected "claude" or "chunfeng".`
      );
  }
}
