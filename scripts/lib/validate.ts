// scripts/lib/validate.ts
//
// Runtime validator for `Scenario[]` output from Claude. Hand-written so we
// don't pull in zod/ajv. Returns `{ ok: true }` or `{ ok: false, error }`.

import type { Scenario } from "../../src/types/vocab.js";

type Result = { ok: true; value: Scenario[] } | { ok: false; error: string };

export interface Tier1OverrideItem {
  text: string;
  cn: string;
}
export interface Tier1Override {
  idx0?: Tier1OverrideItem;
  idx2?: Tier1OverrideItem;
}
export interface GeneratedResult {
  scenarios: Scenario[];
  tier1Override?: Tier1Override;
}

type GeneratedResultValidation =
  | { ok: true; value: GeneratedResult }
  | { ok: false; error: string };

function isString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}
function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

export function validateScenario(raw: any, idx: number): string | null {
  if (!raw || typeof raw !== "object") return `[${idx}] not an object`;
  const tier = raw.tier;
  const kind = raw.kind;
  if (![1, 2, 3, 4].includes(tier)) return `[${idx}] bad tier ${tier}`;
  if (typeof kind !== "string") return `[${idx}] missing kind`;

  switch (kind) {
    case "sentence":
      if (tier !== 1) return `[${idx}] sentence must be tier 1`;
      if (!isString(raw.text)) return `[${idx}] sentence.text missing`;
      if (!isString(raw.cn)) return `[${idx}] sentence.cn missing`;
      if (raw.source !== "dict" && raw.source !== "ai")
        return `[${idx}] sentence.source must be 'dict' or 'ai'`;
      return null;
    case "dialog":
      if (tier !== 1) return `[${idx}] dialog must be tier 1`;
      if (!Array.isArray(raw.turns) || raw.turns.length < 2)
        return `[${idx}] dialog.turns must have >=2 turns`;
      for (let i = 0; i < raw.turns.length; i++) {
        const t = raw.turns[i];
        if (t.speaker !== "A" && t.speaker !== "B")
          return `[${idx}] dialog.turns[${i}] bad speaker`;
        if (!isString(t.text) || !isString(t.cn))
          return `[${idx}] dialog.turns[${i}] missing text/cn`;
      }
      return null;
    case "image":
      if (tier !== 1) return `[${idx}] image must be tier 1`;
      if (!isString(raw.emoji)) return `[${idx}] image.emoji missing`;
      if (!isString(raw.caption)) return `[${idx}] image.caption missing`;
      if (!isString(raw.cn)) return `[${idx}] image.cn missing`;
      return null;
    case "chant":
      if (tier !== 1) return `[${idx}] chant must be tier 1`;
      if (!isStringArray(raw.lines) || raw.lines.length < 2)
        return `[${idx}] chant.lines must be >=2 strings`;
      if (!isString(raw.cn)) return `[${idx}] chant.cn missing`;
      return null;
    case "listen_choose":
      if (tier !== 2) return `[${idx}] listen_choose must be tier 2`;
      if (!isString(raw.audioWord))
        return `[${idx}] listen_choose.audioWord missing`;
      if (!isStringArray(raw.options) || raw.options.length < 2)
        return `[${idx}] listen_choose.options missing`;
      if (!isString(raw.answer) || !raw.options.includes(raw.answer))
        return `[${idx}] listen_choose.answer must be in options`;
      return null;
    case "en_to_cn_mcq":
      if (tier !== 2) return `[${idx}] en_to_cn_mcq must be tier 2`;
      if (!isString(raw.prompt))
        return `[${idx}] en_to_cn_mcq.prompt missing`;
      if (!isStringArray(raw.options) || raw.options.length < 2)
        return `[${idx}] en_to_cn_mcq.options missing`;
      if (!isString(raw.answer) || !raw.options.includes(raw.answer))
        return `[${idx}] en_to_cn_mcq.answer must be in options`;
      return null;
    case "cn_to_en_mcq":
      if (tier !== 3) return `[${idx}] cn_to_en_mcq must be tier 3`;
      if (!isString(raw.promptCn))
        return `[${idx}] cn_to_en_mcq.promptCn missing`;
      if (!isStringArray(raw.options) || raw.options.length < 2)
        return `[${idx}] cn_to_en_mcq.options missing`;
      if (!isString(raw.answer) || !raw.options.includes(raw.answer))
        return `[${idx}] cn_to_en_mcq.answer must be in options`;
      return null;
    case "fill_blank_choose":
      if (tier !== 3) return `[${idx}] fill_blank_choose must be tier 3`;
      if (!isString(raw.sentenceWithBlank))
        return `[${idx}] fill_blank_choose.sentenceWithBlank missing`;
      if (!isString(raw.cn)) return `[${idx}] fill_blank_choose.cn missing`;
      if (!isStringArray(raw.options) || raw.options.length < 2)
        return `[${idx}] fill_blank_choose.options missing`;
      if (!isString(raw.answer) || !raw.options.includes(raw.answer))
        return `[${idx}] fill_blank_choose.answer must be in options`;
      return null;
    case "word_formation":
      if (tier !== 3) return `[${idx}] word_formation must be tier 3`;
      if (!isString(raw.root))
        return `[${idx}] word_formation.root missing`;
      if (!isString(raw.prompt))
        return `[${idx}] word_formation.prompt missing`;
      if (!isString(raw.answer))
        return `[${idx}] word_formation.answer missing`;
      return null;
    case "spell_from_audio":
      if (tier !== 4) return `[${idx}] spell_from_audio must be tier 4`;
      if (!isString(raw.audioWord))
        return `[${idx}] spell_from_audio.audioWord missing`;
      if (!isString(raw.answer))
        return `[${idx}] spell_from_audio.answer missing`;
      return null;
    case "spell_from_cn":
      if (tier !== 4) return `[${idx}] spell_from_cn must be tier 4`;
      if (!isString(raw.promptCn))
        return `[${idx}] spell_from_cn.promptCn missing`;
      if (!isString(raw.answer))
        return `[${idx}] spell_from_cn.answer missing`;
      return null;
    default:
      return `[${idx}] unknown kind: ${kind}`;
  }
}

