# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # Start dev server (port 3000)
pnpm build        # Production build
pnpm test         # Run tests with Vitest
pnpm lint         # Run ESLint
pnpm check        # Fix formatting and linting (prettier --write + eslint --fix)

# Database (see "Database Workflow" section below)
pnpm drizzle-kit generate   # Generate migration from schema changes (REQUIRED)
pnpm drizzle-kit migrate    # Apply migrations to DB (REQUIRED)
pnpm db:push                # Push schema directly — LOCAL PROTOTYPING ONLY
pnpm db:studio              # Open Drizzle Studio
pnpm db:gen-distractors     # Pre-generate AI distractors for all vocab words

# Audio
pnpm audio:generate  # Generate OpenAI TTS MP3s for all vocab words → public/audio/
```

To add shadcn components:

```bash
pnpm dlx shadcn@latest add <component>
```

## Architecture

**TanStack Start** (full-stack React) with file-based routing, **tRPC** for type-safe API, **Drizzle ORM** + PostgreSQL (Supabase), and **Better Auth** for authentication. Deployed on **Vercel** via Nitro (preset `vercel`, configured in `vite.config.ts`).

### Key paths

**Routes** (`src/routes/`):

- `__root.tsx` — Root layout (brand font LCP optimisation, ThemeProvider, username setup modal)
- `index.tsx` — Study session orchestrator: auth gate, page routing between wordset/study/sound/tone/results. Study page JSX lives here; other pages are imported components
- `profile.tsx` — Logged-in user's own profile (stats, level, username editing)
- `u/$username.tsx` — Public profile page for any user (stats, friend button, friends modal)
- `friends.tsx` — Friends management (search, suggested friends, incoming/outgoing requests, friends list)
- `leaderboard.tsx` — Weekly XP leaderboard for the user + their friends
- `feedback.tsx` — Feedback submission page (feedback/feature/bug types, past feedback list)
- `settings.tsx` — User settings (dark mode toggle)
- `admin/overview.tsx` — Admin dashboard (KPI cards, retention, funnel, time-to-value, 14-day charts, event stats, feature usage, audit log)
- `admin/analytics.tsx` — Dedicated analytics (retention cohorts, funnels, growth trends, top events, feature usage)
- `admin/users.tsx` — Admin user management (search, role filter, sort, per-user stats, role toggle, CSV export)
- `admin/system.tsx` — Operational monitoring (AI usage by feature/model, real token/cost tracking, heavy users, rate limits, audit log)
- `admin/index.tsx` — Redirects to `/admin/overview`
- `api.trpc.$.tsx` — tRPC handler

**Shared components**:

- `src/components/AppHeader.tsx` — Shared topbar used on all non-study pages. Contains logo, leaderboard/feedback/settings icons, notification sidebar (bell), profile dropdown menu with admin link. Extracted from WordSetPage; single source of truth for navigation
- `src/components/AuthPage.tsx` — Sign-in/sign-up form (email+password + Google OAuth)
- `src/components/FriendsModal.tsx` — Modal showing a user's accepted friends list
- `src/components/Skeleton.tsx` — Skeleton loading placeholder

**Flashcard UI components** (`src/components/flashcard/`):

- `types.ts` — Shared types: `Page`, `Settings`, `LastSession`, `CustomWordSet`, `AllTimeStats`, `SoundSettings`, `SoundAnswerFormat`, `AnswerStyle`
- `SoundOnlyPage.tsx` — Sound Only study mode (audio → guess char/pinyin/english, 1- or 2-stage)
- `ToneQuizPage.tsx` — Tone Quiz study mode (stripped pinyin → pick correct tones)
- `wordset/WordSetPage.tsx` — Word set selection page orchestrator; uses `<AppHeader>` for topbar
- `wordset/LeftSidebar.tsx` — Dialect tabs (Mandarin/Cantonese) + word set list buttons
- `wordset/CenterSettings.tsx` — Study settings panel (HSK 1-4 pickers with drag-select, study mode, answer style, session size, sound-only, tone quiz) + Start button
- `wordset/RightSidebar.tsx` — Currently hidden from UI but backend logic preserved (leaderboard, weekly stats, mastery progress)
- `wordset/CustomWordSetModal.tsx` — Custom word set CRUD modal (list/create/edit views, upload/paste/AI-generate, AI edit). Owns its own tRPC mutations
- `InlineLeaderboard.tsx` — Self-contained leaderboard sidebar snippet; always renders exactly 5 rows (real entries + empty dash rows + "Add more friends" CTA)
- `CardFace.tsx`, `StudyHeader.tsx`, `NextButton.tsx`, `StageDots.tsx`, `AnswerChoices.tsx` — Small study page UI primitives
- `ChatPanel.tsx` — Inline AI chat for study pages; suggestions use generic text ("this word") to avoid revealing the current card's character
- `PronunciationBox.tsx` — Pronunciation input box below chat
- `ResultsPage.tsx` — Session results summary (lazy-loaded)
- `SessionCompleteScreen.tsx` — Completion screen for sound/tone modes (lazy-loaded)
- `WordSetDashboard.tsx` — Mastery progress card (progress bar, chips, accuracy, struggling words)

**Profile components** (`src/components/profile/`):

- `StatCard.tsx` — Reusable stat display card (num, label, sub, tone variant)
- `WordSetRow.tsx` — Word set progress row with bar and mastery chips
- `PerformanceInsights.tsx` — Shared strongest/weakest sets, struggling words, recently mastered cards (used by both profile pages)

**tRPC / API layer** (`src/integrations/trpc/`):

- `init.ts` — tRPC setup with `publicProcedure`, `protectedProcedure`, and `adminProcedure` (checks `userProfiles.role === 'admin'`, throws FORBIDDEN otherwise)
- `router.ts` — Root router; imports chat, distractors, progress, wordsets, social, feedback, admin sub-routers
- `chat.ts` — AI chat (`sendMessage`) and translation (`translateToZh`); rate-limited 20 req/min
- `distractors.ts` — Fetches/generates wrong-answer choices (DB-cached, AI-generated via GPT-4o-mini); rate-limited 60 req/min
- `progress.ts` — Saves session results and per-card history; `getProgress` returns `thisWeekXP` and `lastWeekXP` using Monday 00:00 UTC week boundary
- `social.ts` — Profiles, friend requests, leaderboard, user search, suggested friends (friends-of-friends; falls back to @me for users with no friends)
- `wordsets.ts` — Custom word sets: AI extraction from uploaded files/text, save/list/update/delete/favorite; rate-limited 5 per 10 min
- `feedback.ts` — Submit and list feedback (feedback/feature/bug types)
- `admin.ts` — Admin dashboard: `checkAccess`, `getOverviewStats`, `getEventStats`, `getGrowthStats`, `getFeatureUsage`, `getRetention` (D1/D7/D30 + cohorts), `getFunnel` (cumulative 5-step), `getTimeToValue` (median hours), `getAiUsage` (real metered from `ai_usage_events`), `getSystemHealth` (heavy users, rate limits), `listUsers` (search + role filter + sort + per-user stats), `updateUserRole`, `getAuditLog`, `exportUsers` (CSV)
- `src/integrations/tanstack-query/root-provider.tsx` — QueryClient + tRPC provider wiring

**Libraries** (`src/lib/`):

- `flashcard-logic.ts` — Pure stateless helpers: `QueueItem`, `shuffle`, `normalizeAnswer`, `buildQueue`, `getQuestionContent`, `getAnswerContent`, `buildToneChoices`, `stripTones`; no React or side effects
- `mastery.ts` — `computeMastery()`, `getHardestWords()`, `getRecentlyMastered()`, `formatWordSetKey()` + `ProgressCard`/`MasteryStats` types; single source of truth for mastery logic
- `levels.ts` — XP formula (`computeXP`) and level ladder (`getLevelInfo`): 7 levels from Beginner → Legend
- `rate-limit.ts` — `createRateLimiter({ windowMs, max })` factory; used by chat, wordsets, and distractors
- `time.ts` — `getWeekStartTs()`: Monday 00:00 UTC timestamp; used by progress, social
- `theme.tsx` — `ThemeProvider` + `useTheme()` hook; persists dark/light mode to localStorage, sets `data-theme` on `<html>`
- `auth.ts` — Better Auth server config
- `auth-client.ts` — Better Auth client config (relative paths)

**Server utilities** (`src/server/`):

- `analytics.ts` — `logEvent({ userId, eventName, properties })` fire-and-forget insert into `analytics_events` table
- `ai-usage.ts` — `logAiUsage({ userId, featureName, model, inputTokens, outputTokens })` fire-and-forget insert into `ai_usage_events` with real cost computation from token counts
- `ai/generateDistractors.ts` — GPT-4o-mini logic for generating wrong answer choices; instrumented with `logAiUsage`
- `ai/generateWordSet.ts` — GPT-4o-mini logic for extracting/generating/editing Chinese vocab; all 3 functions instrumented with `logAiUsage`
- `extractors/index.ts` — File-to-text extraction (PDF, DOCX, plain text) for custom word set uploads

**Data / Config**:

- `src/db/schema.ts` — Drizzle schema: auth tables, `distractorSets`, `flashcardProgress`, `studySessions`, `chatMessages`, `userLastSession`, `customWordSets`, `userProfiles` (with `role: user|admin`), `friendships`, `feedback`, `aiUsageEvents`, `analyticsEvents`, `adminAuditLog`
- `src/data/vocabulary.ts` — All flashcard data: HSK 1 (149), HSK 2 (148), HSK 3 (299), HSK 4 (537), LANG 1511 units
- `public/audio/` — Pre-generated MP3s for every vocab word
- `vite.config.ts` — Vite + TanStack Start + Nitro config
- `vercel.json` — `regions: ["hnd1"]` to colocate with Tokyo Supabase
- `src/routeTree.gen.ts` — Auto-generated by TanStack Router; do not edit manually

### Homepage layout

The `wordset` page (`fc-app--wordset`) is rendered by `wordset/WordSetPage.tsx` with a two-column grid (`fc-ws-outer-row`):

- **Left column** (`wordset/LeftSidebar.tsx`, `fc-ws-left`, 260 px) — dialect tabs + word set list buttons (fixed height per button)
- **Centre column** (`wordset/CenterSettings.tsx`, `fc-ws-right`, 1fr, fixed height 636px) — study settings + Start Studying button. Settings fill available space; start button aligns with bottom of HSK button
- **Custom Word Sets modal** (`wordset/CustomWordSetModal.tsx`) — self-contained modal with list/create/edit views

The right sidebar has been removed from the UI but its code is preserved.

### Data flow

Client → tRPC hooks → `/api/trpc` route → tRPC procedures → Drizzle → PostgreSQL

On Vercel: Nitro bundles the TanStack Start SSR server and emits `.vercel/output/` (Vercel Build Output API). All routes — including `/api/trpc` — are handled by the Nitro Vercel serverless entry. `vercel.json` sets `regions: ["hnd1"]` to colocate serverless functions with the Tokyo Supabase instance.

### Analytics / event tracking

Two instrumentation systems, both fire-and-forget (never block the main request):

**Product events** — `logEvent()` from `src/server/analytics.ts` → `analytics_events` table:
- `study_session_completed` — in progress.ts after saveSession
- `chat_message_sent` — in chat.ts after message saved
- `custom_word_set_created` — in wordsets.ts after save
- `friend_request_sent` — in social.ts after friendship insert
- `friend_request_accepted` — in social.ts after status update
- `feedback_submitted` — in feedback.ts after feedback insert

**AI usage metering** — `logAiUsage()` from `src/server/ai-usage.ts` → `ai_usage_events` table:
- Real token counts from Vercel AI SDK's `usage.promptTokens` / `usage.completionTokens`
- Cost computed per-request from GPT-4o-mini pricing ($0.15/1M input, $0.60/1M output)
- Features: `chat`, `translate`, `distractor_generation`, `wordset_extraction`, `wordset_prompt_generation`, `wordset_ai_edit`

### Admin system

- **User roles**: `role` field on `userProfiles` (`'user' | 'admin'`, default `'user'`)
- **Authorization**: `adminProcedure` in `init.ts` chains from `protectedProcedure`, queries role from DB, throws FORBIDDEN if not admin. All admin pages check access server-side — URL knowledge alone grants no data access
- **Overview** (`/admin/overview`): KPI cards (9 metrics), retention (D1/D7/D30), product funnel (cumulative 5-step), time-to-value (median hours), 14-day charts, top events, feature usage, audit log
- **Analytics** (`/admin/analytics`): Retention cohorts (8 weeks), funnels, time-to-value, growth trends, top events, feature usage. "Active user" = completed study session (consistent across all metrics)
- **Users** (`/admin/users`): Search, role filter, sort (newest/oldest/most active), per-user stats (sessions/chats/word sets/last active), role toggle (prevents self-demotion), CSV export (up to 5000 users)
- **System** (`/admin/system`): Real AI usage from `ai_usage_events` (volume by time window, tokens/cost by feature, model breakdown, top AI-consuming users), heavy user monitoring, rate limit hits, audit log
- **Audit log**: `adminAuditLog` table tracks admin actions (role changes)

### Dark mode

- CSS variable overrides on `[data-theme='dark']` in `base.css`
- `ThemeProvider` in `__root.tsx` wraps the app; inline `<script>` in `<head>` prevents flash
- Toggle on `/settings` page via `useTheme()` hook
- Persisted to localStorage

### Flashcard app — page states

`src/routes/index.tsx` orchestrates five `Page` states, delegating to focused components:

- `wordset` → `wordset/WordSetPage.tsx` — word set selection
- `study` → inline in `index.tsx` — standard flashcard study session
- `sound` → `SoundOnlyPage.tsx` — Sound Only mode
- `tone` → `ToneQuizPage.tsx` — Tone Quiz mode
- `results` → `ResultsPage.tsx` (lazy-loaded) — session results summary

### Standard study modes (inside `study` page)

- Mode 1: Character + Pinyin → English (multiple choice or type)
- Mode 2: Two-step — Character → Pinyin, then Pinyin → English
- Mode 3: Full recall (self-rate correct/wrong) — includes Anki-style stage 3 recall cards

### Social features

- **User profiles** — lazily created on first social interaction; `usernameConfirmed` flag triggers a first-login username picker; `role` field for admin access
- **Public profiles** — `/u/:username` shows stats, level badge, friend count, and friend action buttons
- **Friends** — `/friends` page for searching users, managing incoming/outgoing requests, and viewing friends list
- **Leaderboard** — `/leaderboard` shows weekly XP rankings for the user + all accepted friends; resets Monday 00:00 UTC
- **XP formula** — `correctAnswers + completedSessions × 5`; all-time XP drives the level system (7 levels: Beginner → Legend)
- **Friend requests** — auto-accept if a reverse pending request already exists (mutual interest)
- **Suggested friends** — "People You May Know" on `/friends` page; uses friends-of-friends algorithm; falls back to app creator (@me) for users with no friends

### CSS conventions

Styles are split into `src/styles/` with a single entry point `src/styles.css` that imports all files:
- `base.css` — tailwind, fonts, reset, CSS variables (light + dark mode), skeleton, shared patterns (modal overlay base, text input base)
- `layout.css` — page grids, nav, topbar, buttons, notification sidebar, profile dropdown, responsive breakpoints
- `flashcard.css` — study modes, cards, answers, chat, sidebar cards, mastery dashboard
- `profile.css` — profile pages, stats, insights, level badge
- `social.css` — auth, modals, friends, leaderboard, settings page (toggle switch), feedback page
- `admin.css` — admin dashboard, stats grid, mini bar charts, funnel bars, cohort grid, retention, lists, user table, role buttons, sort/filter, pagination

All classes use the `fc-` prefix. Key CSS variables are defined on `.fc-app`:

- `--fc-accent: var(--fc-blue)` — used for XP bar, rank badge, and other accent UI
- `--fc-blue: #2c5f8a`, `--fc-red: #c0392b`, `--fc-success: #27ae60`, `--fc-wrong: #e74c3c`
- Dynamic classes applied via template literals (`fc-lb-row--top${rank}`, `fc-level-badge--tier${n}`) — do not remove these from CSS even if a simple grep finds no static usage

