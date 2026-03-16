import { relations } from 'drizzle-orm'
import {
  pgTable,
  text,
  timestamp,
  boolean,
  index,
  integer,
  primaryKey,
} from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
})

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [index('sessions_userId_idx').on(table.userId)],
)

export const accounts = pgTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index('accounts_userId_idx').on(table.userId)],
)

export const verifications = pgTable(
  'verifications',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index('verifications_identifier_idx').on(table.identifier)],
)

// ── USER LAST SESSION ─────────────────────────────────────────────
// One row per user. Upserted on every session start so it survives logout/login.
export const userLastSession = pgTable('user_last_session', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  wordSetKey: text('word_set_key').notNull(),
  wordSetDetail: text('word_set_detail').notNull(),
  mode: text('mode').notNull(),
  sessionSize: integer('session_size').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ── FLASHCARD PROGRESS ────────────────────────────────────────────
// Stable cardId is the hanzi character(s), e.g. "爱". One row per user+card.
export const flashcardProgress = pgTable(
  'flashcard_progress',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    cardId: text('card_id').notNull(),
    timesCorrect: integer('times_correct').notNull().default(0),
    timesAttempted: integer('times_attempted').notNull().default(0),
    lastSeenAt: timestamp('last_seen_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.cardId] }),
    index('flashcard_progress_userId_idx').on(table.userId),
  ],
)

// ── STUDY SESSIONS ────────────────────────────────────────────────
// One row per completed session. Query latest for "last studied" display.
export const studySessions = pgTable(
  'study_sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // e.g. "hsk", "lang1511"
    wordSetKey: text('word_set_key').notNull(),
    // comma-separated levels or units, e.g. "1,2" or "1,3,5"
    wordSetDetail: text('word_set_detail').notNull().default(''),
    // e.g. "study:1", "study:2", "study:3", "sound", "tone"
    mode: text('mode').notNull(),
    // session size setting: 10, 20, or 30 (30 = all)
    sessionSize: integer('session_size').notNull(),
    correctCount: integer('correct_count').notNull(),
    totalCount: integer('total_count').notNull(),
    completedAt: timestamp('completed_at').defaultNow().notNull(),
  },
  (table) => [index('study_sessions_userId_idx').on(table.userId)],
)

// ── CHAT MESSAGES ─────────────────────────────────────────────────
// Saved for logged-in users only. Anonymous chat is processed but not stored.
export const chatMessages = pgTable(
  'chat_messages',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull().$type<'user' | 'assistant'>(),
    content: text('content').notNull(),
    cardContext: text('card_context'), // JSON: { char, pinyin, english, category? }
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('chat_messages_userId_idx').on(table.userId)],
)

// ── DISTRACTOR SETS ───────────────────────────────────────────────
// One row per vocab word. Cached AI-generated wrong answer choices.
export const distractorSets = pgTable(
  'distractor_sets',
  {
    id: text('id').primaryKey(),
    vocabKey: text('vocab_key').notNull(),
    correctAnswer: text('correct_answer').notNull(),
    distractorsJson: text('distractors_json').notNull(),
    source: text('source').notNull().$type<'ai' | 'fallback'>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('distractor_sets_vocabKey_idx').on(table.vocabKey)],
)

// ── CUSTOM WORD SETS ──────────────────────────────────────────────
// User-uploaded word sets generated from documents via AI.
export const customWordSets = pgTable(
  'custom_word_sets',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    // JSON array of { char, pinyin, english }
    wordsJson: text('words_json').notNull(),
    wordCount: integer('word_count').notNull(),
    sourceFileName: text('source_file_name'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('custom_word_sets_userId_idx').on(table.userId)],
)

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
}))

export const sessionsRelations = relations(sessions, ({ one }) => ({
  users: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}))

export const accountsRelations = relations(accounts, ({ one }) => ({
  users: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
}))
