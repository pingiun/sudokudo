/**
 * Emit daily puzzles as JSONL for seeding the jellespelletjes-api database.
 * The TypeScript engine is the single source of truth for puzzle content;
 * the server only stores and compares.
 *
 * Usage:
 *   npx tsx scripts/seed-puzzles.ts 2026-08-31 2027-12-31 > seed.jsonl
 *   npx tsx scripts/seed-puzzles.ts 2026-08-31 2027-12-31 | ssh vps 'jellespelletjes-api seed-sudoku'
 */

import { dailyPuzzle, GENERATOR_VERSION } from "../src/engine/daily.js";

const [startArg, endArg] = process.argv.slice(2);
if (!startArg || !endArg) {
  console.error("usage: seed-puzzles.ts <start YYYY-MM-DD> <end YYYY-MM-DD>");
  process.exit(1);
}
const start = new Date(`${startArg}T00:00:00Z`);
const end = new Date(`${endArg}T00:00:00Z`);
if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
  console.error("invalid date range");
  process.exit(1);
}

for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
  const puzzle = dailyPuzzle(new Date(t));
  process.stdout.write(
    JSON.stringify({
      puzzle_number: puzzle.number,
      date: puzzle.date,
      generator_version: GENERATOR_VERSION,
      difficulty: puzzle.difficulty,
      givens: Array.from(puzzle.givens).join(""),
      solution: Array.from(puzzle.solution).join(""),
    }) + "\n",
  );
}