### Auth

Better Auth with Drizzle adapter. Sign-in/sign-out is integrated in the UI. Auth client uses relative paths (no hardcoded URL) so it works on both localhost and Vercel.

### TypeScript path aliases

`@/*` and `#/*` both map to `./src/*`.

### Editing guide — which file to change

| To change… | Edit |
|---|---|
| Shared topbar / navigation / profile menu | `src/components/AppHeader.tsx` |
| Study settings (mode, answer style, session size, sound-only, tone quiz) | `src/components/flashcard/wordset/CenterSettings.tsx` |
| Word set list (left sidebar, dialect tabs) | `src/components/flashcard/wordset/LeftSidebar.tsx` |
| Custom word set modal (upload/paste/edit/AI) | `src/components/flashcard/wordset/CustomWordSetModal.tsx` |
| Word set page layout / state / orchestration | `src/components/flashcard/wordset/WordSetPage.tsx` |
| Sound Only mode gameplay | `src/components/flashcard/SoundOnlyPage.tsx` |
| Tone Quiz mode gameplay | `src/components/flashcard/ToneQuizPage.tsx` |
| Standard study mode / card logic / distractor flow | `src/routes/index.tsx` (FlashcardsApp) |
| Shared types (Settings, LastSession, SoundSettings, etc.) | `src/components/flashcard/types.ts` |
| Mastery calculation (known/learning/new thresholds) | `src/lib/mastery.ts` |
| Profile stats cards | `src/components/profile/StatCard.tsx` |
| Profile word set progress rows | `src/components/profile/WordSetRow.tsx` |
| Profile page layout / data flow | `src/routes/profile.tsx` |
| Performance insights (both profile pages) | `src/components/profile/PerformanceInsights.tsx` |
| Suggested friends / People You May Know | `src/integrations/trpc/social.ts` (`getSuggestedFriends`) + `src/routes/friends.tsx` |
| Friends page (search, requests, friends list) | `src/routes/friends.tsx` |
| Inline leaderboard (sidebar, 5-row fixed) | `src/components/flashcard/InlineLeaderboard.tsx` |
| Dark mode / theming | `src/lib/theme.tsx` + `src/styles/base.css` (dark mode vars) |
| Settings page | `src/routes/settings.tsx` |
| Feedback page | `src/routes/feedback.tsx` |
| Admin overview / KPIs / retention / funnel | `src/integrations/trpc/admin.ts` + `src/routes/admin/overview.tsx` |
| Admin analytics (cohorts, growth, events) | `src/routes/admin/analytics.tsx` |
| Admin user management / CSV export | `src/routes/admin/users.tsx` |
| Admin system / AI usage / operational | `src/routes/admin/system.tsx` |
| Product event tracking | `src/server/analytics.ts` (helper) + individual tRPC routers |
| AI usage metering | `src/server/ai-usage.ts` (helper) + `src/server/ai/*.ts` + `chat.ts` |
| Notification sidebar | `src/components/AppHeader.tsx` |

