# 汉字 · Hànzì — Chinese Flashcards

A full-stack web app for studying Mandarin Chinese vocabulary. Covers HSK 1, HSK 2, and LANG 1511 word sets with multiple study modes, AI-powered answer checking, and per-user progress tracking.

## Features

- **Flashcard study** — character + pinyin → English, with multiple-choice or free-type answers
- **Two-step mode** — character → pinyin first, then pinyin → English
- **Full recall mode** — self-rate correct/wrong
- **Sound Only mode** — hear the audio, guess the character or pinyin
- **Tone Quiz** — see the character, pick the correct tone
- **AI chat tutor** — inline GPT-4o-mini chat panel for questions about any card
- **Pronunciation box** — type Chinese, pinyin, or English to hear it spoken (OpenAI TTS with Web Speech API fallback)
- **Progress tracking** — per-card mastery stats, study streaks, and session history for signed-in users
- **Google OAuth + email/password login** via Better Auth

## Tech Stack

| Layer         | Technology                                                                               |
| ------------- | ---------------------------------------------------------------------------------------- |
| Framework     | [TanStack Start](https://tanstack.com/start) (full-stack React, SSR)                     |
| Routing       | [TanStack Router](https://tanstack.com/router) (file-based)                              |
| API           | [tRPC](https://trpc.io) (type-safe, batched)                                             |
| Data fetching | [TanStack Query](https://tanstack.com/query)                                             |
| Database      | PostgreSQL + [Drizzle ORM](https://orm.drizzle.team)                                     |
| Auth          | [Better Auth](https://www.better-auth.com) (Google OAuth + email/password)               |
| AI            | [OpenAI](https://platform.openai.com) GPT-4o-mini (chat, distractors, translation) + TTS |
| Deployment    | [Vercel](https://vercel.com) (Nitro SSR, Vercel Build Output API)                        |

## Word Sets

- **HSK 1** — 150 words (beginner)
- **HSK 2** — 150 words (elementary)
- **LANG 1511** — University of Auckland introductory Mandarin units 1–14

## Running Locally

```bash
pnpm install
pnpm dev          # starts on local dev server
```

Requires a `.env.local` with the following variables:

| Variable               | Description                                               |
| ---------------------- | --------------------------------------------------------- |
| `DATABASE_URL`         | PostgreSQL connection string                              |
| `BETTER_AUTH_SECRET`   | Random secret for Better Auth                             |
| `BETTER_AUTH_URL`      | Your app's base URL (local dev URL or Vercel deploy URL)  |
| `GOOGLE_CLIENT_ID`     | Google OAuth client ID                                    |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret                                |
| `OPENAI_API_KEY`       | OpenAI API key                                            |

```bash
pnpm db:push      # push schema to DB
pnpm db:gen-distractors  # pre-generate AI wrong-answer choices
pnpm audio:generate      # pre-generate TTS audio files
```
