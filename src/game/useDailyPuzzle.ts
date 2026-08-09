import { useEffect, useState } from "react";
import type { PuzzleResponse } from "../worker/puzzleWorker.js";
import { cachePuzzle, loadCachedPuzzle } from "./storage.js";
import { dateKey, difficultyForDate, puzzleNumber } from "../engine/daily.js";
import type { Difficulty } from "../engine/grader.js";

/**
 * Today's puzzle: served instantly from the per-day localStorage cache, or
 * generated once in a web worker so the main thread never blocks.
 * `difficulty` overrides the day's scheduled difficulty (testing only) and
 * is cached under its own variant key.
 */
export function useDailyPuzzle(
  date: Date,
  difficulty?: Difficulty,
  enabled = true,
): PuzzleResponse | null {
  const variant = difficulty ?? "daily";
  // A cached puzzle is only valid if its difficulty still matches what the
  // schedule (or override) says — otherwise regenerate.
  const expected = difficulty ?? difficultyForDate(date);
  const loadValidCache = () => {
    const cached = loadCachedPuzzle(dateKey(date), variant);
    // The numbering epoch can move before launch, so validate it too.
    return cached && cached.difficulty === expected && cached.number === puzzleNumber(date)
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
    const worker = new Worker(new URL("../worker/puzzleWorker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (event: MessageEvent<PuzzleResponse>) => {
      cachePuzzle(event.data, variant);
      setPuzzle(event.data);
      worker.terminate();
    };
    worker.postMessage({ dateMs: date.getTime(), difficulty });
    return () => worker.terminate();
  }, [date.getTime(), variant, enabled]);

  return puzzle;
}
