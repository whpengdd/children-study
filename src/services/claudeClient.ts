// src/services/claudeClient.ts
//
// Frontend AI client. Calls the backend /api/ai/generate endpoint which
// holds the API key server-side. No API keys are stored in the browser.

/** Thrown when the backend is unreachable or returns an error. */
export class AiGenerateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiGenerateError";
  }
}

/** Thrown when the response isn't valid JSON. */
export class ClaudeJsonParseError extends Error {
  constructor(public readonly rawText: string, cause?: unknown) {
    super("AI response was not valid JSON");
    this.name = "ClaudeJsonParseError";
    if (cause !== undefined) {
      (this as { cause?: unknown }).cause = cause;
    }
  }
}

// Keep these for backward compat — showService catches them.
export class NoApiKeyError extends AiGenerateError {
  constructor() {
    super("AI not available");
    this.name = "NoApiKeyError";
  }
}
export class ClaudeTimeoutError extends AiGenerateError {
  constructor() {
    super("AI request timed out");
    this.name = "ClaudeTimeoutError";
  }
}

// These are no longer needed but kept so showService import doesn't break.
export async function getApiKey(): Promise<string | undefined> {
  return "backend";
}

// ---------------------------------------------------------------------------
// JSON extraction helpers
// ---------------------------------------------------------------------------

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fence = /^```[a-zA-Z]*\n([\s\S]*?)\n```$/;
  const m = trimmed.match(fence);
  if (m) return m[1]!.trim();
  return trimmed;
}

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
    if (escape) { escape = false; continue; }
    if (c === "\\" && inString) { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === opener) depth++;
    else if (c === closer) {
      depth--;
      if (depth === 0) return text.slice(openIdx, i + 1);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main API
// ---------------------------------------------------------------------------

export interface GenerateJsonOptions {
  profileId?: number;
  model?: string;
  timeoutMs?: number;
  schemaHint?: string;
  maxTokens?: number;
}

/**
 * Call the backend AI endpoint and parse the result as JSON.
 */
export async function generateJson<T>(
  prompt: string,
  opts: GenerateJsonOptions = {},
): Promise<T> {
  const systemPrompt = [
    "You are a JSON generator.",
    "Respond with VALID JSON ONLY — no prose, no markdown, no code fences.",
    opts.schemaHint ? `Schema: ${opts.schemaHint}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const timeoutMs = opts.timeoutMs ?? 15_000;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  let responseText: string;
  try {
    const resp = await fetch("/api/ai/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system: systemPrompt,
        prompt,
        maxTokens: opts.maxTokens ?? 1500,
      }),
      signal: ac.signal,
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      throw new AiGenerateError(`Backend returned ${resp.status}: ${body}`);
    }

    const json = await resp.json();
    responseText = (json.text ?? "").trim();
    if (!responseText) {
      throw new AiGenerateError("Backend returned empty text");
    }
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") {
      throw new ClaudeTimeoutError();
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  // Parse JSON with fallbacks
  try { return JSON.parse(responseText) as T; } catch { /* */ }
  const defenced = stripCodeFences(responseText);
  try { return JSON.parse(defenced) as T; } catch { /* */ }
  const slice = extractFirstJson(defenced);
  if (slice) {
    try { return JSON.parse(slice) as T; } catch (err) {
      throw new ClaudeJsonParseError(responseText, err);
    }
  }
  throw new ClaudeJsonParseError(responseText);
}
