import { z } from 'zod'
import {
  eq,
  or,
  and,
  desc,
  ilike,
  ne,
  inArray,
  count,
  sql,
  gte,
} from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure, publicProcedure } from './init'
import { db } from '#/db'
import {
  userProfiles,
  friendships,
  users,
  studySessions,
  flashcardProgress,
} from '#/db/schema'
import { hsk1Words, hsk2Words, lang1511Units } from '#/data/vocabulary'

const TOTAL_VOCAB =
  hsk1Words.length +
  hsk2Words.length +
  lang1511Units.reduce((sum, u) => sum + u.words.length, 0)

// ── HELPERS ────────────────────────────────────────────────────────

/**
 * Ensure a userProfile row exists for the given user.
 * Creates one lazily on first call, deriving username from email.
 */
async function ensureProfile(
  userId: string,
  info: { name: string; email: string },
) {
  const [existing] = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1)
  if (existing) return existing

  // Derive a username from email prefix, enforce uniqueness
  const base = info.email
    .split('@')[0]!
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .slice(0, 20)
  let username = base
  let attempt = 0
  while (true) {
    const [conflict] = await db
      .select({ u: userProfiles.username })
      .from(userProfiles)
      .where(eq(userProfiles.username, username))
      .limit(1)
    if (!conflict) break
    attempt++
    username = `${base}${attempt}`
  }

  await db.insert(userProfiles).values({
    userId,
    username,
    displayName: info.name || username,
    bio: null,
    usernameConfirmed: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  const [created] = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1)
  return created!
}

/**
 * Compute the friendship status between two users.
 * Returns direction-aware status so callers know which action buttons to show.
 */
type FriendStatus =
  | { status: 'self' }
  | { status: 'not_friends' }
  | { status: 'request_sent'; friendshipId: string }
  | { status: 'request_received'; friendshipId: string }
  | { status: 'friends'; friendshipId: string }

async function getFriendStatus(
  viewerId: string,
  targetUserId: string,
): Promise<FriendStatus> {
  if (viewerId === targetUserId) return { status: 'self' }

  const [outgoing] = await db
    .select()
    .from(friendships)
    .where(
      and(
        eq(friendships.senderId, viewerId),
        eq(friendships.receiverId, targetUserId),
      ),
    )
    .limit(1)
  if (outgoing?.status === 'pending')
    return { status: 'request_sent', friendshipId: outgoing.id }
  if (outgoing?.status === 'accepted')
    return { status: 'friends', friendshipId: outgoing.id }

  const [incoming] = await db
    .select()
    .from(friendships)
    .where(
      and(
        eq(friendships.senderId, targetUserId),
        eq(friendships.receiverId, viewerId),
      ),
    )
    .limit(1)
  if (incoming?.status === 'pending')
    return { status: 'request_received', friendshipId: incoming.id }
  if (incoming?.status === 'accepted')
    return { status: 'friends', friendshipId: incoming.id }

  return { status: 'not_friends' }
}

/**
 * Get public statistics for a user from existing session/progress tables.
 * Returns the same fields as getProfileStats so the public profile can render
 * the same Learning Statistics section as the private profile.
 */
