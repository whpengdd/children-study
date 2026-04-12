# Pet Sprite Placeholders

v1 ships with **no real sprite art**. `PetAvatar.tsx` renders emoji-based
placeholders keyed off `(species, stage)`:

| Species | egg | baby | child | teen  | adult |
| ------- | --- | ---- | ----- | ----- | ----- |
| cat     | 🥚  | 🐱   | 😺    | 😸    | 😻    |
| dog     | 🥚  | 🐶   | 🐕    | 🦮    | 🐕‍🦺    |
| dragon  | 🥚  | 🐉   | 🐲    | 🐉    | 🐲    |
| owl     | 🥚  | 🦉   | 🦉    | 🦉    | 🦉    |
| rabbit  | 🥚  | 🐰   | 🐇    | 🐰    | 🐇    |

A separate facial overlay is rendered on top for `mood` states (happy / sad /
sleepy / neutral). These are CSS-only so there is zero asset-loading cost and
no copyright risk.

When real art lands (future wave), drop PNG / WebP files named
`{species}-{stage}.png` into this folder and update `PetAvatar.tsx` to prefer
`<img>` over the emoji fallback. The fallback path will stay as a safety net
for offline / missing-asset scenarios.

The `public/pet/lottie/` folder is reserved for post-MVP celebration
animations (`evolve.json`, `level_up.json`, `confetti.json`); leaving it empty
for now is intentional.
