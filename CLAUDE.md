# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # Start dev server (port 3000)
pnpm build        # Production build
pnpm test         # Run tests with Vitest
pnpm lint         # Run ESLint
pnpm check        # Fix formatting and linting (prettier --write + eslint --fix)

# Database
pnpm db:generate  # Generate Drizzle migrations
pnpm db:migrate   # Run migrations
pnpm db:push      # Push schema directly to DB
pnpm db:studio    # Open Drizzle Studio
pnpm db:gen-distractors  # Pre-generate AI distractors for all vocab words

# Audio
pnpm audio:generate  # Generate OpenAI TTS MP3s for all vocab words → public/audio/
```

To add shadcn components:

```bash
pnpm dlx shadcn@latest add <component>
```

## Architecture

**TanStack Start** (full-stack React) with file-based routing, **tRPC** for type-safe API, **Drizzle ORM** + PostgreSQL, and **Better Auth** for authentication. Deployed on **Vercel** via Nitro (preset `vercel`, configured in `vite.config.ts`).

### Key paths

- `src/routes/` — File-based routing; `__root.tsx` is the root layout (brand font LCP optimisation: sync-loads a 3-char `text=` Google Fonts subset for 学中文), `index.tsx` is the study session orchestrator, `api.trpc.$.tsx` is the tRPC handler
- `src/routes/index.tsx` — Thin orchestrator: auth gate, study session state/logic, page routing between wordset/study/sound/tone/results. The study page JSX lives here; other pages are imported components
- `src/routes/profile.tsx` — Logged-in user's own profile (edit display name, username, bio; view stats and level). Imports `StatCard`, `WordSetRow` from `src/components/profile/`
- `src/routes/u/$username.tsx` — Public profile page for any user (stats, friend button, friends modal)
- `src/routes/friends.tsx` — Friends management (search users, suggested friends via friends-of-friends, incoming/outgoing requests, friends list)
- `src/routes/leaderboard.tsx` — Weekly XP leaderboard for the user + their friends

**Flashcard UI components** (`src/components/flashcard/`):

- `types.ts` — Shared types: `Page`, `Settings`, `LastSession`, `CustomWordSet`, `AllTimeStats`, `SoundSettings`, `SoundAnswerFormat`, `AnswerStyle`
- `SoundOnlyPage.tsx` — Sound Only study mode (audio → guess char/pinyin/english, 1- or 2-stage)
- `ToneQuizPage.tsx` — Tone Quiz study mode (stripped pinyin → pick correct tones)
- `wordset/WordSetPage.tsx` — Word set selection page orchestrator (state, derived data, session builders); renders the four sub-components below
- `wordset/LeftSidebar.tsx` — Dialect tabs (Mandarin/Cantonese) + word set list buttons (My Word Sets, Last Session, LANG 1511, HSK, Cantonese Basics)
- `wordset/CenterSettings.tsx` — Study settings panel (HSK/unit pickers with drag-select, study mode, answer style, session size, sound-only, tone quiz) + Start button
- `wordset/RightSidebar.tsx` — Leaderboard snippet (fixed 5-row), "This Week" XP/streak/rank card (fixed height), mastery progress card (shows empty state when no word set selected)
- `wordset/CustomWordSetModal.tsx` — Custom word set CRUD modal (list/create/edit views, upload/paste/AI-generate, AI edit). Owns its own tRPC mutations
- `InlineLeaderboard.tsx` — Self-contained leaderboard sidebar snippet; always renders exactly 5 rows (real entries + empty dash rows + "Add more friends" CTA); fetches `social.getWeeklyLeaderboard`, hides for unauthenticated users
- `CardFace.tsx`, `StudyHeader.tsx`, `NextButton.tsx`, `StageDots.tsx`, `AnswerChoices.tsx` — Small study page UI primitives
- `ChatPanel.tsx` — Inline AI chat for study pages; suggestions use generic text ("this word") to avoid revealing the current card's character
- `PronunciationBox.tsx` — Pronunciation input box below chat
- `ResultsPage.tsx` — Session results summary (lazy-loaded)
- `SessionCompleteScreen.tsx` — Completion screen for sound/tone modes (lazy-loaded)
- `WordSetDashboard.tsx` — Mastery progress card (progress bar, chips, struggling words)

**Profile components** (`src/components/profile/`):

- `StatCard.tsx` — Reusable stat display card (num, label, sub, tone variant)
- `WordSetRow.tsx` — Word set progress row with bar and mastery chips
- `PerformanceInsights.tsx` — Shared strongest/weakest sets, struggling words, recently mastered cards (used by both profile pages)

**Other components**:

- `src/components/AuthPage.tsx` — Sign-in/sign-up form (email+password + Google OAuth); props: `{ onSkip }`
- `src/components/FriendsModal.tsx` — Modal showing a user's accepted friends list (used on public profiles)

**tRPC / API layer** (`src/integrations/trpc/`):

- `router.ts` — Root tRPC router; imports `chat`, `distractors`, `progress`, `wordsets`, `social` sub-routers
- `chat.ts` — AI chat (`sendMessage`) and translation (`translateToZh`) procedures
- `distractors.ts` — Fetches/generates wrong-answer choices (DB-cached, AI-generated via GPT-4o-mini); rate-limited to 60 req/min per user
- `progress.ts` — Saves session results and per-card history for logged-in users; `getProgress` returns `thisWeekXP` and `lastWeekXP` using Monday 00:00 UTC week boundary (same as leaderboard)
- `social.ts` — Social features: profiles, friend requests, leaderboard, user search, suggested friends (friends-of-friends; falls back to app creator @me for users with no friends)
- `wordsets.ts` — Custom word sets: AI extraction from uploaded files/text, save/list/update/delete/favorite
- `src/integrations/tanstack-query/root-provider.tsx` — QueryClient + tRPC provider wiring

**Libraries** (`src/lib/`):

- `flashcard-logic.ts` — Pure stateless helpers for the study engine: `QueueItem` type, `shuffle`, `normalizeAnswer`, `buildQueue`, `getQuestionContent`, `getAnswerContent`, `buildToneChoices`, `stripTones`, and tone-vowel utilities; no React or side effects
- `mastery.ts` — `computeMastery()`, `getHardestWords()`, `getRecentlyMastered()`, `formatWordSetKey()` + `ProgressCard`/`MasteryStats` types; single source of truth for mastery logic used by both profile pages
- `levels.ts` — XP formula (`computeXP`) and level ladder (`getLevelInfo`): 7 levels from Beginner → Legend
- `rate-limit.ts` — `createRateLimiter({ windowMs, max })` factory; used by `chat.ts`, `wordsets.ts`, and `distractors.ts`
- `time.ts` — `getWeekStartTs()`: returns Monday 00:00 UTC timestamp; single source of truth for week boundary used by `progress.ts`, `social.ts`
- `auth.ts` — Better Auth server config (no `baseURL`; uses `BETTER_AUTH_URL` for `trustedOrigins`)
- `auth-client.ts` — Better Auth client config (no `baseURL`; uses relative paths)

**Data / Server / Other**:

- `src/db/schema.ts` — Drizzle schema (auth tables + `distractorSets`, `flashcardProgress`, `studySessions`, `chatMessages`, `userLastSession`, `customWordSets`, `userProfiles`, `friendships`)
- `src/data/vocabulary.ts` — All flashcard data (HSK 1, HSK 2, LANG 1511 units)
- `src/server/ai/generateDistractors.ts` — GPT-4o-mini logic for generating wrong answer choices
- `src/server/ai/generateWordSet.ts` — GPT-4o-mini logic for extracting Chinese vocab from arbitrary text
- `src/server/extractors/index.ts` — File-to-text extraction (PDF, DOCX, plain text) for custom word set uploads
- `public/audio/` — Pre-generated MP3s for every vocab word (percent-encoded filenames, e.g. `%E4%BD%A0.mp3`)
- `scripts/generate-audio.ts` — Script that generates the MP3s via OpenAI TTS (`tts-1`, `shimmer` voice)
- `vite.config.ts` — Vite + TanStack Start + Nitro config; `nitro({ preset: 'vercel' })` produces `.vercel/output/` on build
- `src/routeTree.gen.ts` — Auto-generated by TanStack Router; do not edit manually

### Homepage layout

The `wordset` page (`fc-app--wordset`) is rendered by `wordset/WordSetPage.tsx`, which composes four sub-components into an in-flow topbar (`fc-ws-topbar`) + three-column main grid (`fc-ws-outer-row`):

- **Left column** (`wordset/LeftSidebar.tsx`, `fc-ws-left`, 260 px) — dialect tabs + word set list buttons
- **Centre column** (`wordset/CenterSettings.tsx`, `fc-ws-right`, 1fr) — study settings + Start Studying button
- **Right sidebar** (`wordset/RightSidebar.tsx`, `fc-ws-sidebar`, 220 px, hidden below 1100 px) — three stacked cards:
  1. `InlineLeaderboard` — weekly XP leaderboard snippet
  2. **"This Week" card** (`fc-ws-weekly-placeholder`, fixed height 244px) — XP progress bar vs last week's XP, streak, global tier; full skeleton during loading (no text flash)
  3. **Mastery card** (`fc-ws-progress-placeholder`) — shows `WordSetDashboard` (progress bar, New/Learning/Known chips, accuracy, struggling words) when a word set is selected; shows "Select a word set to see your progress" empty state otherwise
- **Custom Word Sets modal** (`wordset/CustomWordSetModal.tsx`) — self-contained modal with list/create/edit views; owns its own tRPC mutations

The "This Week" card weekly XP uses Monday 00:00 UTC as the week boundary (matching the leaderboard). Global tier is derived client-side from `thisWeekXP` thresholds (Top 50 → Top 5000). The `--fc-accent` CSS variable is defined as `var(--fc-blue)` and used for the XP bar fill and rank status badge.

### Data flow

Client → tRPC hooks → `/api/trpc` route → tRPC procedures → Drizzle → PostgreSQL

On Vercel: Nitro bundles the TanStack Start SSR server and emits `.vercel/output/` (Vercel Build Output API). All routes — including `/api/trpc` — are handled by the Nitro Vercel serverless entry. `vercel.json` sets `regions: ["hnd1"]` to colocate serverless functions with the Tokyo Supabase instance.

### Flashcard app — page states

`src/routes/index.tsx` orchestrates five `Page` states, delegating to focused components:

- `wordset` → `wordset/WordSetPage.tsx` — word set selection (My Word Sets, Last Session, LANG 1511, HSK — in that order in the left column)
- `study` → inline in `index.tsx` — standard flashcard study session (card rendering, distractor management, answer handlers)
- `sound` → `SoundOnlyPage.tsx` — Sound Only mode (audio → guess char/pinyin, optionally 2-stage)
- `tone` → `ToneQuizPage.tsx` — Tone Quiz mode (character → guess correct tone)
- `results` → `ResultsPage.tsx` (lazy-loaded) — session results summary

### Standard study modes (inside `study` page)

- Mode 1: Character + Pinyin → English (multiple choice or type)
- Mode 2: Two-step — Character → Pinyin, then Pinyin → English
- Mode 3: Full recall (self-rate correct/wrong) — includes Anki-style stage 3 recall cards interleaved between study pairs; recall frequency is intentionally low (base 20% probability, rising slowly to 60% max) so they cluster toward the end of the session

### Sound Only mode

- 1-card: audio → guess character or pinyin
- 2-card: audio → guess character/pinyin (stage 1), then guess English (stage 2)
- Answer format configurable: char, pinyin, or both

### Answer distractors

English wrong-answer choices are fetched from the DB (`distractorSets` table). They are pre-generated for all vocab via `pnpm db:gen-distractors`. The client **prefetches distractors for the next card before the flip animation starts** so choices appear immediately after the flip. Falls back to a live GPT-4o-mini call if not cached.

### TTS / Audio

`speakHanzi(hanzi)` in `src/lib/tts.ts`:

1. Tries `new Audio('/audio/' + encodeURIComponent(hanzi) + '.mp3')` — waits for `canplaythrough` before playing to avoid first-play choppiness
2. Falls back to `speakFallback()` (Web Speech API, `zh-CN`, rate 0.65) on error

### AI Chat panel

Inline `ChatPanel` component rendered in the right column of every study page. Uses `chat.sendMessage` tRPC mutation (GPT-4o-mini, rate-limited to 20 req/min). Chat history persists within a session; new card suggestions are appended below existing messages.

### Pronunciation box

Below the chat panel in every study mode. Users type Chinese, pinyin, or English:

- Chinese text → plays directly (free, no limit)
- English/other → calls `chat.translateToZh` to get characters + pinyin, then plays (limited to 5 translations per page load)

### Custom word sets

Logged-in users can upload documents (PDF, DOCX, plain text) or paste text; the server extracts text and calls GPT-4o-mini to produce `{ char, pinyin, english }` word arrays. Results are previewed before saving. Saved sets appear in the word set selector alongside HSK/LANG sets. Supports merge (add words to existing set), favorite toggle, and delete. Rate-limited to 5 AI generations per 10 minutes per user.

### Social features

- **User profiles** — lazily created on first social interaction; `usernameConfirmed` flag triggers a first-login username picker
- **Public profiles** — `/u/:username` shows stats, level badge, friend count, and friend action buttons
- **Friends** — `/friends` page for searching users, managing incoming/outgoing requests, and viewing friends list
- **Leaderboard** — `/leaderboard` shows weekly XP rankings for the user + all accepted friends; resets Monday 00:00 UTC
- **XP formula** — `correctAnswers + completedSessions × 5`; all-time XP drives the level system (7 levels: Beginner → Legend)
- **Friend requests** — auto-accept if a reverse pending request already exists (mutual interest)
- **Suggested friends** — "People You May Know" on `/friends` page; uses friends-of-friends algorithm; falls back to app creator (@me) for users with no friends

### CSS conventions

Styles are split into `src/styles/` with a single entry point `src/styles.css` that imports all files:
- `base.css` — tailwind, fonts, reset, CSS variables, skeleton, shared patterns (modal overlay base, text input base)
- `layout.css` — page grids, nav, buttons, responsive breakpoints
- `flashcard.css` — study modes, cards, answers, chat, sidebar cards, mastery dashboard
- `profile.css` — profile pages, stats, insights, level badge
- `social.css` — auth, modals, friends, leaderboard

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
| Leaderboard / weekly stats / streak sidebar | `src/components/flashcard/wordset/RightSidebar.tsx` |
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
