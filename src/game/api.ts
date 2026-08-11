/**
 * Client for the jellespelletjes account API: login via the hub (SSO code
 * exchange), verified result submission with a small retry queue, and a
 * one-time import of pre-account local stats.
 *
 * Everything is optional: without a token the game behaves exactly as before.
 */

import { GENERATOR_VERSION } from "../engine/daily.js";
import { loadStats } from "./storage.js";

// localStorage overrides make local development possible
// (e.g. jsp:api-base = http://127.0.0.1:8931, jsp:hub-base = http://localhost:8899).
const API = () => localStorage.getItem("jsp:api-base") || "https://api.jellespelletjes.nl";
const HUB = () => localStorage.getItem("jsp:hub-base") || "https://jellespelletjes.nl";

const TOKEN_KEY = "sudokudo:auth-token";
const EMAIL_KEY = "sudokudo:auth-email";
const QUEUE_KEY = "sudokudo:sync-queue";
const IMPORTED_KEY = "sudokudo:stats-imported";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const getEmail = () => localStorage.getItem(EMAIL_KEY);

export function loginUrl(): string {
  return `${HUB()}/login/?origin=${encodeURIComponent(window.location.origin)}`;
}

async function api(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; json: unknown }> {
  const token = getToken();
  const response = await fetch(API() + path, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    // no body
  }
  // Single sign-off: a 401 with a token present means the session was revoked
  // (e.g. logout on another site or device) — drop the local login state.
  if (response.status === 401 && token) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EMAIL_KEY);
  }
  return { ok: response.ok, status: response.status, json };
}

/**
 * Check that the stored session is still valid (it may have been revoked by
 * a logout elsewhere). Returns the email when logged in, null otherwise.
 */
export async function validateSession(): Promise<string | null> {
  if (!getToken()) return null;
  try {
    const { ok } = await api("GET", "/me");
    return ok ? getEmail() : null;
  } catch {
    // offline: keep the local state, assume still logged in
    return getEmail();
  }
}

/**
 * Handle the /auth/callback route: consume the SSO code from the URL fragment,
 * store the session, kick off the one-time stats import, and clean the URL.
 * Returns true if a login was completed.
 */
export async function handleAuthCallback(): Promise<boolean> {
  if (window.location.pathname !== "/auth/callback") return false;
  const code = new URLSearchParams(window.location.hash.slice(1)).get("code");
  window.history.replaceState(null, "", "/");
  if (!code) return false;
  const response = await fetch(API() + "/auth/sso-code/consume", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!response.ok) return false;
  const data = (await response.json()) as { token: string; user: { email: string } };
  localStorage.setItem(TOKEN_KEY, data.token);
  localStorage.setItem(EMAIL_KEY, data.user.email);
  void importLocalStatsOnce();
  void flushQueue();
  return true;
}

export async function logout(): Promise<void> {
  // Capture the token BEFORE clearing local state — the server call needs it
  // to revoke every session (single sign-off).
  const token = getToken();
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EMAIL_KEY);
  if (token) {
    try {
      await fetch(API() + "/logout", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: "{}",
      });
    } catch {
      // best effort; sessions expire server-side eventually
    }
  }
}

/** Upload the pre-account aggregate stats per mode, once each (409 = already done elsewhere). */
async function importLocalStatsOnce(): Promise<void> {
  for (const [mode, game] of [
    ["normal", "sudokudo"],
    ["expert", "sudokudo-expert"],
  ] as const) {
    const flag = `${IMPORTED_KEY}:${game}`;
    if (localStorage.getItem(flag)) continue;
    const stats = loadStats(mode);
    if (stats.gamesPlayed === 0) {
      localStorage.setItem(flag, "1");
      continue;
    }
    try {
      const { ok, status } = await api("POST", `/import/${game}`, stats);
      if (ok || status === 409) localStorage.setItem(flag, "1");
    } catch {
      // retried on next login/load
    }
  }
}

interface QueuedResult {
  game: string;
  day: number;
  submission: unknown;
}

function readQueue(): QueuedResult[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]") as QueuedResult[];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedResult[]): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

/** Server game id per mode; expert is a separate leaderboard-able game. */
const gameId = (mode: string) => (mode === "expert" ? "sudokudo-expert" : "sudokudo");

/** Submit a finished daily puzzle; queues for retry on network failure. */
export async function submitResult(
  mode: string,
  puzzleNumber: number,
  solution: number[],
  startedAt: number,
  finishedAt: number,
): Promise<void> {
  if (!getToken()) return;
  const submission = {
    solution: solution.join(""),
    started_at_ms: startedAt,
    finished_at_ms: finishedAt,
    generator_version: GENERATOR_VERSION,
  };
  const item = { game: gameId(mode), day: puzzleNumber, submission };
  const delivered = await tryDeliver(item);
  if (!delivered) {
    const queue = readQueue().filter((q) => !(q.game === item.game && q.day === item.day));
    queue.push(item);
    writeQueue(queue);
  }
}

async function tryDeliver(item: QueuedResult): Promise<boolean> {
  try {
    const { ok, status } = await api("PUT", `/results/${item.game ?? "sudokudo"}/${item.day}`, item.submission);
    // 4xx responses are terminal (verified-conflict, rejected, expired session):
    // retrying the identical payload will never succeed, so drop it.
    return ok || (status >= 400 && status < 500);
  } catch {
    return false;
  }
}

/** Retry any queued submissions (called on load and after login). */
export async function flushQueue(): Promise<void> {
  if (!getToken()) return;
  const queue = readQueue();
  if (queue.length === 0) return;
  const remaining: QueuedResult[] = [];
  for (const item of queue) {
    if (!(await tryDeliver(item))) remaining.push(item);
  }
  writeQueue(remaining);
}
