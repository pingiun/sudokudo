import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import * as account from "./game/api.js";
import { useDailyPuzzle } from "./game/useDailyPuzzle.js";
import { Game } from "./game/Game.jsx";
import { DIFFICULTIES, type Difficulty } from "./engine/grader.js";
import { StatsSection } from "./game/StatsSection.jsx";
import { STRINGS, detectLang, saveLang, type Lang } from "./i18n.js";
import { EPOCH_UTC, dateKey, puzzleNumber, type Mode } from "./engine/daily.js";

/** Header icon exactly as woordle.nl draws it (30×30 SVG, 1.6 stroke). */
function HeaderIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="30"
      height="30"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export function App() {
  const today = useMemo(() => new Date(), []);
  const [mode, setMode] = useState<Mode>(() =>
    localStorage.getItem("sudokudo:mode") === "expert" ? "expert" : "normal",
  );
  // ?difficulty=… overrides the day's schedule (for testing). Accepts the
  // internal tier ids, and the display names (Dutch or English) resolved
  // relative to the active mode: ?difficulty=moeilijk is brisk in gewoon
  // and hard in expert.
  const difficultyOverride = useMemo(() => {
    const raw = new URLSearchParams(window.location.search).get("difficulty")?.toLowerCase();
    if (!raw) return undefined;
    if (DIFFICULTIES.includes(raw as Difficulty)) return raw as Difficulty;
    const ladder: Difficulty[] =
      mode === "expert" ? ["easy", "medium", "hard"] : ["beginner", "relaxed", "brisk"];
    const index = { makkelijk: 0, gemiddeld: 1, moeilijk: 2 }[raw];
    return index === undefined ? undefined : ladder[index];
  }, [mode]);
  // Before launch day the site shows a countdown; ?preview bypasses it so
  // the real site can be tested (and developed) ahead of launch.
  const preLaunch = useMemo(
    () =>
      puzzleNumber(today) < 1 && !new URLSearchParams(window.location.search).has("preview"),
    [today],
  );
  const switchMode = (next: Mode) => {
    localStorage.setItem("sudokudo:mode", next);
    setMode(next);
  };
  const puzzle = useDailyPuzzle(today, mode, difficultyOverride, !preLaunch);
  const [showHelp, setShowHelp] = useState(false);
  const [showStats, setShowStats] = useState(false);
  // The stats modal has its own mode tab, opening on the mode being played.
  const [statsMode, setStatsMode] = useState<Mode>(mode);
  const [showSettings, setShowSettings] = useState(false);
  const [lang, setLang] = useState<Lang>(detectLang);
  const t = STRINGS[lang];
  const [email, setEmail] = useState<string | null>(account.getEmail());

  useEffect(() => {
    void account.handleAuthCallback().then(async (loggedIn) => {
      if (loggedIn) {
        setEmail(account.getEmail());
      } else {
        // Detect single sign-off from elsewhere: revalidate the session.
        setEmail(await account.validateSession());
      }
      void account.flushQueue();
    });
  }, []);

  const switchLang = (next: Lang) => {
    saveLang(next);
    setLang(next);
  };

  return (
    <div className="app">
      <header className="header">
        <button className="icon-button" aria-label={t.howToPlay} onClick={() => setShowHelp(true)}>
          <HeaderIcon>
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </HeaderIcon>
        </button>
        <span className="header-title">Sudokudo</span>
        <div className="header-buttons">
          <button
            className="icon-button"
            aria-label={t.statsLabel}
            onClick={() => {
              setStatsMode(mode);
              setShowStats(true);
            }}
          >
            <HeaderIcon>
              <circle cx="12" cy="12" r="10" />
              <line x1="8" y1="16" x2="8" y2="12" />
              <line x1="12" y1="16" x2="12" y2="7.5" />
              <line x1="16" y1="16" x2="16" y2="10" />
            </HeaderIcon>
          </button>
          <button
            className="icon-button"
            aria-label={t.settings}
            onClick={() => setShowSettings(true)}
          >
            <HeaderIcon>
              <circle cx="12" cy="12" r="10" />
              {["7", "12", "17"].map((x) => (
                <circle key={x} cx={x} cy="12" r="1.4" fill="currentColor" stroke="none" />
              ))}
            </HeaderIcon>
          </button>
        </div>
      </header>

      {!preLaunch && (
        <div className="mode-switch">
          {(["normal", "expert"] as const).map((m) => (
            <button
              key={m}
              className={`mode-button${mode === m ? " active" : ""}`}
              onClick={() => switchMode(m)}
            >
              {t.modes[m]}
            </button>
          ))}
        </div>
      )}

      {preLaunch ? (
        <div className="countdown">
          <div className="countdown-days">{t.startsIn(1 - puzzleNumber(today))}</div>
          <p className="sub">{t.comingSoon}</p>
          <div className="countdown-date">{dateKey(new Date(EPOCH_UTC))}</div>
        </div>
      ) : puzzle ? (
        <Game
          key={`${puzzle.date}:${mode}:${difficultyOverride ?? "daily"}:${lang}`}
          puzzle={puzzle}
          mode={mode}
          variant={difficultyOverride ? `${mode}:${difficultyOverride}` : mode}
          isDaily={!difficultyOverride}
          t={t}
        />
      ) : (
        <div className="loading">{t.preparing}</div>
      )}

      {showStats && (
        <div className="overlay" onClick={() => setShowStats(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="mode-switch in-modal">
              {(["normal", "expert"] as const).map((m) => (
                <button
                  key={m}
                  className={`mode-button${statsMode === m ? " active" : ""}`}
                  onClick={() => setStatsMode(m)}
                >
                  {t.modes[m]}
                </button>
              ))}
            </div>
            <StatsSection mode={statsMode} highlightNumber={puzzle?.number} t={t} />
            <button className="close-link" onClick={() => setShowStats(false)}>
              {t.close}
            </button>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="overlay" onClick={() => setShowSettings(false)}>
          <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
            <div className="stats-title">{t.settings}</div>
            <div className="settings-row">
              <span>{email ? t.loggedInAs(email) : t.account}</span>
              {email ? (
                <button
                  className="lang-button"
                  onClick={() => {
                    void account.logout();
                    setEmail(null);
                  }}
                >
                  {t.logoutButton}
                </button>
              ) : (
                <button
                  className="lang-button active"
                  onClick={() => {
                    window.location.href = account.loginUrl();
                  }}
                >
                  {t.login}
                </button>
              )}
            </div>
            <div className="hairline" />
            <div className="settings-row">
              <span>{t.language}</span>
              <div className="lang-row">
                <button
                  className={`lang-button${lang === "en" ? " active" : ""}`}
                  onClick={() => switchLang("en")}
                >
                  EN
                </button>
                <button
                  className={`lang-button${lang === "nl" ? " active" : ""}`}
                  onClick={() => switchLang("nl")}
                >
                  NL
                </button>
              </div>
            </div>
            <div className="hairline" />
            <p className="settings-text">
              {t.feedback}{" "}
              <a href="https://github.com/pingiun/sudokudo" target="_blank" rel="noreferrer">
                GitHub
              </a>
            </p>
            <div className="hairline" />
            <p className="settings-footer">{t.footer}</p>
            <p className="settings-footer">BTW Nr: NL004111081B24</p>
            <button className="close-link" onClick={() => setShowSettings(false)}>
              {t.close}
            </button>
          </div>
        </div>
      )}

      {showHelp && (
        <div className="overlay" onClick={() => setShowHelp(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Sudokudo</h2>
            <p className="sub">{t.helpText}</p>
            <button className="share-button" onClick={() => setShowHelp(false)}>
              {t.play}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
