/**
 * Difficulty grading based on the solving techniques a human needs plus how
 * dense the givens are:
 *
 * - easy:   solvable with singles (naked + hidden) AND at least EASY_MIN_CLUES
 *           givens — a dense grid where the next move is always close by
 * - medium: solvable with singles, but dug much further down (~22-27 clues),
 *           so finding each single takes real scanning
 * - hard:   has a unique solution but singles alone get stuck, so the player
 *           needs more advanced techniques
 *
 * The grader is pure integer/bitmask logic with no randomness, so it is
 * trivially deterministic and portable.
 */

import { GRID_SIZE, boxOf, colOf, rowOf } from "./solver.js";

export type Difficulty = "beginner" | "relaxed" | "brisk" | "easy" | "medium" | "hard";

export const DIFFICULTIES: readonly Difficulty[] = [
  "beginner",
  "relaxed",
  "brisk",
  "easy",
  "medium",
  "hard",
];

/**
 * Dense singles-solvable tiers, graded purely by given count (digging stops
 * exactly at the target, so grades are deterministic). A tier's grade floor
 * sits between its dig target and the next tier's.
 */
export const DIG_TARGETS: Record<string, number> = {
  beginner: 50,
  relaxed: 46,
  brisk: 42,
  easy: 38,
};

const GRADE_FLOORS: [Difficulty, number][] = [
  ["beginner", 48],
  ["relaxed", 44],
  ["brisk", 40],
  ["easy", 36],
];

/** A singles-solvable puzzle with at least this many givens grades easy. */
export const EASY_MIN_CLUES = 36;

const ALL_CANDIDATES = 0b1111111110;

/** Cell indices of each of the 27 units (9 rows, 9 cols, 9 boxes). */
const UNITS: number[][] = (() => {
  const units: number[][] = [];
  for (let r = 0; r < 9; r++) units.push(Array.from({ length: 9 }, (_, c) => r * 9 + c));
  for (let c = 0; c < 9; c++) units.push(Array.from({ length: 9 }, (_, r) => r * 9 + c));
  for (let b = 0; b < 9; b++) {
    const top = Math.floor(b / 3) * 27 + (b % 3) * 3;
    units.push(Array.from({ length: 9 }, (_, i) => top + Math.floor(i / 3) * 9 + (i % 3)));
  }
  return units;
})();

function candidatesFor(grid: Uint8Array, index: number): number {
  let used = 0;
  const r = rowOf(index);
  const c = colOf(index);
  const b = boxOf(index);
  for (let i = 0; i < GRID_SIZE; i++) {
    if (grid[i] === 0) continue;
    if (rowOf(i) === r || colOf(i) === c || boxOf(i) === b) used |= 1 << grid[i]!;
  }
  return ALL_CANDIDATES & ~used;
}

function digitOf(candidates: number): number {
  for (let d = 1; d <= 9; d++) if (candidates === 1 << d) return d;
  return 0;
}

/**
 * Repeatedly apply singles until the grid is solved or no single applies.
 * Returns true if the grid was completely solved. Does not mutate `givens`.
 */
export function solvableWithSingles(givens: Uint8Array, useHiddenSingles: boolean): boolean {
  const grid = givens.slice();
  let progress = true;
  while (progress) {
    progress = false;

    // Naked singles: a cell with exactly one candidate.
    for (let i = 0; i < GRID_SIZE; i++) {
      if (grid[i] !== 0) continue;
      const cands = candidatesFor(grid, i);
      if (cands === 0) return false; // contradiction
      const digit = digitOf(cands);
      if (digit !== 0) {
        grid[i] = digit;
        progress = true;
      }
    }
    if (progress || !useHiddenSingles) continue;

    // Hidden singles: within a unit, a digit with exactly one possible cell.
    for (const unit of UNITS) {
      for (let digit = 1; digit <= 9; digit++) {
        const bit = 1 << digit;
        let spot = -1;
        let count = 0;
        let placed = false;
        for (const index of unit) {
          if (grid[index] === digit) {
            placed = true;
            break;
          }
          if (grid[index] === 0 && candidatesFor(grid, index) & bit) {
            spot = index;
            count++;
          }
        }
        if (!placed && count === 1) {
          grid[spot] = digit;
          progress = true;
        }
      }
    }
  }
  return grid.every((d) => d !== 0);
}

/**
 * Grade a puzzle that is already known to have a unique solution.
 */
export function gradePuzzle(givens: Uint8Array): Difficulty {
  if (!solvableWithSingles(givens, true)) return "hard";
  let clues = 0;
  for (const digit of givens) if (digit !== 0) clues++;
  for (const [tier, floor] of GRADE_FLOORS) {
    if (clues >= floor) return tier;
  }
  return "medium";
}
