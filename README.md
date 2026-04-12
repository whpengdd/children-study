# Children Study — 儿童英语单词记忆 Web App

A Vite + React + TypeScript web app that helps children memorize English
vocabulary through a 10-scenario / 4-tier active-recall curriculum, with a
tamagotchi-style pet as motivation. Supports both PEP (school curriculum,
grades 3–6) and Cambridge KET / PET exam paths from a single unified catalog.

See `/Users/whpeng/.claude/plans/purrfect-giggling-meadow.md` for the
authoritative plan.

## Scripts

```bash
npm run dev        # vite dev server on http://localhost:5173
npm run build      # tsc -b && vite build
npm run preview    # preview the production build
npm run build:data # stub — the real data pipeline is built in Wave 1
```

## Status

Wave 0 (Agent-Foundation) — scaffolding, types, Dexie schema, router stubs,
and a 1-word mock `public/data/catalog.json`. No business logic yet.
