import { TIME_BUCKET_LABELS, loadStats } from "./storage.js";
import type { Strings } from "../i18n.js";

/**
 * Statistics block, layout copied from woordle.nl's stats screen: a 4-stat
 * row (big number over small label) and a horizontal bar distribution —
 * woordle's guess counts replaced by solve-time buckets.
 * `highlightNumber`: today's puzzle number; the most recent win's bar shows
 * green while it is today's (like woordle's green row for the current game).
 */
export function StatsSection({
  mode,
  highlightNumber,
  t,
}: {
  mode: string;
  highlightNumber?: number;
  t: Strings;
}) {
  const stats = loadStats(mode);
  const winPercentage =
    stats.gamesPlayed === 0 ? 0 : Math.round((stats.gamesWon / stats.gamesPlayed) * 100);
  const maxBucket = Math.max(1, ...stats.buckets);
  const highlight =
    highlightNumber !== undefined && stats.lastWonNumber === highlightNumber
      ? stats.lastWonBucket
      : null;

  return (
    <div className="stats">
      <div className="stats-title">{t.statistics}</div>
      <div className="stats-row">
        <div className="stat">
          <div className="stat-value">{stats.gamesPlayed}×</div>
          <div className="stat-label">{t.played}</div>
        </div>
        <div className="stat">
          <div className="stat-value">{winPercentage}</div>
          <div className="stat-label">{t.winPercent}</div>
        </div>
        <div className="stat">
          <div className="stat-value">{stats.currentStreak}</div>
          <div className="stat-label">{t.currentStreak}</div>
        </div>
        <div className="stat">
          <div className="stat-value">{stats.maxStreak}</div>
          <div className="stat-label">{t.maxStreak}</div>
        </div>
      </div>
      <div className="stats-title">{t.solveTimes}</div>
      <div className="stats-bars">
        {TIME_BUCKET_LABELS.map((label, i) => (
          <div className="stats-bar-row" key={label}>
            <span className="stats-bar-label">{label}</span>
            <div
              className={`stats-bar${i === highlight ? " current" : ""}`}
              style={{ width: `${Math.max(9, (stats.buckets[i]! / maxBucket) * 100)}%` }}
            >
              {stats.buckets[i]}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
