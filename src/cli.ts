/**
 * Print a daily puzzle in the terminal.
 * Usage: npm run today                    (today's puzzle, UTC)
 *        npm run today -- 2026-12-25      (a specific date)
 *        npm run today -- 2026-12-25 hard (override difficulty)
 */

import { dailyPuzzle } from "./engine/daily.js";
import { DIFFICULTIES, type Difficulty } from "./engine/grader.js";

function renderGrid(grid: Uint8Array): string {
  const lines: string[] = [];
  for (let r = 0; r < 9; r++) {
    if (r > 0 && r % 3 === 0) lines.push("------+-------+------");
    const cells: string[] = [];
    for (let c = 0; c < 9; c++) {
      if (c > 0 && c % 3 === 0) cells.push("|");
      const digit = grid[r * 9 + c]!;
      cells.push(digit === 0 ? "." : String(digit));
    }
    lines.push(cells.join(" "));
  }
  return lines.join("\n");
}

const arg = process.argv[2];
const date = arg ? new Date(`${arg}T00:00:00Z`) : new Date();
if (Number.isNaN(date.getTime())) {
  console.error(`invalid date: ${arg} (expected YYYY-MM-DD)`);
  process.exit(1);
}

const difficultyArg = process.argv[3] as Difficulty | undefined;
if (difficultyArg !== undefined && !DIFFICULTIES.includes(difficultyArg)) {
  console.error(`invalid difficulty: ${difficultyArg} (expected ${DIFFICULTIES.join(", ")})`);
  process.exit(1);
}

const puzzle = dailyPuzzle(date, difficultyArg);
console.log(
  `Sudokudo #${puzzle.number} — ${puzzle.date} (${puzzle.difficulty}, ${puzzle.clueCount} clues, seed ${puzzle.seed})`,
);
console.log();
console.log(renderGrid(puzzle.givens));
console.log();
console.log("Solution:");
console.log(renderGrid(puzzle.solution));
