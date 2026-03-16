/**
 * All-time XP formula (matches leaderboard weekly formula but accumulated):
 *   XP = sum(correctCount across all sessions) + totalSessions × 5
 *
 * Level thresholds are calibrated for a user doing ~1-2 sessions/day at ~80%
 * accuracy on 20-card sessions (~21 XP/session):
 *
 *  Lv 1 → 2:   ~2 active days
 *  Lv 2 → 3:   ~2 weeks active
 *  Lv 3 → 4:   ~5 weeks active
 *  Lv 4 → 5:   ~2-3 months
 *  Lv 5 → 6:   ~6-7 months
 *  Lv 6 → 7:   ~18 months
 */
export const LEVELS = [
  { level: 1, title: 'Beginner',     minXP: 0 },
  { level: 2, title: 'Student',      minXP: 50 },
  { level: 3, title: 'Scholar',      minXP: 250 },
  { level: 4, title: 'Practitioner', minXP: 750 },
  { level: 5, title: 'Expert',       minXP: 2_000 },
  { level: 6, title: 'Master',       minXP: 6_000 },
  { level: 7, title: 'Legend',       minXP: 15_000 },
] as const

export type LevelInfo = {
  level: number
  title: string
  xp: number
  /** XP at the start of this level */
  levelStartXP: number
  /** XP needed to reach the next level (null at max level) */
  xpToNext: number | null
  /** XP earned within the current level */
  xpIntoLevel: number
  /** 0–1 fraction through the current level */
  progress: number
  isMaxLevel: boolean
}

export function computeXP(totalCorrect: number, totalSessions: number): number {
  return totalCorrect + totalSessions * 5
}

export function getLevelInfo(xp: number): LevelInfo {
  const maxIdx = LEVELS.length - 1

  // Find the highest level the user has reached
  let idx = maxIdx
  for (let i = 0; i < LEVELS.length; i++) {
    if (xp < LEVELS[i]!.minXP) {
      idx = i - 1
      break
    }
  }
  // Clamp to valid range
  if (idx < 0) idx = 0

  const current = LEVELS[idx]!
  const next = idx < maxIdx ? LEVELS[idx + 1]! : null

  const levelStartXP = current.minXP
  const xpIntoLevel = xp - levelStartXP
  const levelSpan = next ? next.minXP - levelStartXP : null
  const progress = levelSpan ? Math.min(xpIntoLevel / levelSpan, 1) : 1
  const xpToNext = next ? next.minXP - xp : null

  return {
    level: current.level,
    title: current.title,
    xp,
    levelStartXP,
    xpToNext,
    xpIntoLevel,
    progress,
    isMaxLevel: idx === maxIdx,
  }
}
