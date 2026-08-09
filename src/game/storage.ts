/**
 * localStorage persistence: the generated puzzle is cached per day (so the
 * worker only runs once per day per device) and the player's progress is
 * stored separately so reloads resume seamlessly.
 */

import type { PuzzleResponse } from "../worker/puzzleWorker.js";
import { GENERATOR_VERSION } from "../engine/daily.js";

export interface GameProgress {
  /** Player entries, 81 cells; 0 = empty. Given cells stay 0 here. */
  entries: number[];
  /** Pencil marks per cell as a bitmask (bit d set = digit d noted). */
  notes: number[];
  /** Wall-clock ms timestamp of when the puzzle was first shown. */
  startedAt: number;
  /** Set once the grid is completed correctly. */
  finishedAt: number | null;
}

/**
 * `variant` separates the normal daily game ("daily") from difficulty
 * overrides (?difficulty=easy), so testing an override never touches the
 * real daily progress.
 */
// The generator version is part of the key: a version bump must never serve
// a puzzle (or progress made on it) cached by an older algorithm.
const suffix = (date: string, variant: string) =>
  variant === "daily" ? `${GENERATOR_VERSION}:${date}` : `${GENERATOR_VERSION}:${date}:${variant}`;
const puzzleKey = (date: string, variant: string) => `sudokudo:puzzle:${suffix(date, variant)}`;
const progressKey = (date: string, variant: string) => `sudokudo:progress:${suffix(date, variant)}`;

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable — the game still works, just without resume.
  }
}

/* ---------------- statistics (woordle-style, but timed) ---------------- */

/** Solve-time histogram bucket upper bounds in minutes; last bucket is open. */
export const TIME_BUCKETS_MIN = [3, 5, 10, 15, 30];
export const TIME_BUCKET_LABELS = ["<3", "3-5", "5-10", "10-15", "15-30", ">30"];

export function bucketOf(elapsedMs: number): number {
  const minutes = elapsedMs / 60000;
  for (let i = 0; i < TIME_BUCKETS_MIN.length; i++) {
    if (minutes < TIME_BUCKETS_MIN[i]!) return i;
  }
  return TIME_BUCKETS_MIN.length;
}

export interface Stats {
  gamesPlayed: number;
  gamesWon: number;
  currentStreak: number;
  maxStreak: number;
  /** Puzzle numbers, to make played/won recording idempotent per day. */
  lastPlayedNumber: number | null;
  lastWonNumber: number | null;
  /** Bucket index of the most recent win, for highlighting. */
  lastWonBucket: number | null;
  /** Win counts per time bucket. */
  buckets: number[];
}

const STATS_KEY = "sudokudo:stats";

const emptyStats = (): Stats => ({
  gamesPlayed: 0,
  gamesWon: 0,
  currentStreak: 0,
  maxStreak: 0,
  lastPlayedNumber: null,
  lastWonNumber: null,
  lastWonBucket: null,
  buckets: new Array(TIME_BUCKET_LABELS.length).fill(0),
});

export function loadStats(): Stats {
  const stats = readJson<Stats>(STATS_KEY);
  if (!stats || stats.buckets?.length !== TIME_BUCKET_LABELS.length) return emptyStats();
  return stats;
}

/** Count a day's puzzle as played (idempotent per puzzle number). */
export function recordGameStarted(puzzleNumber: number): void {
  const stats = loadStats();
  if (stats.lastPlayedNumber === puzzleNumber) return;
  stats.lastPlayedNumber = puzzleNumber;
  stats.gamesPlayed++;
  writeJson(STATS_KEY, stats);
}

/** Record a win and update streaks (idempotent per puzzle number). */
export function recordGameWon(puzzleNumber: number, elapsedMs: number): void {
  const stats = loadStats();
  if (stats.lastWonNumber === puzzleNumber) return;
  stats.currentStreak = stats.lastWonNumber === puzzleNumber - 1 ? stats.currentStreak + 1 : 1;
  stats.maxStreak = Math.max(stats.maxStreak, stats.currentStreak);
  stats.lastWonNumber = puzzleNumber;
  stats.gamesWon++;
  stats.lastWonBucket = bucketOf(elapsedMs);
  stats.buckets[stats.lastWonBucket]!++;
  writeJson(STATS_KEY, stats);
}

/* ---------------------------- per-day state ---------------------------- */

export function loadCachedPuzzle(date: string, variant: string): PuzzleResponse | null {
  const puzzle = readJson<PuzzleResponse>(puzzleKey(date, variant));
  return puzzle && puzzle.givens?.length === 81 ? puzzle : null;
}

export function cachePuzzle(puzzle: PuzzleResponse, variant: string): void {
  writeJson(puzzleKey(puzzle.date, variant), puzzle);
}

export function loadProgress(date: string, variant: string): GameProgress | null {
  const progress = readJson<GameProgress>(progressKey(date, variant));
  if (!progress || progress.entries?.length !== 81) return null;
  // Progress saved before the notes feature has no notes array.
  if (progress.notes?.length !== 81) progress.notes = new Array(81).fill(0);
  return progress;
}

export function saveProgress(date: string, variant: string, progress: GameProgress): void {
  writeJson(progressKey(date, variant), progress);
}
