# Sudokudo

A daily sudoku, Wordle-style: everyone plays the same puzzle each day and can
share and compare their times.

## How the daily puzzle works

There is no server and no pre-generated puzzle list. Every player's device
derives the day's puzzle from the calendar date:

1. The UTC date is formatted as `YYYY-MM-DD` and hashed with FNV-1a 32-bit
   (`sudokudo:v1:2026-08-08` → 32-bit seed).
2. The seed drives a Mulberry32 PRNG, which fills a complete valid grid by
   backtracking with per-cell shuffled digit orders.
3. Cells are removed one by one in a shuffled order; a removal is kept only if
   the puzzle stays solvable at the target difficulty (see below), which also
   guarantees exactly one solution.

Same date → same seed → same puzzle, on any device. Generation takes ~2–15 ms
(worst observed ~50 ms) and puzzles come out with roughly 22–29 clues. Every
puzzle is guaranteed unique-solution by construction, so no manual checking is
needed.

### Difficulty

Difficulty is graded by the solving techniques a human needs, combined with
how dense the givens are:

- **easy** — solvable with singles and dense (digging stops at 38 clues), so
  the next move is always close by
- **medium** — solvable with singles but dug down to ~23–27 clues, which
  takes real scanning
- **hard** — unique solution, but singles get stuck; advanced techniques
  required

`generatePuzzle(seed, difficulty)` digs holes only while the puzzle stays
solvable at that technique level, grades the result, and deterministically
retries with a derived seed (`seed + attempt * 0x9e3779b9`) until the grade
matches exactly. `difficultyForDate()` in `src/engine/daily.ts` sets the
weekday schedule (UTC): medium on Tuesday and Thursday, hard on Friday and
Sunday, easy the rest of the week. The seed doesn't depend on the
difficulty, so changing the schedule never perturbs anything else.

### Determinism contract

The output must stay bit-identical across implementations (e.g. a future Rust
server for leaderboards). Rules for any port:

- All arithmetic is 32-bit unsigned with wrapping overflow (`Math.imul` in JS,
  `wrapping_mul` in Rust).
- The exact PRNG draw order is specified in `src/generator.ts`: per attempt,
  81 digit-order shuffles, then the fill, then one 81-cell order shuffle, then
  digging; attempts repeat with derived seeds until the grade matches.
- `nextBelow` uses rejection sampling (no modulo bias) as written in
  `src/rng.ts`; Fisher-Yates runs high-to-low.
- If the algorithm ever changes, bump `GENERATOR_VERSION` in `src/daily.ts` —
  never silently change which puzzle a date maps to. A golden snapshot test
  guards this.

## Layout

- `src/engine/` — the deterministic core (no DOM dependencies):
  - `rng.ts` — FNV-1a hash, Mulberry32 PRNG, unbiased shuffle
  - `solver.ts` — backtracking solver with solution counting (MRV heuristic)
  - `grader.ts` — technique-based difficulty grading (singles solver)
  - `generator.ts` — full-grid generation + difficulty-targeted hole digging
  - `daily.ts` — date → seed, difficulty schedule, puzzle numbering
- `src/worker/puzzleWorker.ts` — generates the daily puzzle off the main thread
- `src/game/` — React game: board, number pad, timer, persistence, share
- `src/App.tsx`, `src/main.tsx`, `src/styles.css` — app shell; look and feel
  matched to woordle.nl (Open Sans, tile borders, key styling, state colors)
- `src/cli.ts` — print a day's puzzle in the terminal

The generated puzzle is cached in localStorage per day, and progress
(entries, start time, finish time) persists across reloads. The timer is
wall-clock from first open to completion, so racing stays fair.

## Launch & deployment

Puzzle #1 appears on the launch date set by `EPOCH_UTC` in
`src/engine/daily.ts` (currently 2026-08-31, a Monday so day one is easy).
Before that date the site shows a countdown; append `?preview` to the URL to
play anyway. Deploys to Netlify as a static site via `netlify.toml`
(`npm run build` → `dist/`).

## Commands

```sh
npm run dev                  # run the game locally
npm run build                # typecheck + production build to dist/
npm test                     # unit tests + golden snapshot
npm run today                # print today's puzzle (UTC)
npm run today -- 2026-12-25       # print a specific day's puzzle
npm run today -- 2026-12-25 hard  # override the difficulty
```
