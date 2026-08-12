import { useEffect, useState } from "react";
import type { PuzzleResponse } from "../worker/puzzleWorker.js";
import { cachePuzzle, loadCachedPuzzle } from "./storage.js";
import { dateKey, difficultyForDate, puzzleNumber, type Mode } from "../engine/daily.js";
import { DIG_TARGETS, type Difficulty } from "../engine/grader.js";

/**
 * One of the two daily puzzles (normal or expert): served instantly from the
 * per-day localStorage cache, or generated once in a web worker so the main
 * thread never blocks. `difficulty` overrides the mode's schedule (testing
 * only) and is cached under its own variant key.
 */
export function useDailyPuzzle(
  date: Date,
  mode: Mode,
  difficulty?: Difficulty,
  enabled = true,
): PuzzleResponse | null {
  const variant = difficulty ? `${mode}:${difficulty}` : mode;
  // A cached puzzle is only valid if it still matches what the schedule (or
  // override) says; the numbering epoch is validated too.
  const expected = difficulty ?? difficultyForDate(date, mode);
  const loadValidCache = () => {
    const cached = loadCachedPuzzle(dateKey(date), variant);
    // Dense tiers also validate the clue count, so a cached puzzle from
    // before a tier retune is regenerated instead of served stale.
    const target = DIG_TARGETS[expected];
    const clueCount = cached ? cached.givens.filter((g) => g !== 0).length : 0;
    return cached &&
      cached.difficulty === expected &&
      cached.number === puzzleNumber(date) &&
      (cached.mode ?? "expert") === mode &&
      (target === undefined || clueCount === target)
      ? cached
      : null;
  };
  const [puzzle, setPuzzle] = useState<PuzzleResponse | null>(() =>
    enabled ? loadValidCache() : null,
  );

  useEffect(() => {
    if (!enabled) return;
    const cached = loadValidCache();
    if (cached) {
      setPuzzle(cached);
      return;
    }
    setPuzzle(null);
    const worker = new Worker(new URL("../worker/puzzleWorker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (event: MessageEvent<PuzzleResponse>) => {
      cachePuzzle(event.data, variant);
      setPuzzle(event.data);
      worker.terminate();
    };
    worker.postMessage({ dateMs: date.getTime(), mode, difficulty });
    return () => worker.terminate();
  }, [date.getTime(), variant, enabled]);

  return puzzle;
}
