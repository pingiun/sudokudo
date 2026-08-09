import { describe, expect, it } from "vitest";
import { Rng, fnv1a } from "../src/engine/rng.js";
import { countSolutions, isValidSolution } from "../src/engine/solver.js";
import { generatePuzzle, generateSolvedGrid } from "../src/engine/generator.js";
import { gradePuzzle, solvableWithSingles } from "../src/engine/grader.js";
import { dailyPuzzle, difficultyForDate, puzzleNumber, seedForDate } from "../src/engine/daily.js";

describe("rng", () => {
  it("is deterministic for a given seed", () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    for (let i = 0; i < 100; i++) {
      expect(a.nextU32()).toBe(b.nextU32());
    }
  });

  it("hashes strings stably", () => {
    // Known FNV-1a 32-bit vectors; a Rust port must reproduce these.
    expect(fnv1a("")).toBe(0x811c9dc5);
    expect(fnv1a("a")).toBe(0xe40c292c);
    expect(fnv1a("sudokudo:v1:2026-08-08")).toBe(fnv1a("sudokudo:v1:2026-08-08"));
  });

  it("nextBelow stays in range", () => {
    const rng = new Rng(1);
    for (let i = 0; i < 1000; i++) {
      const value = rng.nextBelow(9);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(9);
    }
  });
});

describe("generateSolvedGrid", () => {
  it("produces a valid complete grid", () => {
    const grid = generateSolvedGrid(new Rng(42));
    expect(isValidSolution(grid)).toBe(true);
  });

  it("produces different grids for different seeds", () => {
    const a = generateSolvedGrid(new Rng(1));
    const b = generateSolvedGrid(new Rng(2));
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });
});

describe("generatePuzzle", () => {
  it("is deterministic: same seed, same puzzle", () => {
    const a = generatePuzzle(987654321);
    const b = generatePuzzle(987654321);
    expect(Array.from(a.givens)).toEqual(Array.from(b.givens));
    expect(Array.from(a.solution)).toEqual(Array.from(b.solution));
  });

  it("every puzzle has exactly one solution, matching the stored one", () => {
    for (let seed = 0; seed < 10; seed++) {
      const puzzle = generatePuzzle(seed);
      expect(countSolutions(puzzle.givens, 2)).toBe(1);
      expect(isValidSolution(puzzle.solution)).toBe(true);
      for (let i = 0; i < 81; i++) {
        if (puzzle.givens[i] !== 0) {
          expect(puzzle.givens[i]).toBe(puzzle.solution[i]);
        }
      }
    }
  });

  it("reports the clue count accurately", () => {
    const puzzle = generatePuzzle(7);
    const actual = Array.from(puzzle.givens).filter((d) => d !== 0).length;
    expect(puzzle.clueCount).toBe(actual);
    expect(puzzle.clueCount).toBeGreaterThanOrEqual(17);
    expect(puzzle.clueCount).toBeLessThan(60);
  });

  it("hits the requested difficulty grade", () => {
    for (let seed = 100; seed < 105; seed++) {
      const easy = generatePuzzle(seed, "easy");
      expect(easy.difficulty).toBe("easy");
      expect(solvableWithSingles(easy.givens, true)).toBe(true);
      expect(easy.clueCount).toBeGreaterThanOrEqual(36);

      const medium = generatePuzzle(seed, "medium");
      expect(medium.difficulty).toBe("medium");
      expect(solvableWithSingles(medium.givens, true)).toBe(true);
      expect(medium.clueCount).toBeLessThan(36);

      const hard = generatePuzzle(seed, "hard");
      expect(hard.difficulty).toBe("hard");
      expect(solvableWithSingles(hard.givens, true)).toBe(false);
      expect(countSolutions(hard.givens, 2)).toBe(1);
    }
  });

  it("difficulty generation is deterministic", () => {
    const a = generatePuzzle(555, "hard");
    const b = generatePuzzle(555, "hard");
    expect(Array.from(a.givens)).toEqual(Array.from(b.givens));
  });

  it("grades known puzzles sensibly", () => {
    const easy = generatePuzzle(1, "easy");
    expect(gradePuzzle(easy.givens)).toBe("easy");
    const hard = generatePuzzle(1, "hard");
    expect(gradePuzzle(hard.givens)).toBe("hard");
  });
});

describe("daily", () => {
  it("maps a date to a stable seed", () => {
    const date = new Date(Date.UTC(2026, 7, 8));
    expect(seedForDate(date)).toBe(seedForDate(new Date(Date.UTC(2026, 7, 8, 23, 59))));
    expect(seedForDate(date)).not.toBe(seedForDate(new Date(Date.UTC(2026, 7, 9))));
  });

  it("numbers puzzles sequentially from launch day", () => {
    expect(puzzleNumber(new Date(Date.UTC(2026, 7, 31)))).toBe(1);
    expect(puzzleNumber(new Date(Date.UTC(2026, 8, 1)))).toBe(2);
    expect(puzzleNumber(new Date(Date.UTC(2027, 7, 31)))).toBe(366);
    // pre-launch days have numbers below 1, which the app uses for the countdown
    expect(puzzleNumber(new Date(Date.UTC(2026, 7, 30)))).toBe(0);
  });

  it("two players generating the same day get the identical puzzle", () => {
    const date = new Date(Date.UTC(2026, 11, 25));
    const a = dailyPuzzle(date);
    const b = dailyPuzzle(date);
    expect(Array.from(a.givens)).toEqual(Array.from(b.givens));
    expect(a.number).toBe(b.number);
  });

  it("schedules difficulty by weekday: medium Tue/Thu, hard Fri/Sun, easy otherwise", () => {
    // 2026-08-03 is a Monday.
    const byWeekday = ["easy", "medium", "easy", "medium", "hard", "easy", "hard"];
    byWeekday.forEach((expected, offset) => {
      const date = new Date(Date.UTC(2026, 7, 3 + offset));
      expect(difficultyForDate(date)).toBe(expected);
    });
    const tuesday = dailyPuzzle(new Date(Date.UTC(2026, 7, 4)));
    expect(tuesday.difficulty).toBe("medium");
  });

  it("golden snapshot for launch day (guards against accidental algorithm changes)", () => {
    const puzzle = dailyPuzzle(new Date(Date.UTC(2026, 7, 31)));
    expect(Array.from(puzzle.givens).join("")).toMatchSnapshot();
    expect(Array.from(puzzle.solution).join("")).toMatchSnapshot();
  });
});
