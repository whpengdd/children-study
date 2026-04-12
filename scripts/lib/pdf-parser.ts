// scripts/lib/pdf-parser.ts
//
// Extract `{ headWord, pos }[]` from Cambridge KET / PET vocabulary list PDFs.
//
// Strategy:
// 1) pdf-parse extracts raw text from every page.
// 2) We run a hand-rolled regex / line classifier tuned for the Cambridge PDF
//    layout (columns of "headword (pos) gloss/example").
// 3) If we recover < minExpected entries, we fall back to asking Claude to
//    convert the raw text into JSON. Result is cached to .cache/pdf-ai/<sha1>.json
//    keyed on the sha1 of the raw text + prompt version.
//
// The Claude fallback is best-effort — if ANTHROPIC_API_KEY is unset or the
// request fails, we just return what pdf-parse managed to parse.

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import {
  readFileBuffer,
  readJsonCache,
  sha1,
  writeJsonCache,
} from "./cache.js";

// Use createRequire so we bypass pdf-parse's "import index.js runs test file"
// behavior and go straight to the pure library.
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParseCjs: (buf: Buffer) => Promise<{ text: string; numpages: number }> =
  require("pdf-parse/lib/pdf-parse.js");

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CACHE_DIR = join(__dirname, "../../.cache/pdf-ai");

export interface PdfEntry {
  headWord: string;
  pos?: string;
}

/**
 * Normalize POS tokens (e.g. "n", "noun") into "n.", "v.", ...
 * Shared with pep.ts but redeclared locally to keep sources independent.
 */
function normalizePos(raw: string): string {
  const s = raw.trim().toLowerCase().replace(/\./g, "");
  const map: Record<string, string> = {
    n: "n.",
    noun: "n.",
    v: "v.",
    verb: "v.",
    vt: "v.",
    vi: "v.",
    adj: "adj.",
    adjective: "adj.",
    adv: "adv.",
    adverb: "adv.",
    prep: "prep.",
    preposition: "prep.",
    pron: "pron.",
    pronoun: "pron.",
    conj: "conj.",
    conjunction: "conj.",
    interj: "interj.",
    interjection: "interj.",
    num: "num.",
    art: "art.",
    det: "det.",
    phr: "phr.",
    phrv: "phr.v.",
    "phr v": "phr.v.",
    exclam: "exclam.",
    exclamation: "exclam.",
    modal: "modal",
  };
  return map[s] ?? (s ? `${s}.` : "");
}

/**
 * Heuristic line-by-line parser for Cambridge KET / PET vocabulary list PDFs.
 *
 * Typical input text fragments (after pdf-parse extraction):
 *
 *   "able (adj)"
 *   "about (prep, adv)"
 *   "above (adv, prep)"
 *   "absolutely (adv)"
 *
 * We walk character-by-character looking for "(...)" groups and treat the
 * word(s) immediately to the LEFT as the headword. Deliberately NO complex
 * regex — the previous nested-quantifier version hit catastrophic backtracking
 * on Cambridge's own word-list PDFs.
 */
