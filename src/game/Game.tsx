import { useCallback, useEffect, useMemo, useRef, useState } from "react";

declare global {
  interface Window {
    ezstandalone?: {
      cmd: Array<() => void>;
      displayMore: (...ids: number[]) => void;
      destroyPlaceholders: (...ids: number[]) => void;
    };
  }
}
import type { PuzzleResponse } from "../worker/puzzleWorker.js";
import {
  loadProgress,
  recordGameStarted,
  recordGameWon,
  saveProgress,
  type GameProgress,
} from "./storage.js";
import { StatsSection } from "./StatsSection.jsx";
import { submitResult } from "./api.js";
import type { Strings } from "../i18n.js";

const boxOf = (i: number) => Math.floor(Math.floor(i / 9) / 3) * 3 + Math.floor((i % 9) / 3);

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Cells whose current value collides with another cell in the same unit. */
function findConflicts(values: number[]): boolean[] {
  const conflict = new Array<boolean>(81).fill(false);
  for (let i = 0; i < 81; i++) {
    const v = values[i]!;
    if (v === 0) continue;
    for (let j = i + 1; j < 81; j++) {
      if (values[j] !== v) continue;
      const sameUnit =
        Math.floor(i / 9) === Math.floor(j / 9) || i % 9 === j % 9 || boxOf(i) === boxOf(j);
      if (sameUnit) {
        conflict[i] = true;
        conflict[j] = true;
      }
    }
  }
  return conflict;
}

