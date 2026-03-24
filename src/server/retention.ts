import { eq } from 'drizzle-orm'
import { db } from '#/db'
import { userRetention } from '#/db/schema'
import { logEvent } from '#/server/analytics'

/**
 * Update retention state after a completed study session.
 *
 * Logic:
 * 1. Fetch or create the user_retention row
 * 2. If new calendar day (UTC): reset currentDayXp, handle streak
 * 3. Add session XP to currentDayXp
 * 4. Streak rules:
 *    - lastActiveDate was yesterday → increment streak
 *    - lastActiveDate is today → do nothing (already counted)
 *    - gap > 1 day or null → reset streak to 1
 * 5. Update longestStreak if currentStreak exceeds it
 * 6. Check daily goal completion
 *
 * Fire-and-forget safe: caller should void the promise.
 */
export async function updateRetention(userId: string, sessionXp: number) {
  const now = new Date()
  const todayStr = toDateStr(now)

  // 1. Fetch or create
  let [row] = await db
    .select()
    .from(userRetention)
    .where(eq(userRetention.userId, userId))
    .limit(1)

  if (!row) {
    await db.insert(userRetention).values({
      userId,
      currentStreak: 0,
      longestStreak: 0,
      dailyGoalXp: 50,
      currentDayXp: 0,
    })
    ;[row] = await db
      .select()
      .from(userRetention)
      .where(eq(userRetention.userId, userId))
      .limit(1)
    if (!row) return // shouldn't happen
  }

  const lastDateStr = row.lastActiveDate ? toDateStr(row.lastActiveDate) : null
  const isNewDay = lastDateStr !== todayStr

  // 2. Compute new daily XP
  let newDayXp = isNewDay ? sessionXp : row.currentDayXp + sessionXp
  const wasGoalMetBefore = !isNewDay && row.currentDayXp >= row.dailyGoalXp

  // 3. Compute streak
  let newStreak = row.currentStreak
  let streakEvent: 'incremented' | 'lost' | null = null

  if (isNewDay) {
    if (lastDateStr && isYesterday(lastDateStr, todayStr)) {
      // Consecutive day
      newStreak = row.currentStreak + 1
      streakEvent = 'incremented'
    } else if (lastDateStr === todayStr) {
      // Same day — shouldn't reach here due to isNewDay check, but safety
    } else {
      // Gap > 1 day or first ever session
      if (row.currentStreak > 1) streakEvent = 'lost'
      newStreak = 1
    }
  }
  // If not a new day, streak stays the same

  // 4. Longest streak
  const newLongest = Math.max(row.longestStreak, newStreak)

  // 5. Write
  await db
    .update(userRetention)
    .set({
      currentStreak: newStreak,
      longestStreak: newLongest,
      lastActiveDate: now,
      currentDayXp: newDayXp,
      lastXpUpdateDate: now,
    })
    .where(eq(userRetention.userId, userId))

  // 6. Analytics events
  if (streakEvent === 'incremented') {
    logEvent({ userId, eventName: 'streak_incremented', properties: { streak: newStreak } })
    // Milestones
    if ([3, 7, 14, 30, 60, 100].includes(newStreak)) {
      logEvent({ userId, eventName: 'streak_milestone', properties: { streak: newStreak } })
    }
  } else if (streakEvent === 'lost') {
    logEvent({ userId, eventName: 'streak_lost', properties: { previousStreak: row.currentStreak } })
  }

  if (!wasGoalMetBefore && newDayXp >= row.dailyGoalXp) {
    logEvent({ userId, eventName: 'daily_goal_completed', properties: { goalXp: row.dailyGoalXp, actualXp: newDayXp } })
  }
}

/** Get retention state for a user. Returns null if no row exists. */
export async function getRetentionState(userId: string) {
  const [row] = await db
    .select()
    .from(userRetention)
    .where(eq(userRetention.userId, userId))
    .limit(1)
  if (!row) return null

  const todayStr = toDateStr(new Date())
  const lastDateStr = row.lastActiveDate ? toDateStr(row.lastActiveDate) : null
  const isToday = lastDateStr === todayStr

  return {
    currentStreak: row.currentStreak,
    longestStreak: row.longestStreak,
    dailyGoalXp: row.dailyGoalXp,
    currentDayXp: isToday ? row.currentDayXp : 0, // reset display if new day
    goalCompleted: isToday && row.currentDayXp >= row.dailyGoalXp,
    lastActiveDate: row.lastActiveDate,
  }
}

// ── Date helpers (UTC) ──────────────────────────────────────────

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function isYesterday(prev: string, today: string): boolean {
  const prevDate = new Date(prev + 'T00:00:00Z')
  const todayDate = new Date(today + 'T00:00:00Z')
  return todayDate.getTime() - prevDate.getTime() === 86_400_000
}
