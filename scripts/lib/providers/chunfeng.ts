// scripts/lib/providers/chunfeng.ts
//
// "chunfeng" provider — talks to an OpenAI-compatible proxy at
// https://chunfeng.mentalout.top/v1 using the Responses API (not Chat
// Completions). We use the official `openai` JS SDK with a custom base URL.
//
// Env vars:
//   OPENAI_API_KEY            — required, bearer token for the proxy
//   CHUNFENG_MODEL            — override model (default: "gpt-5.1-codex-mini")
//   CHUNFENG_REASONING_EFFORT — override reasoning effort (default: "low")

import OpenAI from "openai";

import type { AiProvider } from "../ai-provider.js";

const BASE_URL = "https://chunfeng.mentalout.top/v1";
const DEFAULT_MODEL = "gpt-5.1-codex-mini";
const DEFAULT_EFFORT = "low";
const MAX_OUTPUT_TOKENS = 8192;

/**
 * Best-effort extraction of text from a Responses API result. `output_text`
 * is the SDK convenience; if that isn't populated (e.g. custom proxy),
 * walk `output[]` and concatenate the text parts of any `message` items.
 */
function extractText(resp: any): string {
  if (typeof resp?.output_text === "string" && resp.output_text.length > 0) {
    return resp.output_text;
  }

  const output = resp?.output;
  if (!Array.isArray(output)) return "";

  const parts: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    if (item.type !== "message") continue;
    const content = item.content;
    if (!Array.isArray(content)) continue;
    for (const chunk of content) {
      if (!chunk || typeof chunk !== "object") continue;
      if (chunk.type === "output_text" && typeof chunk.text === "string") {
        parts.push(chunk.text);
      }
    }
  }
  return parts.join("\n");
}

export class ChunfengProvider implements AiProvider {
  readonly name = "chunfeng";

  private client: OpenAI | null;
  private readonly model: string;
  private readonly effort: string;
  private warnedMissingKey = false;

  constructor() {
    this.model = process.env.CHUNFENG_MODEL?.trim() || DEFAULT_MODEL;
    this.effort =
      process.env.CHUNFENG_REASONING_EFFORT?.trim() || DEFAULT_EFFORT;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      this.client = null;
    } else {
      try {
        this.client = new OpenAI({ apiKey, baseURL: BASE_URL });
      } catch (err) {
        console.warn(
          `[gen] chunfeng provider: failed to initialise OpenAI SDK: ${
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
          "[gen] chunfeng provider: OPENAI_API_KEY unset or SDK unavailable — skipping AI calls"
        );
        this.warnedMissingKey = true;
      }
      return null;
    }

    try {
      // `effort` is typed as a union of standard values in the SDK but the
      // chunfeng proxy additionally accepts "xhigh"; cast through `any` to
      // keep the type-check honest while still passing it along verbatim.
      const resp = await this.client.responses.create({
        model: this.model,
        instructions: system,
        input: user,
        reasoning: { effort: this.effort as any },
        store: false,
        max_output_tokens: MAX_OUTPUT_TOKENS,
      });

      const text = extractText(resp);
      if (!text) {
        console.warn(
          `[gen] ${wordId} chunfeng error: empty response (no output_text)`
        );
        return null;
      }
      return text;
    } catch (err) {
      console.warn(
        `[gen] ${wordId} chunfeng error: ${(err as Error).message}`
      );
      return null;
    }
  }
}
