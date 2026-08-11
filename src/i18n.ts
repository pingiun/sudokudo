/**
 * UI strings in English and Dutch. The language is auto-detected from the
 * browser (nl-* → Dutch), can be switched in the help screen, and the choice
 * persists in localStorage.
 */

import type { Difficulty } from "./engine/grader.js";
import type { Mode } from "./engine/daily.js";

export type Lang = "en" | "nl";

export interface Strings {
  difficulty: Record<Difficulty, string>;
  modes: Record<Mode, string>;
  howToPlay: string;
  helpText: string;
  play: string;
  preparing: string;
  statistics: string;
  played: string;
  winPercent: string;
  currentStreak: string;
  maxStreak: string;
  solveTimes: string;
  solved: string;
  share: string;
  backToBoard: string;
  close: string;
  copied: string;
  allCorrect: string;
  removedWrong: (n: number) => string;
  notes: string;
  on: string;
  off: string;
  unstuck: string;
  eraseLabel: string;
  statsLabel: string;
  menuTime: string;
  settings: string;
  language: string;
  feedback: string;
  footer: string;
  comingSoon: string;
  startsIn: (days: number) => string;
  account: string;
  login: string;
  loggedInAs: (email: string) => string;
  logoutButton: string;
}

const en: Strings = {
  difficulty: {
    beginner: "Beginner",
    relaxed: "Relaxed",
    brisk: "Brisk",
    easy: "Easy",
    medium: "Medium",
    hard: "Hard",
  },
  modes: { normal: "Normal", expert: "Expert" },
  howToPlay: "How to play",
  helpText:
    "Fill the grid so every row, column and 3×3 box contains the digits 1–9 exactly once. " +
    "Everyone gets the same puzzle each day — solve it fast and share your time!",
  play: "Play",
  preparing: "Preparing today's puzzle…",
  statistics: "Statistics",
  played: "played",
  winPercent: "Win %",
  currentStreak: "Current streak",
  maxStreak: "Max streak",
  solveTimes: "Solve times",
  solved: "Solved!",
  share: "Share",
  backToBoard: "Back to the board",
  close: "Close",
  copied: "Copied to clipboard!",
  allCorrect: "Everything you've placed is correct — keep going!",
  removedWrong: (n) => `Removed ${n} wrong ${n === 1 ? "entry" : "entries"}`,
  notes: "Toggle notes",
  on: "on",
  off: "off",
  unstuck: "unstuck",
  eraseLabel: "Erase",
  statsLabel: "Statistics",
  menuTime: "min",
  settings: "Settings",
  language: "Language",
  feedback: "Feedback:",
  footer: "Sudokudo is a game by pingiun solutions",
  comingSoon: "A new sudoku every day. Everyone gets the same puzzle — race your friends!",
  startsIn: (days) => (days === 1 ? "Starts tomorrow!" : `Starts in ${days} days`),
  account: "Account",
  login: "Log in",
  loggedInAs: (email) => `Logged in as ${email}`,
  logoutButton: "Log out",
};

const nl: Strings = {
  difficulty: {
    beginner: "Beginner",
    relaxed: "Ontspannen",
    brisk: "Vlot",
    easy: "Makkelijk",
    medium: "Gemiddeld",
    hard: "Moeilijk",
  },
  modes: { normal: "Normaal", expert: "Expert" },
  howToPlay: "Uitleg",
  helpText:
    "Vul het diagram zo in dat elke rij, kolom en elk 3×3-blok de cijfers 1–9 precies één keer bevat. " +
    "Iedereen krijgt elke dag dezelfde puzzel — los hem snel op en deel je tijd!",
  play: "Spelen",
  preparing: "De puzzel van vandaag wordt gemaakt…",
  statistics: "Statistiek",
  played: "gespeeld",
  winPercent: "Win %",
  currentStreak: "Huidige reeks",
  maxStreak: "Max reeks",
  solveTimes: "Oplostijden",
  solved: "Opgelost!",
  share: "Delen",
  backToBoard: "Terug naar de puzzel",
  close: "Sluiten",
  copied: "Gekopieerd naar het klembord!",
  allCorrect: "Alles wat je hebt ingevuld klopt — ga zo door!",
  removedWrong: (n) => `${n} ${n === 1 ? "fout cijfer" : "foute cijfers"} verwijderd`,
  notes: "Notities aan/uit",
  on: "aan",
  off: "uit",
  unstuck: "herstel",
  eraseLabel: "Wissen",
  statsLabel: "Statistiek",
  menuTime: "min",
  settings: "Instellingen",
  language: "Taal",
  feedback: "Feedback:",
  footer: "Sudokudo is een spelletje van pingiun solutions",
  comingSoon: "Elke dag een nieuwe sudoku. Iedereen krijgt dezelfde puzzel — race tegen je vrienden!",
  startsIn: (days) => (days === 1 ? "Begint morgen!" : `Begint over ${days} dagen`),
  account: "Account",
  login: "Inloggen",
  loggedInAs: (email) => `Ingelogd als ${email}`,
  logoutButton: "Uitloggen",
};

export const STRINGS: Record<Lang, Strings> = { en, nl };

const LANG_KEY = "sudokudo:lang";

export function detectLang(): Lang {
  try {
    const stored = localStorage.getItem(LANG_KEY);
    if (stored === "en" || stored === "nl") return stored;
  } catch {
    // storage unavailable — fall through to browser detection
  }
  return navigator.language?.toLowerCase().startsWith("nl") ? "nl" : "en";
}

export function saveLang(lang: Lang): void {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // non-fatal
  }
}
