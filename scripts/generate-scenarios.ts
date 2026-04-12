// scripts/generate-scenarios.ts
//
// Stage B: for every word in the merged catalog, fill positions 3..9 of
// `scenarios` with AI-generated content, and OPTIONALLY replace Tier 1
// sentences at positions 0 and 2 when the dict-sourced example was too
// complex for the word's target age group (see scenario-prompt.ts v2).
//
// The AI call itself is delegated to a pluggable `AiProvider` so we can
// switch between Anthropic Claude ("claude") and the OpenAI-compatible
// chunfeng proxy ("chunfeng"). See scripts/lib/ai-provider.ts.

import * as path from "node:path";
import {
  readJsonCache,
  sha1,
  writeJsonCache,
} from "./lib/cache.js";
import {
  buildPrompt,
  PROMPT_VERSION,
} from "./lib/scenario-prompt.js";
import {
  validateGeneratedResult,
  type GeneratedResult,
} from "./lib/validate.js";
import { resolveProvider, type AiProvider } from "./lib/ai-provider.js";
import type { Scenario, Word } from "../src/types/vocab.js";

const CACHE_DIR = path.resolve(process.cwd(), ".cache/scenarios");

export interface EnrichOptions {
  noAi?: boolean;
  limit?: number;
}

/**
 * SHA1 cache key. IMPORTANT: includes `providerName` so that switching
 * providers (e.g. claude → chunfeng) re-generates from scratch rather than
 * silently reusing a different model's cached output.
 */
function cacheKey(word: Word, providerName: string): string {
  const fp = sha1(
    [
      word.id,
      word.headWord,
      word.pos ?? "",
      JSON.stringify(word.tags),
      PROMPT_VERSION,
      providerName,
    ].join("|")
  );
  return fp;
}

/**
 * Call the configured provider for one word, slice the first `{..}` JSON
 * object out of the response, and validate it against the v2 schema.
 * Returns `null` on any failure (missing key, network error, bad JSON,
 * validation failure, wrong scenario count) — caller falls back to
 * placeholder scenarios.
 */
async function callProviderForWord(
  provider: AiProvider,
  word: Word
): Promise<GeneratedResult | null> {
  const { system, user } = buildPrompt(word);
  const text = await provider.generate(system, user, word.id);
  if (!text) return null;

  // v2 returns an object; slice from first `{` to last `}`.
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd < 0) {
    console.warn(`[gen] ${word.id} no JSON object found in response`);
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
  } catch (err) {
    console.warn(
      `[gen] ${word.id} JSON parse failed: ${(err as Error).message}`
    );
    return null;
  }

  const check = validateGeneratedResult(parsed);
  if (!check.ok) {
    console.warn(
      `[gen] ${word.id} validation failed: ${check.error} — using placeholder`
    );
    return null;
  }
  if (check.value.scenarios.length !== 7) {
    console.warn(
      `[gen] ${word.id} returned ${check.value.scenarios.length} scenarios (need 7) — using placeholder`
    );
    return null;
  }
  return check.value;
}

/**
 * Apply a `tier1Override` from the model to the existing Tier 1 placeholder
 * sentences. Only rewrites slots whose kind is "sentence"; image/chant slots
 * are left untouched (the prompt instructs the model not to override those).
 */
function applyTier1Override(
  tier1: Scenario[],
  override: GeneratedResult["tier1Override"]
): Scenario[] {
  if (!override) return tier1;
  const next = [...tier1];
  if (override.idx0 && next[0]?.kind === "sentence") {
    next[0] = {
      ...next[0],
      text: override.idx0.text,
      cn: override.idx0.cn,
      source: "ai",
    };
  }
  if (override.idx2 && next[2]?.kind === "sentence") {
    next[2] = {
      ...next[2],
      text: override.idx2.text,
      cn: override.idx2.cn,
      source: "ai",
    };
  }
  return next;
}

/**
 * Return the env var name that MUST be set for a given provider. Used to
 * emit a clear warning and fall back to placeholders when the user has
 * selected a provider but not supplied its key.
 */
function requiredEnvKeyFor(providerName: string): string {
  switch (providerName) {
    case "claude":
      return "ANTHROPIC_API_KEY";
    case "chunfeng":
      return "OPENAI_API_KEY";
    default:
      // resolveProvider() already rejects unknowns, but keep this safe.
      return "";
  }
}

/**
 * Given the merged `Word[]` (with placeholder scenarios from merge stage),
 * replace positions 3..9 with AI-generated content when available, and
 * optionally rewrite Tier 1 sentences via `tier1Override` when the dict
 * example was too complex.
 * When --no-ai is set, we simply leave the placeholder scenarios in place.
 */
export async function enrichWithScenarios(
  words: Word[],
  opts: EnrichOptions = {}
): Promise<Word[]> {
  const enriched: Word[] = [];
  const targetWords = opts.limit ? words.slice(0, opts.limit) : words;

  if (opts.noAi) {
    console.log(
      `[gen] --no-ai mode: keeping placeholder Tier 2-4 scenarios for ${targetWords.length} words`
    );
    return targetWords;
  }

  const provider = resolveProvider();
  console.log(`[gen] provider=${provider.name}`);

  const requiredKey = requiredEnvKeyFor(provider.name);
  if (requiredKey && !process.env[requiredKey]) {
    console.warn(
      `[gen] ${requiredKey} unset — falling back to placeholder scenarios`
    );
    return targetWords;
  }

  let done = 0;
  let cacheHit = 0;
  let newGen = 0;
  let failed = 0;
  let tier1Rewritten = 0;

  for (const word of targetWords) {
    const key = cacheKey(word, provider.name);
    const cachePath = path.join(CACHE_DIR, `${key}.json`);
    let result: GeneratedResult | null = null;

    const cached = await readJsonCache<unknown>(cachePath);
    if (cached) {
      const check = validateGeneratedResult(cached);
      if (check.ok && check.value.scenarios.length === 7) {
        result = check.value;
        cacheHit++;
      }
    }

    if (!result) {
      result = await callProviderForWord(provider, word);
      if (result) {
        await writeJsonCache(cachePath, result);
        newGen++;
      } else {
        failed++;
      }
    }

    if (result) {
      const tier1 = applyTier1Override(
        word.scenarios.slice(0, 3),
        result.tier1Override
      );
      if (result.tier1Override) tier1Rewritten++;
      enriched.push({
        ...word,
        scenarios: [...tier1, ...result.scenarios],
      });
    } else {
      // Keep placeholder Tier 2-4 that merge.ts put in place.
      enriched.push(word);
    }

    done++;
    if (done % 50 === 0)
      console.log(
        `[gen] progress ${done}/${targetWords.length} cache=${cacheHit} new=${newGen} tier1Rewrite=${tier1Rewritten} failed=${failed}`
      );
  }

  console.log(
    `[gen] done — total=${done} cacheHit=${cacheHit} new=${newGen} tier1Rewrite=${tier1Rewritten} failed=${failed}`
  );
  return enriched;
}
