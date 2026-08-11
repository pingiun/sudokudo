/**
 * The daily puzzle: maps a calendar date to a deterministic seed so every
 * player generates the identical puzzle locally, with no server involved.
 */

import { fnv1a } from "./rng.js";
import { generatePuzzle, type Puzzle } from "./generator.js";
import type { Difficulty } from "./grader.js";

/**
 * Version tag mixed into the seed. Bump this if the generation algorithm ever
 * changes, so a change is an explicit new era rather than silently altering
 * which puzzle a date maps to.
 */
export const GENERATOR_VERSION = "v2"; // v2: difficulty rescale (easy = dense singles grid)

/**
 * Launch day: puzzle #1 appears on this UTC date. Before it, the app shows a
 * countdown. Chosen as a Monday so day one is an easy puzzle (see
 * difficultyForDate). This is the single line to change to move the launch.
 */
export const EPOCH_UTC = Date.UTC(2026, 7, 31); // 2026-08-31, a Monday

/** Format a Date as its UTC calendar day, e.g. "2026-08-08". */
export function dateKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Sequential puzzle number for sharing ("Sudokudo #1"), like Wordle's. */
export function puzzleNumber(date: Date): number {
  const day = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.floor((day - EPOCH_UTC) / 86400000) + 1;
}

/**
 * Two daily puzzles: the accessible "normal" game everyone can finish, and
 * the "expert" game for the pros. They MUST be completely different grids,
 * so the modes use different seeds: expert keeps the original (pre-modes)
 * seed string for backwards compatibility with already-seeded servers.
 */
export type Mode = "normal" | "expert";
export const MODES: readonly Mode[] = ["normal", "expert"];

export function seedForDate(date: Date, mode: Mode = "expert"): number {
  const modePart = mode === "expert" ? "" : `${mode}:`;
  return fnv1a(`sudokudo:${GENERATOR_VERSION}:${modePart}${dateKey(date)}`);
}

/**
 * Which difficulty a given calendar day gets, per mode (UTC weekday, same
 * clock as the puzzle itself). Expert: medium Tue/Thu, hard Fri/Sun, easy
 * otherwise. Normal mirrors the same rhythm one notch down: relaxed Tue/Thu,
 * brisk Fri/Sun, beginner otherwise. Seeds do not depend on this, so
 * adjusting a schedule only changes days going forward in the intended way.
 */
export function difficultyForDate(date: Date, mode: Mode = "expert"): Difficulty {
  const expert = mode === "expert";
  switch (date.getUTCDay()) {
    case 2: // Tuesday
    case 4: // Thursday
      return expert ? "medium" : "relaxed";
    case 5: // Friday
    case 0: // Sunday
      return expert ? "hard" : "brisk";
    default:
      return expert ? "easy" : "beginner";
  }
}

export interface DailyPuzzle extends Puzzle {
  date: string;
  number: number;
  seed: number;
  mode: Mode;
}

export function dailyPuzzle(
  date: Date = new Date(),
  mode: Mode = "expert",
  difficulty?: Difficulty,
): DailyPuzzle {
  const seed = seedForDate(date, mode);
  return {
    ...generatePuzzle(seed, difficulty ?? difficultyForDate(date, mode)),
    date: dateKey(date),
    number: puzzleNumber(date),
    seed,
    mode,
  };
}