function regexExtract(rawText: string): PdfEntry[] {
  const seen = new Set<string>();
  const out: PdfEntry[] = [];

  const stopWords = new Set([
    "page",
    "cambridge",
    "english",
    "vocabulary",
    "list",
    "preliminary",
    "key",
    "introduction",
    "note",
    "notes",
    "example",
    "examples",
    "level",
    "schools",
    "contents",
    "following",
    "important",
    "see",
    "also",
    "etc",
    "ket",
    "pet",
    "the",
    "a",
    "an",
    "to",
    "of",
    "in",
    "on",
    "at",
    "with",
    "for",
    "and",
    "or",
    "but",
    "that",
    "this",
  ]);

  // Which POS tokens we accept inside (...).
  const acceptedPos = new Set([
    "n",
    "noun",
    "v",
    "verb",
    "vt",
    "vi",
    "adj",
    "adjective",
    "adv",
    "adverb",
    "prep",
    "preposition",
    "pron",
    "pronoun",
    "conj",
    "conjunction",
    "interj",
    "interjection",
    "num",
    "det",
    "art",
    "phr",
    "exclam",
    "exclamation",
    "modal",
  ]);

  // Helper: extract the first POS-like token from the inside of a (...) group.
  function parseInside(inside: string): string | undefined {
    // Accept "n", "n.", "n, v", "n/adj", "phr v", etc.
    // Split on commas, slashes, pipes, semicolons.
    const tokens = inside
      .toLowerCase()
      .replace(/\./g, "")
      .split(/[,/|;&]/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (tokens.length === 0) return undefined;
    // Special case: "phr v" → "phr.v."
    const first = tokens[0];
    const words = first.split(/\s+/).filter(Boolean);
    if (words.length === 2 && words[0] === "phr" && words[1] === "v") {
      return "phr.v.";
    }
    const head = words[0];
    if (!head) return undefined;
    if (!acceptedPos.has(head)) return undefined;
    return normalizePos(head);
  }

  // Helper: extract the rightmost 1–3 lowercase word sequence ending at `end`.
  // We only accept lowercase letters, ', and - inside a token.
  function wordsBefore(s: string, end: number): string | null {
    let i = end - 1;
    // Skip trailing whitespace.
    while (i >= 0 && /\s/.test(s[i]!)) i--;
    // Walk backwards, accumulate up to 3 tokens.
    const tokens: string[] = [];
    while (i >= 0 && tokens.length < 3) {
      // Collect a token (letters, ', -)
      let tEnd = i;
      while (i >= 0 && /[a-zA-Z'\-]/.test(s[i]!)) i--;
      const tStart = i + 1;
      if (tStart > tEnd) break;
      const tok = s.slice(tStart, tEnd + 1).toLowerCase();
      if (tok.length < 2 || tok.length > 25) break;
      // Reject tokens that aren't pure letters/dash/apostrophe.
      if (!/^[a-z][a-z'\-]*$/.test(tok)) break;
      tokens.unshift(tok);
      // Skip inter-token whitespace.
      if (i >= 0 && /\s/.test(s[i]!)) {
        // Only allow a single space between multi-word headword tokens.
        const savedI = i;
        while (i >= 0 && s[i] === " ") i--;
        // If we hit something that's not a letter, stop.
        if (i >= 0 && !/[a-zA-Z]/.test(s[i]!)) {
          break;
        }
        // Restore to continue from next token.
        i = savedI - 1;
        // Continue walking backwards now at i.
        while (i >= 0 && /\s/.test(s[i]!)) i--;
        continue;
      }
      break;
    }
    if (tokens.length === 0) return null;
    return tokens.join(" ");
  }

  // Walk the full text char-by-char, find each "(" and matching ")".
  const text = rawText;
  const n = text.length;
  let i = 0;
  while (i < n) {
    const ch = text[i]!;
    if (ch === "(") {
      // Find matching closing paren on same pseudo-line (no nesting).
      const close = text.indexOf(")", i + 1);
      if (close < 0) break;
      const inside = text.slice(i + 1, close);
      // Skip huge groups (definitely not POS).
      if (inside.length > 0 && inside.length <= 20 && !/[\n\r]/.test(inside)) {
        const pos = parseInside(inside);
        if (pos) {
          const headWord = wordsBefore(text, i);
          if (headWord && !stopWords.has(headWord)) {
            const key = `${headWord}|${pos}`;
            if (!seen.has(key)) {
              seen.add(key);
              out.push({ headWord, pos });
            }
          }
        }
      }
      i = close + 1;
    } else {
      i++;
    }
  }
  return out;
}

/**
 * Fallback: ask Claude to convert the raw PDF text into a JSON list.
 * Results are cached on disk keyed by sha1(raw text + prompt version).
 */
async function claudeFallbackExtract(rawText: string): Promise<PdfEntry[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn(
      "[pdf-parser] Claude fallback requested but ANTHROPIC_API_KEY is unset — skipping."
    );
    return [];
  }
  const promptVersion = "v1";
  const cacheKey = sha1(promptVersion + "\n" + rawText.slice(0, 200000));
  const cachePath = join(CACHE_DIR, `${cacheKey}.json`);
  const cached = await readJsonCache<PdfEntry[]>(cachePath);
  if (cached) {
    console.log(`[pdf-parser] Claude cache hit (${cacheKey.slice(0, 8)})`);
    return cached;
  }
  const anthropic = new Anthropic({ apiKey });
  const systemPrompt =
    "You are a vocabulary-list extractor. Given raw text from a Cambridge English vocabulary PDF, return ONLY a JSON array of objects {\"headWord\": string, \"pos\": string (one of 'n.'|'v.'|'adj.'|'adv.'|'prep.'|'pron.'|'conj.'|'interj.'|'num.'|'det.'|'art.'|'phr.'|'phr.v.'|'exclam.'|'modal')}. Do NOT include prose, markdown, or explanations.";
  try {
    const resp = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 64000,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Extract every vocabulary entry from this text:\n\n${rawText.slice(0, 100000)}`,
        },
      ],
    });
    const content = resp.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("\n");
    // Find the JSON array inside the response.
    const jsonStart = content.indexOf("[");
    const jsonEnd = content.lastIndexOf("]");
    if (jsonStart < 0 || jsonEnd < 0) return [];
    const parsed = JSON.parse(content.slice(jsonStart, jsonEnd + 1));
    const cleaned: PdfEntry[] = Array.isArray(parsed)
      ? parsed
          .map((p: any) => ({
            headWord: (p?.headWord ?? "").toString().trim().toLowerCase(),
            pos: p?.pos ? normalizePos(String(p.pos)) : undefined,
          }))
          .filter((p) => p.headWord.length >= 2)
      : [];
    await writeJsonCache(cachePath, cleaned);
    return cleaned;
  } catch (err) {
    console.error("[pdf-parser] Claude fallback failed:", (err as Error).message);
    return [];
  }
}

export interface ParsePdfOptions {
  /** If the regex parser recovers fewer than this, fall back to Claude. */
  minExpected?: number;
  /** Skip the Claude fallback even if the regex recovers few entries. */
  disableAiFallback?: boolean;
}

/**
 * Top-level PDF → PdfEntry[] parser. Logs counts as it goes.
 */
export async function parseVocabPdf(
  filePath: string,
  opts: ParsePdfOptions = {}
): Promise<PdfEntry[]> {
  const buf = await readFileBuffer(filePath);
  const parsed = await pdfParseCjs(buf);
  const rawText = parsed.text ?? "";
  console.log(
    `[pdf-parser] ${filePath} → ${parsed.numpages ?? "?"} pages, ${rawText.length} chars`
  );

  const regexHits = regexExtract(rawText);
  console.log(`[pdf-parser] regex extracted ${regexHits.length} entries`);

  const minExpected = opts.minExpected ?? 500;
  if (regexHits.length >= minExpected) return regexHits;

  if (opts.disableAiFallback) return regexHits;

  console.log(
    `[pdf-parser] regex recovered < ${minExpected} — trying Claude fallback`
  );
  const aiHits = await claudeFallbackExtract(rawText);
  if (aiHits.length > regexHits.length) {
    console.log(`[pdf-parser] Claude recovered ${aiHits.length} entries`);
    return aiHits;
  }
  return regexHits;
}

/** Convenience: expose the plain text for debugging. */
export async function extractPdfText(filePath: string): Promise<string> {
  const buf = await readFileBuffer(filePath);
  const parsed = await pdfParseCjs(buf);
  return parsed.text ?? "";
}
