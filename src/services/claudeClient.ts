// src/services/claudeClient.ts
//
// Browser-side wrapper around @anthropic-ai/sdk. Two jobs:
//   1. Grab the Anthropic API key out of Dexie (settings row) — we don't
//      trust the env because a parent pastes the key at runtime and we want
//      per-profile isolation.
//   2. Wrap a `generateJson` call that returns a parsed, validated JSON object
//      (with a 15 s timeout and markdown-fence cleanup fallback).
//
// showService is the only consumer right now. Never import this from a type
// file — it pulls in the SDK which is ~100 kB of JS.

import Anthropic from "@anthropic-ai/sdk";

import { db } from "../data/db";

/** `claude-sonnet-4-6` per the Wave 1 prompt. */
const DEFAULT_MODEL = "claude-sonnet-4-6";
const DEFAULT_TIMEOUT_MS = 15_000;

/** Thrown when we have no API key at all — showService catches and falls back. */
export class NoApiKeyError extends Error {
  constructor() {
    super("No Anthropic API key configured for this profile");
    this.name = "NoApiKeyError";
  }
}

/** Thrown when the model doesn't respond inside DEFAULT_TIMEOUT_MS. */
export class ClaudeTimeoutError extends Error {
  constructor() {
    super("Claude API request timed out");
    this.name = "ClaudeTimeoutError";
  }
}

/**
 * Thrown when Claude returns something that isn't valid JSON even after we
 * strip markdown fences.
 */
export class ClaudeJsonParseError extends Error {
  constructor(public readonly rawText: string, cause?: unknown) {
    super("Claude response was not valid JSON");
    this.name = "ClaudeJsonParseError";
    if (cause !== undefined) {
      (this as { cause?: unknown }).cause = cause;
    }
  }
}

/**
 * Fetch the active profile's API key from Dexie. Prefers the per-profile
 * setting, falls back to any profile with a configured key (so a shared pad
 * can have a "house" key on any profile). Returns undefined if none found.
 */
export async function getApiKey(profileId?: number): Promise<string | undefined> {
  if (profileId !== undefined) {
    const row = await db.settings.get(profileId);
    if (row?.anthropicApiKey) return row.anthropicApiKey;
  }
  // Fallback: scan all settings rows for any key. Cheap — expect <10 rows.
  const all = await db.settings.toArray();
  for (const row of all) {
    if (row.anthropicApiKey) return row.anthropicApiKey;
  }
  return undefined;
}

export interface GenerateJsonOptions {
  profileId?: number;
  /** Override the model id for eval/testing. */
  model?: string;
  /** Override the timeout in ms. */
  timeoutMs?: number;
  /** Short description of the desired shape, included in the prompt. */
  schemaHint?: string;
  /** Max tokens Claude may return; defaults to 1024. */
  maxTokens?: number;
}

/**
 * Strip markdown code fences (```json ... ``` or ``` ... ```) that Claude
 * sometimes wraps JSON in, even when told not to.
 */
function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  // Match ```lang\n ... \n``` — allow any lang tag or none.
  const fence = /^```[a-zA-Z]*\n([\s\S]*?)\n```$/;
  const m = trimmed.match(fence);
  if (m) return m[1]!.trim();
  return trimmed;
}

/**
 * Pull the first contiguous JSON object/array substring out of `text`. This is
 * the last-resort parser for when Claude sandwiches JSON between commentary.
 */
function extractFirstJson(text: string): string | null {
  const openIdx = text.search(/[{[]/);
  if (openIdx < 0) return null;
  const opener = text[openIdx]!;
  const closer = opener === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = openIdx; i < text.length; i++) {
    const c = text[i]!;
    if (escape) {
      escape = false;
      continue;
    }
    if (c === "\\" && inString) {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === opener) depth++;
    else if (c === closer) {
      depth--;
      if (depth === 0) return text.slice(openIdx, i + 1);
    }
  }
  return null;
}

/**
 * Issue a JSON-returning prompt to Claude and parse the result. Throws
 * `NoApiKeyError`, `ClaudeTimeoutError`, or `ClaudeJsonParseError` on failure
 * so showService can decide whether to fall back or bubble.
 */
export async function generateJson<T>(
  prompt: string,
  opts: GenerateJsonOptions = {},
): Promise<T> {
  const apiKey = await getApiKey(opts.profileId);
  if (!apiKey) throw new NoApiKeyError();

  const client = new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
  });

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  const systemPrompt = [
    "You are a JSON generator.",
    "Respond with VALID JSON ONLY — no prose, no markdown, no code fences.",
    opts.schemaHint ? `Schema: ${opts.schemaHint}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  let responseText: string;
  try {
    const response = await client.messages.create(
      {
        model: opts.model ?? DEFAULT_MODEL,
        max_tokens: opts.maxTokens ?? 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: prompt }],
      },
      { signal: ac.signal },
    );
    responseText = response.content
      .filter((block): block is { type: "text"; text: string } => block.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") {
      throw new ClaudeTimeoutError();
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  // Pass 1: straight parse.
  try {
    return JSON.parse(responseText) as T;
  } catch {
    /* fall through */
  }
  // Pass 2: strip code fences.
  const defenced = stripCodeFences(responseText);
  try {
    return JSON.parse(defenced) as T;
  } catch {
    /* fall through */
  }
  // Pass 3: extract first balanced {...} or [...] substring.
  const slice = extractFirstJson(defenced);
  if (slice) {
    try {
      return JSON.parse(slice) as T;
    } catch (err) {
      throw new ClaudeJsonParseError(responseText, err);
    }
  }
  throw new ClaudeJsonParseError(responseText);
}
