// src/screens/DevSandbox/DevSandboxScreen.tsx
//
// Dev-only storybook-style preview for every `Scenario` kind. Loads the
// catalog, finds the `apple` word (falling back to `words[0]` if missing), and
// cycles through all ten kinds via prev/next buttons. Each scenario is
// rendered through the real `ScenarioSlide` dispatcher so visual regressions
// surface immediately.
//
// The sandbox is intentionally tolerant of catalog churn: for any scenario
// kind the chosen word is missing, the sandbox substitutes a local synthetic
// fixture so the preview always exhibits all ten kinds.
//
// Mounted at `/dev/sandbox` in `src/router.tsx`. Not reachable from normal
// navigation.

import { useCallback, useEffect, useMemo, useState } from "react";

import type { Catalog, Scenario, Word } from "../../types";
import ScenarioSlide from "../Study/ScenarioSlide";

// Canonical display order across all ten scenario kinds, grouped by tier. The
// sandbox always shows exactly this sequence regardless of catalog contents.
const KIND_ORDER: Scenario["kind"][] = [
  "sentence",
  "image",
  "dialog",
  "chant",
  "listen_choose",
  "en_to_cn_mcq",
  "cn_to_en_mcq",
  "fill_blank_choose",
  "word_formation",
  "spell_from_audio",
  "spell_from_cn",
];

/**
 * Synthetic fallback for a specific kind, used when the catalog doesn't ship
 * one for the selected word. Kept verbose so it's obvious in-flight that a
 * preview is a mock rather than real data.
 */
function mockScenarioFor(kind: Scenario["kind"], headWord: string): Scenario {
  switch (kind) {
    case "sentence":
      return {
        tier: 1,
        kind: "sentence",
        text: `I like an ${headWord}.`,
        cn: "我喜欢一个苹果。",
        source: "ai",
      };
    case "image":
      return {
        tier: 1,
        kind: "image",
        emoji: "🍎",
        caption: `an ${headWord}`,
        cn: "一个苹果",
      };
    case "dialog":
      return {
        tier: 1,
        kind: "dialog",
        turns: [
          { speaker: "A", text: "What's this?",       cn: "这是什么？" },
          { speaker: "B", text: `It's an ${headWord}.`, cn: "这是一个苹果。" },
          { speaker: "A", text: "Can I have it?",     cn: "我可以吃吗？" },
          { speaker: "B", text: "Sure, here you go.", cn: "当然，给你。" },
        ],
      };
    case "chant":
      return {
        tier: 1,
        kind: "chant",
        lines: [
          `${headWord}, ${headWord}, red and round,`,
          "In the basket, on the ground.",
          "One, two, three — yum, yum, yum!",
          `${headWord}s, ${headWord}s, here I come!`,
        ],
        cn: "苹果，苹果，又红又圆。",
      };
    case "listen_choose":
      return {
        tier: 2,
        kind: "listen_choose",
        audioWord: headWord,
        options: [headWord, "banana", "orange", "grape"],
        answer: headWord,
      };
    case "en_to_cn_mcq":
      return {
        tier: 2,
        kind: "en_to_cn_mcq",
        prompt: headWord,
        options: ["苹果", "香蕉", "橘子", "葡萄"],
        answer: "苹果",
      };
    case "cn_to_en_mcq":
      return {
        tier: 3,
        kind: "cn_to_en_mcq",
        promptCn: "苹果",
        options: [headWord, "pear", "peach", "lemon"],
        answer: headWord,
      };
    case "fill_blank_choose":
      return {
        tier: 3,
        kind: "fill_blank_choose",
        sentenceWithBlank: "She is eating an ____.",
        cn: "她正在吃一个苹果。",
        options: [headWord, "egg", "ant", "arm"],
        answer: headWord,
      };
    case "word_formation":
      return {
        tier: 3,
        kind: "word_formation",
        root: headWord,
        prompt: "Make it plural (复数形式).",
        answer: `${headWord}s`,
      };
    case "spell_from_audio":
      return {
        tier: 4,
        kind: "spell_from_audio",
        audioWord: headWord,
        answer: headWord,
      };
    case "spell_from_cn":
      return {
        tier: 4,
        kind: "spell_from_cn",
        promptCn: "苹果",
        answer: headWord,
      };
  }
}

/**
 * For each canonical kind, return the first scenario in `word.scenarios`
 * matching that kind, or a synthetic fallback if the word doesn't ship one.
 */
