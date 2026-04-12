// scripts/lib/providers/claude.ts
//
// Anthropic Claude provider. Implements the `AiProvider` interface by
// calling the Messages API via the official `@anthropic-ai/sdk` package.
//
// Reads `ANTHROPIC_API_KEY`. If the key or SDK is missing, `generate`
// returns `null` and logs a warning — the caller is expected to fall back
// to placeholder scenarios.

import Anthropic from "@anthropic-ai/sdk";

import type { AiProvider } from "../ai-provider.js";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 4096;

export class ClaudeProvider implements AiProvider {
  readonly name = "claude";

  private client: Anthropic | null;
  private warnedMissingKey = false;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      this.client = null;
    } else {
      try {
        this.client = new Anthropic({ apiKey });
      } catch (err) {
        console.warn(
          `[gen] claude provider: failed to initialise SDK: ${
            (err as Error).message
          }`
        );
        this.client = null;
      }
    }
  }

  async generate(
    system: string,
    user: string,
    wordId: string
  ): Promise<string | null> {
    if (!this.client) {
      if (!this.warnedMissingKey) {
        console.warn(
          "[gen] claude provider: ANTHROPIC_API_KEY unset or SDK unavailable — skipping AI calls"
        );
        this.warnedMissingKey = true;
      }
      return null;
    }

    try {
      const resp = await this.client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system,
        messages: [{ role: "user", content: user }],
      });
      const text = resp.content
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
        .join("\n");
      return text;
    } catch (err) {
      console.warn(
        `[gen] ${wordId} claude error: ${(err as Error).message}`
      );
      return null;
    }
  }
}