---

## Database Workflow

### Schema changes

- Always modify `src/db/schema.ts` first
- Never edit the database directly as the source of truth

### Migrations (REQUIRED)

```bash
pnpm drizzle-kit generate    # Step 1: generate migration SQL from schema diff
# Step 2: edit the generated migration file to add RLS/policies (see below)
pnpm drizzle-kit migrate     # Step 3: apply migration to database
```

- Every schema change MUST go through generated migrations
- Review generated SQL before applying — add RLS statements to the migration file

### RLS and policies (CRITICAL)

- ALL RLS and policy SQL MUST be included in migration files
- Never rely on manual SQL edits in Supabase dashboard as the source of truth
- Every new table MUST include in its migration:
  - `ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;`
  - Appropriate `CREATE POLICY` statements

### `db:push` restrictions

- **Allowed for**: quick local prototyping only
- **MUST NOT be used for**:
  - Production schema changes
  - Security-related changes
  - RLS/policy changes
  - Any persistent environment

### WARNING

Using `db:push` without updating migrations can result in:
- Lost RLS policies
- Exposed user data
- Security vulnerabilities
- Schema drift between environments

---

## Security Rules

### Row Level Security (RLS)

- All tables in the `public` schema MUST have RLS enabled
- Sensitive tables (`accounts`, `sessions`, `verifications`) MUST use deny-all policies for public access
- User data tables (`flashcard_progress`, `study_sessions`, `chat_messages`, `custom_word_sets`, `user_last_session`, `feedback`) MUST use per-user policies: `auth.uid() = user_id`
- Admin-only tables (`analytics_events`, `ai_usage_events`, `admin_audit_log`) MUST NOT be publicly accessible — access only through `adminProcedure` on the server
- `user_profiles` and `friendships` may allow limited public read access but MUST restrict writes to the owning user

### General

- Never expose sensitive columns (email, auth tokens) without RLS
- Server-side admin checks via `adminProcedure` — never frontend-only
- Rate limiting on all AI-calling endpoints (`chat`, `wordsets`, `distractors`)

---

## When Adding New Tables — Checklist

1. Add table to `src/db/schema.ts`
2. Run `pnpm drizzle-kit generate`
3. Edit the generated migration file to add:
   - `ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;`
   - `CREATE POLICY` statements appropriate for the table
4. Run `pnpm drizzle-kit migrate`
5. Verify via Supabase dashboard → Database → Linter (or Security Advisor)
6. If the table is referenced by tRPC, use `protectedProcedure` or `adminProcedure` as appropriate
