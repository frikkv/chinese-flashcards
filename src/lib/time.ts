/**
 * Returns Monday 00:00:00 UTC of the current week as a Unix timestamp (ms).
 *
 * The leaderboard and weekly XP calculations all use this boundary so that
 * every user and every query agrees on when the week starts and ends.
 * Monday was chosen (rather than Sunday) to match the ISO week convention.
 */
export function getWeekStartTs(): number {
  const now = new Date()
  const dayOfWeek = now.getUTCDay() // 0=Sun, 1=Mon … 6=Sat
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  return Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - daysFromMonday,
  )
}