export function validateScenarioArray(raw: unknown): Result {
  if (!Array.isArray(raw)) return { ok: false, error: "not an array" };
  for (let i = 0; i < raw.length; i++) {
    const err = validateScenario(raw[i], i);
    if (err) return { ok: false, error: err };
  }
  return { ok: true, value: raw as Scenario[] };
}

function isTier1OverrideItem(v: unknown): v is Tier1OverrideItem {
  if (!v || typeof v !== "object") return false;
  const o = v as { text?: unknown; cn?: unknown };
  return (
    typeof o.text === "string" &&
    o.text.length > 0 &&
    typeof o.cn === "string" &&
    o.cn.length > 0
  );
}

/**
 * Validate the v2 prompt response shape:
 *   { scenarios: Scenario[7], tier1Override?: { idx0?, idx2? } }
 *
 * Also accepts a bare Scenario[] for backward compat with v1-cached payloads —
 * those get wrapped into { scenarios } with no override.
 */
export function validateGeneratedResult(raw: unknown): GeneratedResultValidation {
  // Legacy v1 cache: bare array.
  if (Array.isArray(raw)) {
    const arr = validateScenarioArray(raw);
    if (!arr.ok) return { ok: false, error: `scenarios: ${arr.error}` };
    return { ok: true, value: { scenarios: arr.value } };
  }

  if (!raw || typeof raw !== "object")
    return { ok: false, error: "not an object or array" };

  const r = raw as { scenarios?: unknown; tier1Override?: unknown };
  if (!Array.isArray(r.scenarios))
    return { ok: false, error: "scenarios field missing or not an array" };

  const arr = validateScenarioArray(r.scenarios);
  if (!arr.ok) return { ok: false, error: `scenarios: ${arr.error}` };

  const result: GeneratedResult = { scenarios: arr.value };

  if (r.tier1Override != null) {
    if (typeof r.tier1Override !== "object")
      return { ok: false, error: "tier1Override is not an object" };
    const ov = r.tier1Override as { idx0?: unknown; idx2?: unknown };
    const parsed: Tier1Override = {};
    if (ov.idx0 !== undefined) {
      if (!isTier1OverrideItem(ov.idx0))
        return { ok: false, error: "tier1Override.idx0 invalid" };
      parsed.idx0 = ov.idx0;
    }
    if (ov.idx2 !== undefined) {
      if (!isTier1OverrideItem(ov.idx2))
        return { ok: false, error: "tier1Override.idx2 invalid" };
      parsed.idx2 = ov.idx2;
    }
    if (parsed.idx0 || parsed.idx2) result.tier1Override = parsed;
  }

  return { ok: true, value: result };
}