async function getPublicStats(userId: string) {
  const [allSessions, cardRows] = await Promise.all([
    db
      .select()
      .from(studySessions)
      .where(eq(studySessions.userId, userId))
      .orderBy(desc(studySessions.completedAt)),
    db
      .select()
      .from(flashcardProgress)
      .where(eq(flashcardProgress.userId, userId)),
  ])

  // Aggregates
  const totalSessions = allSessions.length
  const totalCardsReviewed = allSessions.reduce(
    (sum, s) => sum + s.totalCount,
    0,
  )
  const totalCorrectAnswers = allSessions.reduce(
    (sum, s) => sum + s.correctCount,
    0,
  )
  const accuracy =
    totalCardsReviewed > 0
      ? Math.round((totalCorrectAnswers / totalCardsReviewed) * 100)
      : null
  const uniqueCardsStudied = cardRows.length

  // Weekly
  const todayMidnight = new Date()
  todayMidnight.setHours(0, 0, 0, 0)
  const todayTs = todayMidnight.getTime()
  const weekAgoTs = todayTs - 7 * 86_400_000
  const weeklySessions = allSessions.filter(
    (s) => new Date(s.completedAt).getTime() >= weekAgoTs,
  ).length
  const weeklyCardsReviewed = allSessions
    .filter((s) => new Date(s.completedAt).getTime() >= weekAgoTs)
    .reduce((sum, s) => sum + s.totalCount, 0)

  // Streak + best streak (same logic as getProfileStats)
  const dateTsSet = new Set(
    allSessions.map((s) => {
      const d = new Date(s.completedAt)
      d.setHours(0, 0, 0, 0)
      return d.getTime()
    }),
  )
  let streak = 0
  let cur = dateTsSet.has(todayTs) ? todayTs : todayTs - 86_400_000
  while (dateTsSet.has(cur)) {
    streak++
    cur -= 86_400_000
  }
  const sortedDates = [...dateTsSet].sort((a, b) => a - b)
  let bestStreak = 0
  let currentRun = 0
  let prevTs: number | null = null
  for (const ts of sortedDates) {
    if (prevTs === null || ts - prevTs === 86_400_000) currentRun++
    else currentRun = 1
    if (currentRun > bestStreak) bestStreak = currentRun
    prevTs = ts
  }

  // Last session (wordSetKey + wordSetDetail for the label)
  const lastSessionRow = allSessions[0]
  const lastSession = lastSessionRow
    ? {
        wordSetKey: lastSessionRow.wordSetKey,
        wordSetDetail: lastSessionRow.wordSetDetail,
      }
    : null

  // Words known + needs review (Known: ≥3 correct AND ≥80% accuracy)
  let wordsKnown = 0
  let needsReview = 0
  for (const c of cardRows) {
    if (c.timesAttempted > 0) {
      const acc = c.timesCorrect / c.timesAttempted
      if (c.timesCorrect >= 3 && acc >= 0.8) wordsKnown++
      else needsReview++
    }
  }

  return {
    totalSessions,
    totalCardsReviewed,
    totalCorrectAnswers,
    accuracy,
    uniqueCardsStudied,
    weeklySessions,
    weeklyCardsReviewed,
    streak,
    bestStreak,
    lastSession,
    wordsKnown,
    needsReview,
    wordsTotal: TOTAL_VOCAB,
    cards: cardRows.map((c) => ({
      cardId: c.cardId,
      timesCorrect: c.timesCorrect,
      timesAttempted: c.timesAttempted,
      lastSeenAt: c.lastSeenAt,
    })),
  }
}

// ── WEEK HELPER ────────────────────────────────────────────────────
/**
 * Returns Monday 00:00:00 UTC of the current week.
 * The leaderboard always resets at the start of Monday UTC so the boundary
 * is stable, server-side, and the same for every user.
 */
function getWeekStart(): Date {
  const now = new Date()
  const dayOfWeek = now.getUTCDay() // 0=Sun, 1=Mon … 6=Sat
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const monday = new Date(now)
  monday.setUTCDate(now.getUTCDate() - daysFromMonday)
  monday.setUTCHours(0, 0, 0, 0)
  return monday
}

// ── ROUTER ────────────────────────────────────────────────────────