export function Game({
  puzzle,
  mode,
  variant,
  isDaily,
  t,
}: {
  puzzle: PuzzleResponse;
  mode: "normal" | "expert";
  variant: string;
  isDaily: boolean;
  t: Strings;
}) {
  const initialProgress = useMemo<GameProgress>(
    () =>
      loadProgress(puzzle.date, variant) ?? {
        entries: new Array(81).fill(0),
        notes: new Array(81).fill(0),
        startedAt: Date.now(),
        finishedAt: null,
      },
    [puzzle.date, variant],
  );

  const [entries, setEntries] = useState<number[]>(initialProgress.entries);
  const [notes, setNotes] = useState<number[]>(initialProgress.notes);
  const [notesMode, setNotesMode] = useState(false);
  const [finishedAt, setFinishedAt] = useState<number | null>(initialProgress.finishedAt);
  const [selected, setSelected] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(initialProgress.finishedAt !== null);
  const [toast, setToast] = useState<string | null>(null);
  const startedAt = initialProgress.startedAt;

  const values = useMemo(
    () => puzzle.givens.map((g, i) => (g !== 0 ? g : entries[i]!)),
    [puzzle.givens, entries],
  );
  const conflicts = useMemo(() => findConflicts(values), [values]);
  const won = finishedAt !== null;
  // The result screen carries an ad (placeholder 109): Ezoic's SPA flow
  // shows the dynamically mounted div on open and tears it down on close.
  useEffect(() => {
    if (!showResult || !won) return;
    const ez = window.ezstandalone;
    if (!ez) return;
    ez.cmd.push(() => ez.displayMore(109));
    return () => {
      ez.cmd.push(() => ez.destroyPlaceholders(109));
    };
  }, [showResult, won]);
  // "Stuck" = more conflicted cells than a single misplaced digit can cause.
  // One wrong digit lights up at most itself and the one entry it clashes
  // with (2 cells) — the player sees that in red and fixes it themselves.
  // Three or more conflicted entries means stacked mistakes, and only then
  // is the rescue button offered. Still knowable from the grid alone, so it
  // leaks nothing about the solution.
  const isStuck = useMemo(
    () => conflicts.filter((c, i) => c && puzzle.givens[i] === 0).length >= 3,
    [conflicts, puzzle.givens],
  );

  useEffect(() => {
    saveProgress(puzzle.date, variant, { entries, notes, startedAt, finishedAt });
  }, [puzzle.date, variant, entries, notes, startedAt, finishedAt]);

  // Statistics track only the real daily games, not ?difficulty overrides.
  useEffect(() => {
    if (isDaily) recordGameStarted(mode, puzzle.number);
  }, [isDaily, mode, puzzle.number]);
  useEffect(() => {
    if (isDaily && finishedAt !== null) {
      recordGameWon(mode, puzzle.number, finishedAt - startedAt);
      // Sync to the account API when logged in (no-op otherwise).
      void submitResult(mode, puzzle.number, puzzle.solution, startedAt, finishedAt);
    }
  }, [isDaily, mode, puzzle.number, puzzle.solution, finishedAt, startedAt]);

  // Timer display (wall-clock: fair for racing, survives reloads).
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (won) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [won]);
  const elapsedMs = (finishedAt ?? now) - startedAt;

  const enterDigit = useCallback(
    (digit: number) => {
      if (won || selected === null || puzzle.givens[selected] !== 0) return;
      if (notesMode) {
        // Toggle a pencil mark; only meaningful on cells without an entry.
        if (entries[selected] !== 0) return;
        setNotes((prev) => {
          const next = prev.slice();
          next[selected] = prev[selected]! ^ (1 << digit);
          return next;
        });
        return;
      }
      // A real entry replaces the cell's notes, and removes this digit from
      // the notes of every peer cell (standard sudoku-app nicety).
      setNotes((prev) => {
        const next = prev.slice();
        next[selected] = 0;
        for (let i = 0; i < 81; i++) {
          const samePeer =
            Math.floor(i / 9) === Math.floor(selected / 9) ||
            i % 9 === selected % 9 ||
            boxOf(i) === boxOf(selected);
          if (samePeer) next[i] = next[i]! & ~(1 << digit);
        }
        return next;
      });
      setEntries((prev) => {
        if (prev[selected] === digit) return prev;
        const next = prev.slice();
        next[selected] = digit;
        const full = puzzle.givens.every((g, i) => (g !== 0 ? true : next[i] !== 0));
        if (full) {
          const correct = puzzle.givens.every(
            (g, i) => (g !== 0 ? g : next[i]) === puzzle.solution[i],
          );
          if (correct) {
            setFinishedAt(Date.now());
            setSelected(null);
            setTimeout(() => setShowResult(true), 900);
          }
        }
        return next;
      });
    },
    [won, selected, puzzle, notesMode, entries],
  );

  const clearCell = useCallback(() => {
    if (won || selected === null || puzzle.givens[selected] !== 0) return;
    setEntries((prev) => {
      if (prev[selected] === 0) return prev;
      const next = prev.slice();
      next[selected] = 0;
      return next;
    });
    setNotes((prev) => {
      if (prev[selected] === 0) return prev;
      const next = prev.slice();
      next[selected] = 0;
      return next;
    });
  }, [won, selected, puzzle.givens]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key >= "1" && e.key <= "9") {
        enterDigit(Number(e.key));
      } else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") {
        clearCell();
      } else if (e.key === "n" || e.key === "N") {
        setNotesMode((prev) => !prev);
      } else if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        setSelected((prev) => {
          const from = prev ?? 0;
          if (prev === null) return 0;
          if (e.key === "ArrowUp") return from >= 9 ? from - 9 : from;
          if (e.key === "ArrowDown") return from < 72 ? from + 9 : from;
          if (e.key === "ArrowLeft") return from % 9 > 0 ? from - 1 : from;
          return from % 9 < 8 ? from + 1 : from;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enterDigit, clearCell]);

  const getUnstuck = useCallback(() => {
    if (won) return;
    const wrong: number[] = [];
    for (let i = 0; i < 81; i++) {
      if (entries[i] !== 0 && entries[i] !== puzzle.solution[i]) wrong.push(i);
    }
    if (wrong.length === 0) {
      setToast(t.allCorrect);
    } else {
      setEntries((prev) => {
        const next = prev.slice();
        for (const i of wrong) next[i] = 0;
        return next;
      });
      setToast(t.removedWrong(wrong.length));
    }
    setTimeout(() => setToast(null), 2500);
  }, [won, entries, puzzle.solution, t]);

  const digitCounts = useMemo(() => {
    const counts = new Array<number>(10).fill(0);
    for (const v of values) counts[v]!++;
    return counts;
  }, [values]);

  const selectedValue = selected !== null ? values[selected]! : 0;

  const share = async () => {
    const text = [
      `Sudokudo #${puzzle.number} (${t.modes[mode].toLowerCase()} · ${t.difficulty[puzzle.difficulty as keyof typeof t.difficulty].toLowerCase()})`,
      `⏱️ ${formatTime(elapsedMs)}`,
      "https://sudokudo.nl",
    ].join("\n");
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setToast(t.copied);
      setTimeout(() => setToast(null), 2000);
    } catch {
      // user cancelled the share sheet
    }
  };

  return (
    <>
      <div className="status">
        <span className="difficulty">
          {t.difficulty[puzzle.difficulty as keyof typeof t.difficulty]}
        </span>
        <span>{puzzle.number >= 1 ? `#${puzzle.number}` : "preview"}</span>
        <span className="timer">{formatTime(elapsedMs)}</span>
      </div>

      <div className="board-wrap">
        <div className={`board${won ? " won" : ""}`}>
          {values.map((value, i) => {
            const given = puzzle.givens[i] !== 0;
            const row = Math.floor(i / 9);
            const col = i % 9;
            const isPeer =
              selected !== null &&
              selected !== i &&
              (Math.floor(selected / 9) === row || selected % 9 === col || boxOf(selected) === boxOf(i));
            const classes = [
              "cell",
              given ? "given" : "",
              col === 2 || col === 5 ? "box-right" : "",
              row === 2 || row === 5 ? "box-bottom" : "",
              selected === i ? "selected" : "",
              isPeer ? "peer" : "",
              selectedValue !== 0 && value === selectedValue && selected !== i ? "same-value" : "",
              !given && conflicts[i] ? "conflict" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <div key={i} className={classes} onClick={() => setSelected(i)}>
                {value !== 0 ? (
                  value
                ) : notes[i] !== 0 ? (
                  <div className="cell-notes">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
                      <span key={d}>{notes[i]! & (1 << d) ? d : ""}</span>
                    ))}
                  </div>
                ) : (
                  ""
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Ad between the play field and the keyboard (Ezoic 102). */}
      <div id="ezoic-pub-ad-placeholder-102" className="midgame-ad" />

      <div className="numpad">
        <div className="dialpad">
          {[
            [1, 2, 3],
            [4, 5, 6],
            [7, 8, 9],
          ].map((row) => (
            <div className="numpad-row" key={row[0]}>
              {row.map((d) => (
                <button
                  key={d}
                  className={`key${digitCounts[d] === 9 ? " used-up" : ""}${notesMode ? " note-key" : ""}`}
                  onClick={() => enterDigit(d)}
                >
                  {d}
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="side-column">
          <button
            className={`key side-key${notesMode ? " active" : ""}`}
            onClick={() => setNotesMode((prev) => !prev)}
            aria-label={t.notes}
            aria-pressed={notesMode}
          >
            ✎
            <span className="side-key-label">{notesMode ? t.on : t.off}</span>
          </button>
          <button className="key side-key" onClick={clearCell} aria-label={t.eraseLabel}>
            ⌫
          </button>
          {isStuck && (
            <button className="key side-key" onClick={getUnstuck} aria-label={t.unstuck}>
              ⟲
              <span className="side-key-label">{t.unstuck}</span>
            </button>
          )}
        </div>
      </div>

      {showResult && won && (
        <div className="overlay" onClick={() => setShowResult(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div id="ezoic-pub-ad-placeholder-109" />
            <h2>{t.solved}</h2>
            <div className="big-time">{formatTime(elapsedMs)}</div>
            <div className="sub">
              Sudokudo #{puzzle.number} · {t.modes[mode].toLowerCase()} ·{" "}
              {t.difficulty[puzzle.difficulty as keyof typeof t.difficulty].toLowerCase()}
            </div>
            {isDaily && <StatsSection mode={mode} highlightNumber={puzzle.number} t={t} />}
            <button className="share-button" onClick={share}>
              {t.share}
            </button>
            <button className="close-link" onClick={() => setShowResult(false)}>
              {t.backToBoard}
            </button>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
