/// <reference lib="webworker" />
/**
 * Generates the daily puzzle off the main thread so even slow devices never
 * jank the UI. Input: UTC epoch ms of the requested day. Output: the puzzle
 * with grids as plain arrays (JSON-friendly for localStorage caching).
 */

import { dailyPuzzle } from "../engine/daily.js";
import type { Difficulty } from "../engine/grader.js";

export interface PuzzleRequest {
  dateMs: number;
  /** Override the day's scheduled difficulty (used by ?difficulty=… for testing). */
  difficulty?: Difficulty;
}

export interface PuzzleResponse {
  date: string;
  number: number;
  seed: number;
  difficulty: string;
  clueCount: number;
  givens: number[];
  solution: number[];
}

self.onmessage = (event: MessageEvent<PuzzleRequest>) => {
  const puzzle = dailyPuzzle(new Date(event.data.dateMs), event.data.difficulty);
  const response: PuzzleResponse = {
    date: puzzle.date,
    number: puzzle.number,
    seed: puzzle.seed,
    difficulty: puzzle.difficulty,
    clueCount: puzzle.clueCount,
    givens: Array.from(puzzle.givens),
    solution: Array.from(puzzle.solution),
  };
  self.postMessage(response);
};