export const socialRouter = createTRPCRouter({
  /** Search users by username or display name. Public. */
  searchUsers: publicProcedure
    .input(z.object({ query: z.string().min(1).max(50) }))
    .query(async ({ ctx, input }) => {
      const q = `%${input.query}%`
      const rows = await db
        .select({
          userId: userProfiles.userId,
          username: userProfiles.username,
          displayName: userProfiles.displayName,
        })
        .from(userProfiles)
        .where(
          or(
            ilike(userProfiles.username, q),
            ilike(userProfiles.displayName, q),
          ),
        )
        .limit(20)
      const viewerId = ctx.session?.user.id
      return rows.filter((r) => r.userId !== viewerId)
    }),

  /** Get a public profile by username. Public. */
  getProfile: publicProcedure
    .input(z.object({ username: z.string() }))
    .query(async ({ ctx, input }) => {
      const [profile] = await db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.username, input.username))
        .limit(1)
      if (!profile)
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found.' })

      const viewerId = ctx.session?.user.id

      const [userRows, stats, friendCountRows, friendStatus] =
        await Promise.all([
          db
            .select({ name: users.name, createdAt: users.createdAt })
            .from(users)
            .where(eq(users.id, profile.userId))
            .limit(1),
          getPublicStats(profile.userId),
          db
            .select({ c: count(friendships.id) })
            .from(friendships)
            .where(
              and(
                or(
                  eq(friendships.senderId, profile.userId),
                  eq(friendships.receiverId, profile.userId),
                ),
                eq(friendships.status, 'accepted'),
              ),
            ),
          viewerId
            ? getFriendStatus(viewerId, profile.userId)
            : Promise.resolve(null),
        ])

      const user = userRows[0]
      const friendCountRow = friendCountRows[0]

      return {
        userId: profile.userId,
        username: profile.username,
        displayName: profile.displayName,
        bio: profile.bio,
        joinedAt: user?.createdAt ?? null,
        stats,
        friendStatus,
        friendCount: friendCountRow?.c ?? 0,
      }
    }),

  /** List accepted friends of any user by userId. Public. */
  getFriendsOf: publicProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ input }) => {
      const rows = await db
        .select()
        .from(friendships)
        .where(
          and(
            or(
              eq(friendships.senderId, input.userId),
              eq(friendships.receiverId, input.userId),
            ),
            eq(friendships.status, 'accepted'),
          ),
        )
      if (rows.length === 0) return []
      const friendIds = rows.map((r) =>
        r.senderId === input.userId ? r.receiverId : r.senderId,
      )
      const profiles = await db
        .select({
          userId: userProfiles.userId,
          username: userProfiles.username,
          displayName: userProfiles.displayName,
        })
        .from(userProfiles)
        .where(inArray(userProfiles.userId, friendIds))
      return profiles
    }),

  /** Get or create own profile. Protected. */
  getMyProfile: protectedProcedure.query(async ({ ctx }) => {
    const profile = await ensureProfile(ctx.session.user.id, {
      name: ctx.session.user.name,
      email: ctx.session.user.email,
    })
    const [friendCountRow] = await db
      .select({ c: count(friendships.id) })
      .from(friendships)
      .where(
        and(
          or(
            eq(friendships.senderId, profile.userId),
            eq(friendships.receiverId, profile.userId),
          ),
          eq(friendships.status, 'accepted'),
        ),
      )
    return { ...profile, friendCount: friendCountRow?.c ?? 0 }
  }),

  /** Update own display name, username, or bio. Protected. */
  updateMyProfile: protectedProcedure
    .input(
      z.object({
        displayName: z.string().min(1).max(50).optional(),
        username: z
          .string()
          .min(2)
          .max(30)
          .regex(
            /^[a-z0-9_]+$/,
            'Lowercase letters, numbers, and underscores only.',
          )
          .optional(),
        bio: z.string().max(200).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      await ensureProfile(userId, {
        name: ctx.session.user.name,
        email: ctx.session.user.email,
      })

      if (input.username) {
        const [conflict] = await db
          .select({ u: userProfiles.userId })
          .from(userProfiles)
          .where(
            and(
              eq(userProfiles.username, input.username),
              ne(userProfiles.userId, userId),
            ),
          )
          .limit(1)
        if (conflict)
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Username already taken.',
          })
      }

      await db
        .update(userProfiles)
        .set({
          ...(input.displayName !== undefined && {
            displayName: input.displayName,
          }),
          ...(input.username !== undefined && { username: input.username }),
          ...(input.bio !== undefined && { bio: input.bio }),
          updatedAt: new Date(),
        })
        .where(eq(userProfiles.userId, userId))

      const [updated] = await db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.userId, userId))
        .limit(1)
      return updated!
    }),

  /**
   * First-login step: user picks their username and it's marked confirmed.
   * Also used when changing username from the profile page.
   */
  confirmUsername: protectedProcedure
    .input(
      z.object({
        username: z
          .string()
          .min(2)
          .max(30)
          .regex(
            /^[a-z0-9_]+$/,
            'Lowercase letters, numbers, and underscores only.',
          ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      await ensureProfile(userId, {
        name: ctx.session.user.name,
        email: ctx.session.user.email,
      })

      const [conflict] = await db
        .select({ u: userProfiles.userId })
        .from(userProfiles)
        .where(
          and(
            eq(userProfiles.username, input.username),
            ne(userProfiles.userId, userId),
          ),
        )
        .limit(1)
      if (conflict)
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Username already taken.',
        })

      await db
        .update(userProfiles)
        .set({
          username: input.username,
          usernameConfirmed: true,
          updatedAt: new Date(),
        })
        .where(eq(userProfiles.userId, userId))

      const [updated] = await db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.userId, userId))
        .limit(1)
      return updated!
    }),

  /**
   * Send a friend request to targetUserId.
   * If a reverse pending request exists, auto-accept it instead of creating a duplicate.
   */
  sendFriendRequest: protectedProcedure
    .input(z.object({ targetUserId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const senderId = ctx.session.user.id
      if (senderId === input.targetUserId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot send a friend request to yourself.',
        })
      }
      const [targetProfile] = await db
        .select({ userId: userProfiles.userId })
        .from(userProfiles)
        .where(eq(userProfiles.userId, input.targetUserId))
        .limit(1)
      if (!targetProfile)
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found.' })

      // Check existing outgoing relationship
      const [existing] = await db
        .select()
        .from(friendships)
        .where(
          and(
            eq(friendships.senderId, senderId),
            eq(friendships.receiverId, input.targetUserId),
          ),
        )
        .limit(1)
      if (existing) {
        if (existing.status === 'accepted')
          throw new TRPCError({ code: 'CONFLICT', message: 'Already friends.' })
        if (existing.status === 'pending')
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Friend request already sent.',
          })
        // Re-activate a previously canceled/declined row
        await db
          .update(friendships)
          .set({ status: 'pending', updatedAt: new Date() })
          .where(eq(friendships.id, existing.id))
        return { friendshipId: existing.id, autoAccepted: false }
      }

      // If target already sent us a request, auto-accept it (mutual interest)
      const [incoming] = await db
        .select()
        .from(friendships)
        .where(
          and(
            eq(friendships.senderId, input.targetUserId),
            eq(friendships.receiverId, senderId),
            eq(friendships.status, 'pending'),
          ),
        )
        .limit(1)
      if (incoming) {
        await db
          .update(friendships)
          .set({ status: 'accepted', updatedAt: new Date() })
          .where(eq(friendships.id, incoming.id))
        return { friendshipId: incoming.id, autoAccepted: true }
      }

      const id = crypto.randomUUID()
      await db.insert(friendships).values({
        id,
        senderId,
        receiverId: input.targetUserId,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      return { friendshipId: id, autoAccepted: false }
    }),

  /** Cancel an outgoing pending request you sent. */
  cancelFriendRequest: protectedProcedure
    .input(z.object({ friendshipId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const [row] = await db
        .select()
        .from(friendships)
        .where(
          and(
            eq(friendships.id, input.friendshipId),
            eq(friendships.senderId, userId),
            eq(friendships.status, 'pending'),
          ),
        )
        .limit(1)
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })
      await db
        .update(friendships)
        .set({ status: 'canceled', updatedAt: new Date() })
        .where(eq(friendships.id, input.friendshipId))
    }),

  /** Accept an incoming pending request. */
  acceptFriendRequest: protectedProcedure
    .input(z.object({ friendshipId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const [row] = await db
        .select()
        .from(friendships)
        .where(
          and(
            eq(friendships.id, input.friendshipId),
            eq(friendships.receiverId, userId),
            eq(friendships.status, 'pending'),
          ),
        )
        .limit(1)
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })
      await db
        .update(friendships)
        .set({ status: 'accepted', updatedAt: new Date() })
        .where(eq(friendships.id, input.friendshipId))
    }),

  /** Decline an incoming pending request. */
  declineFriendRequest: protectedProcedure
    .input(z.object({ friendshipId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const [row] = await db
        .select()
        .from(friendships)
        .where(
          and(
            eq(friendships.id, input.friendshipId),
            eq(friendships.receiverId, userId),
            eq(friendships.status, 'pending'),
          ),
        )
        .limit(1)
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })
      await db
        .update(friendships)
        .set({ status: 'declined', updatedAt: new Date() })
        .where(eq(friendships.id, input.friendshipId))
    }),

  /** Remove an accepted friend (either direction). */
  removeFriend: protectedProcedure
    .input(z.object({ friendshipId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const [row] = await db
        .select()
        .from(friendships)
        .where(
          and(
            eq(friendships.id, input.friendshipId),
            eq(friendships.status, 'accepted'),
            or(
              eq(friendships.senderId, userId),
              eq(friendships.receiverId, userId),
            ),
          ),
        )
        .limit(1)
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })
      await db.delete(friendships).where(eq(friendships.id, input.friendshipId))
    }),

  /** List accepted friends with their profiles. */
  listFriends: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id
    const rows = await db
      .select()
      .from(friendships)
      .where(
        and(
          or(
            eq(friendships.senderId, userId),
            eq(friendships.receiverId, userId),
          ),
          eq(friendships.status, 'accepted'),
        ),
      )
      .orderBy(desc(friendships.updatedAt))

    if (rows.length === 0) return []
    const friendIds = rows.map((r) =>
      r.senderId === userId ? r.receiverId : r.senderId,
    )
    const profiles = await db
      .select()
      .from(userProfiles)
      .where(inArray(userProfiles.userId, friendIds))

    const profileMap = new Map(profiles.map((p) => [p.userId, p]))
    return rows.map((r) => {
      const friendId = r.senderId === userId ? r.receiverId : r.senderId
      const profile = profileMap.get(friendId)
      return {
        friendshipId: r.id,
        userId: friendId,
        username: profile?.username ?? null,
        displayName: profile?.displayName ?? 'Unknown',
        since: r.updatedAt,
      }
    })
  }),

  /** List incoming pending requests. */
  listIncomingRequests: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id
    const rows = await db
      .select()
      .from(friendships)
      .where(
        and(
          eq(friendships.receiverId, userId),
          eq(friendships.status, 'pending'),
        ),
      )
      .orderBy(desc(friendships.createdAt))

    if (rows.length === 0) return []
    const senderIds = rows.map((r) => r.senderId)
    const profiles = await db
      .select()
      .from(userProfiles)
      .where(inArray(userProfiles.userId, senderIds))

    const profileMap = new Map(profiles.map((p) => [p.userId, p]))
    return rows.map((r) => {
      const profile = profileMap.get(r.senderId)
      return {
        friendshipId: r.id,
        userId: r.senderId,
        username: profile?.username ?? null,
        displayName: profile?.displayName ?? 'Unknown',
        sentAt: r.createdAt,
      }
    })
  }),

  /** List outgoing pending requests. */
  listOutgoingRequests: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id
    const rows = await db
      .select()
      .from(friendships)
      .where(
        and(
          eq(friendships.senderId, userId),
          eq(friendships.status, 'pending'),
        ),
      )
      .orderBy(desc(friendships.createdAt))

    if (rows.length === 0) return []
    const receiverIds = rows.map((r) => r.receiverId)
    const profiles = await db
      .select()
      .from(userProfiles)
      .where(inArray(userProfiles.userId, receiverIds))

    const profileMap = new Map(profiles.map((p) => [p.userId, p]))
    return rows.map((r) => {
      const profile = profileMap.get(r.receiverId)
      return {
        friendshipId: r.id,
        userId: r.receiverId,
        username: profile?.username ?? null,
        displayName: profile?.displayName ?? 'Unknown',
        sentAt: r.createdAt,
      }
    })
  }),

  /**
   * Weekly stats for the viewer + all their accepted friends.
   * Designed as the data source for a future weekly leaderboard.
   * Returns entries sorted by cards reviewed descending.
   */
  getFriendWeeklyStats: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)

    const rows = await db
      .select()
      .from(friendships)
      .where(
        and(
          or(
            eq(friendships.senderId, userId),
            eq(friendships.receiverId, userId),
          ),
          eq(friendships.status, 'accepted'),
        ),
      )

    const participantIds = [
      userId,
      ...rows.map((r) => (r.senderId === userId ? r.receiverId : r.senderId)),
    ]

    const stats = await db
      .select({
        userId: studySessions.userId,
        sessions: count(studySessions.id),
        cardsReviewed: sql<string>`coalesce(sum(${studySessions.totalCount}), 0)`,
        correctAnswers: sql<string>`coalesce(sum(${studySessions.correctCount}), 0)`,
      })
      .from(studySessions)
      .where(
        and(
          inArray(studySessions.userId, participantIds),
          sql`${studySessions.completedAt} >= ${weekAgo}`,
        ),
      )
      .groupBy(studySessions.userId)

    const profiles = await db
      .select()
      .from(userProfiles)
      .where(inArray(userProfiles.userId, participantIds))

    const profileMap = new Map(profiles.map((p) => [p.userId, p]))
    return stats
      .map((s) => {
        const profile = profileMap.get(s.userId)
        return {
          userId: s.userId,
          username: profile?.username ?? null,
          displayName: profile?.displayName ?? 'Unknown',
          isMe: s.userId === userId,
          sessions: s.sessions,
          cardsReviewed: parseInt(s.cardsReviewed),
          correctAnswers: parseInt(s.correctAnswers),
        }
      })
      .sort((a, b) => b.cardsReviewed - a.cardsReviewed)
  }),

  /**
   * Weekly friends leaderboard.
   *
   * XP formula:  XP = sum(correctCount) + completedSessions × 5
   *   - 1 correct answer  = 1 XP   (rewards accuracy)
   *   - 1 completed session = +5 XP bonus (rewards consistency)
   *
   * Week boundary: Monday 00:00 UTC (calendar week, stable for all users).
   *
   * Includes every accepted friend + the current user, even those with 0 XP
   * this week, so the leaderboard always shows the full comparison set.
   *
   * Tie-breaking (deterministic):
   *   1. Higher XP
   *   2. More recent session this week (lastActiveAt)
   *   3. Username / userId alphabetically
   *
   * Two DB queries total (no N+1):
   *   1. Aggregate weekly session stats for all participants
   *   2. Fetch profiles for all participants
   */
  getWeeklyLeaderboard: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id
    const weekStart = getWeekStart()

    // 1. Accepted friends (either direction)
    const friendRows = await db
      .select()
      .from(friendships)
      .where(
        and(
          or(
            eq(friendships.senderId, userId),
            eq(friendships.receiverId, userId),
          ),
          eq(friendships.status, 'accepted'),
        ),
      )

    const participantIds = [
      userId,
      ...friendRows.map((r) =>
        r.senderId === userId ? r.receiverId : r.senderId,
      ),
    ]

    // 2. Weekly session stats — single grouped query, uses (userId, completedAt) index
    const weeklyStats = await db
      .select({
        userId: studySessions.userId,
        sessions: count(studySessions.id),
        correctAnswers: sql<string>`coalesce(sum(${studySessions.correctCount}), 0)`,
        cardsReviewed: sql<string>`coalesce(sum(${studySessions.totalCount}), 0)`,
        lastActiveAt: sql<string>`max(${studySessions.completedAt})`,
      })
      .from(studySessions)
      .where(
        and(
          inArray(studySessions.userId, participantIds),
          gte(studySessions.completedAt, weekStart),
        ),
      )
      .groupBy(studySessions.userId)

    // 3. Profiles for all participants
    const profiles = await db
      .select()
      .from(userProfiles)
      .where(inArray(userProfiles.userId, participantIds))

    const statsMap = new Map(weeklyStats.map((s) => [s.userId, s]))
    const profileMap = new Map(profiles.map((p) => [p.userId, p]))

    // 4. Build entries for ALL participants (0-XP entries included)
    const entries = participantIds.map((pid) => {
      const s = statsMap.get(pid)
      const profile = profileMap.get(pid)
      const correctAnswers = parseInt(s?.correctAnswers ?? '0')
      const sessions = s?.sessions ?? 0
      const cardsReviewed = parseInt(s?.cardsReviewed ?? '0')
      const xp = correctAnswers + sessions * 5
      const lastActiveAt = s?.lastActiveAt ? new Date(s.lastActiveAt) : null

      return {
        userId: pid,
        username: profile?.username ?? null,
        displayName: profile?.displayName ?? 'Unknown',
        isMe: pid === userId,
        xp,
        correctAnswers,
        sessions,
        cardsReviewed,
        lastActiveAt,
      }
    })

    // 5. Sort: XP desc → lastActiveAt desc → username asc (stable tie-break)
    entries.sort((a, b) => {
      if (b.xp !== a.xp) return b.xp - a.xp
      const aTime = a.lastActiveAt?.getTime() ?? 0
      const bTime = b.lastActiveAt?.getTime() ?? 0
      if (bTime !== aTime) return bTime - aTime
      return (a.username ?? a.userId).localeCompare(b.username ?? b.userId)
    })

    // 6. Assign ranks — tied XP shares the same rank
    let currentRank = 1
    const ranked = entries.map((entry, idx) => {
      if (idx > 0 && entry.xp < entries[idx - 1]!.xp) {
        currentRank = idx + 1
      }
      return { ...entry, rank: currentRank }
    })

    return {
      entries: ranked,
      weekStart: weekStart.toISOString(),
      hasFriends: participantIds.length > 1,
    }
  }),
})