function buildPreviewDeck(word: Word): { scenario: Scenario; isMock: boolean }[] {
  const byKind = new Map<Scenario["kind"], Scenario>();
  for (const s of word.scenarios) {
    if (!byKind.has(s.kind)) byKind.set(s.kind, s);
  }
  return KIND_ORDER.map((kind) => {
    const real = byKind.get(kind);
    if (real) return { scenario: real, isMock: false };
    return { scenario: mockScenarioFor(kind, word.headWord), isMock: true };
  });
}

function pickApple(catalog: Catalog): Word | null {
  const byId = catalog.words.find((w) => w.id === "w-apple-n");
  if (byId) return byId;
  const byHead = catalog.words.find((w) => w.headWord === "apple");
  if (byHead) return byHead;
  return catalog.words[0] ?? null;
}

export default function DevSandboxScreen() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/data/catalog.json")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: Catalog) => {
        if (cancelled) return;
        setCatalog(data);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const word = useMemo<Word | null>(
    () => (catalog ? pickApple(catalog) : null),
    [catalog],
  );

  const deck = useMemo(() => (word ? buildPreviewDeck(word) : []), [word]);

  const total = deck.length;
  const currentEntry = deck[index];
  const current = currentEntry?.scenario;

  const prev = useCallback(() => {
    setIndex((i) => (i - 1 + total) % Math.max(1, total));
  }, [total]);
  const next = useCallback(() => {
    setIndex((i) => (i + 1) % Math.max(1, total));
  }, [total]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev]);

  const handleSubmit = useCallback(
    (correct: boolean, latencyMs: number) => {
      // eslint-disable-next-line no-console
      console.log("[sandbox] onSubmit", {
        kind: current?.kind,
        correct,
        latencyMs,
      });
    },
    [current],
  );
  const handleExposure = useCallback(() => {
    // eslint-disable-next-line no-console
    console.log("[sandbox] onExposureDone", { kind: current?.kind });
  }, [current]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-8 text-rose-600">
        Failed to load catalog: {error}
      </div>
    );
  }

  if (!word || !current || !currentEntry) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-8 text-slate-500">
        Loading catalog…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-indigo-100 px-3 py-1 text-sm font-semibold text-indigo-700">
            DevSandbox
          </span>
          <span className="text-sm text-slate-500">
            Cycle all {KIND_ORDER.length} scenario kinds for a single word
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <span className="font-mono">{word.id}</span>
          <span className="opacity-40">·</span>
          <span>
            {index + 1} / {total}
          </span>
          <span className="opacity-40">·</span>
          <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700">
            tier {current.tier}
          </span>
          <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700">
            {current.kind}
          </span>
          {currentEntry.isMock && (
            <span className="rounded bg-amber-100 px-2 py-0.5 font-mono text-xs text-amber-700">
              mock
            </span>
          )}
        </div>
      </header>

      <main className="relative flex flex-1 items-center justify-center overflow-hidden">
        {/* Key-forced remount so each slide gets its enter animation fresh. */}
        <div key={`${index}-${current.kind}`} className="h-full w-full">
          <ScenarioSlide
            scenario={current}
            word={word}
            onSubmit={handleSubmit}
            onExposureDone={handleExposure}
            disabled={false}
          />
        </div>
      </main>

      <footer className="flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-6 py-4">
        <button
          type="button"
          onClick={prev}
          className="min-h-12 rounded-xl bg-slate-200 px-5 py-2 text-base font-semibold text-slate-700 transition hover:bg-slate-300 active:scale-95"
        >
          ← Prev
        </button>
        <div className="flex flex-wrap gap-1">
          {deck.map((entry, i) => (
            <button
              key={`${entry.scenario.kind}-${i}`}
              type="button"
              onClick={() => setIndex(i)}
              className={`min-h-8 rounded-lg px-2 py-1 font-mono text-xs transition ${
                i === index
                  ? "bg-indigo-500 text-white"
                  : entry.isMock
                  ? "bg-amber-50 text-amber-700 hover:bg-amber-100"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
              title={`${entry.scenario.kind} · tier ${entry.scenario.tier}${entry.isMock ? " (mock)" : ""}`}
            >
              {i + 1}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={next}
          className="min-h-12 rounded-xl bg-indigo-500 px-5 py-2 text-base font-semibold text-white transition hover:bg-indigo-600 active:scale-95"
        >
          Next →
        </button>
      </footer>
    </div>
  );
}
