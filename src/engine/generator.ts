/**
 * Deterministic sudoku generation.
 *
 * Given the same Rng seed and difficulty this always produces the same
 * puzzle, and every generated puzzle is guaranteed to have exactly one
 * solution — no manual checking needed.
 *
 * Determinism contract (a Rust port must follow the same steps in the same
 * order to reproduce puzzles). For attempt = 0, 1, 2, ...:
 *   1. Seed an Rng with (seed + attempt * 0x9e3779b9) mod 2^32.
 *   2. Draw a shuffled digit order for each of the 81 cells, in cell order
 *      0..80, each via a 9-element Fisher-Yates shuffle.
 *   3. Fill the grid by backtracking over cells 0..80 in order, trying each
 *      cell's digits in its pre-drawn order.
 *   4. Draw one shuffled order of all 81 cell indices.
 *   5. Walk that order once; clear each cell if the puzzle afterwards is
 *      still solvable at the target difficulty's technique level (every tier
 *      except hard: naked + hidden singles; hard: exhaustive uniqueness
 *      check), restore it otherwise. Dense tiers stop digging at their
 *      DIG_TARGETS clue count — density is what makes them easier.
 *   6. If the result meets the requested tier's spec, return it; otherwise
 *      continue with the next attempt.
 *
 * The attempt loop exists because digging at a technique level can overshoot
 * downwards (a medium dig can end up easy, a hard dig can end up solvable
 * with singles). Grading is deterministic, so the first matching attempt —
 * and therefore the returned puzzle — is too.
 */

import { Rng } from "./rng.js";
import { GRID_SIZE, boxOf, colOf, countSolutions, rowOf } from "./solver.js";
import { DIG_TARGETS, EASY_MIN_CLUES, solvableWithSingles, type Difficulty } from "./grader.js";

export interface Puzzle {
  /** 81 cells, row-major; 0 = empty cell the player must fill. */
  givens: Uint8Array;
  /** The unique solution. */
  solution: Uint8Array;
  /** Number of given digits. */
  clueCount: number;
  difficulty: Difficulty;
}

/** Generate a complete valid sudoku grid, deterministically from the rng. */
export function generateSolvedGrid(rng: Rng): Uint8Array {
  // Pre-draw all randomness so rng consumption is independent of the
  // backtracking path — simpler to reproduce in another language.
  const digitOrders: number[][] = [];
  for (let i = 0; i < GRID_SIZE; i++) {
    const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    rng.shuffle(digits);
    digitOrders.push(digits);
  }

  const grid = new Uint8Array(GRID_SIZE);
  const rows = new Array<number>(9).fill(0);
  const cols = new Array<number>(9).fill(0);
  const boxes = new Array<number>(9).fill(0);

  function fill(index: number): boolean {
    if (index === GRID_SIZE) return true;
    const r = rowOf(index);
    const c = colOf(index);
    const b = boxOf(index);
    for (const digit of digitOrders[index]!) {
      const bit = 1 << digit;
      if ((rows[r]! | cols[c]! | boxes[b]!) & bit) continue;
      grid[index] = digit;
      rows[r]! |= bit;
      cols[c]! |= bit;
      boxes[b]! |= bit;
      if (fill(index + 1)) return true;
      grid[index] = 0;
      rows[r]! &= ~bit;
      cols[c]! &= ~bit;
      boxes[b]! &= ~bit;
    }
    return false;
  }

  if (!fill(0)) {
    // Cannot happen: an empty sudoku grid is always completable.
    throw new Error("failed to generate a solved grid");
  }
  return grid;
}

/** Solvability check used while digging, per target difficulty. */
function stillOkay(givens: Uint8Array, difficulty: Difficulty): boolean {
  // Every tier except hard must stay solvable with singles; hard only needs
  // a unique solution.
  return difficulty === "hard"
    ? countSolutions(givens, 2) === 1
    : solvableWithSingles(givens, true);
}

/** One generation attempt: full grid, then dig at the difficulty's level. */
function attemptPuzzle(attemptSeed: number, difficulty: Difficulty): Puzzle {
  const rng = new Rng(attemptSeed);
  const solution = generateSolvedGrid(rng);

  const order = Array.from({ length: GRID_SIZE }, (_, i) => i);
  rng.shuffle(order);

  const givens = solution.slice();
  const minClues = DIG_TARGETS[difficulty] ?? 17;
  let clueCount = GRID_SIZE;
  for (const index of order) {
    if (clueCount <= minClues) break;
    const removed = givens[index]!;
    givens[index] = 0;
    if (stillOkay(givens, difficulty)) {
      clueCount--;
    } else {
      givens[index] = removed;
    }
  }

  return { givens, solution, clueCount, difficulty };
}

/**
 * Does a dug puzzle satisfy the requested tier's spec? (Tiers can share
 * parameters — brisk and easy are the same class — so this checks the spec
 * directly instead of round-tripping through a grade.)
 */
function meetsSpec(difficulty: Difficulty, givens: Uint8Array, clueCount: number): boolean {
  const target = DIG_TARGETS[difficulty];
  if (target !== undefined) {
    return clueCount === target && solvableWithSingles(givens, true);
  }
  if (difficulty === "medium") {
    return clueCount < EASY_MIN_CLUES && solvableWithSingles(givens, true);
  }
  // hard: unique but singles get stuck
  return !solvableWithSingles(givens, true) && countSolutions(givens, 2) === 1;
}

/**
 * Generate a puzzle whose grade is exactly `difficulty`.
 * Tries successive derived seeds until an attempt lands on the target grade;
 * the whole process is deterministic in (seed, difficulty).
 */
export function generatePuzzle(seed: number, difficulty: Difficulty = "medium"): Puzzle {
  for (let attempt = 0; ; attempt++) {
    const attemptSeed = (seed + Math.imul(attempt, 0x9e3779b9)) >>> 0;
    const puzzle = attemptPuzzle(attemptSeed, difficulty);
    if (meetsSpec(difficulty, puzzle.givens, puzzle.clueCount)) return puzzle;
  }
}
