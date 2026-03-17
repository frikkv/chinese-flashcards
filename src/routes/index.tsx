import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Volume2, User } from 'lucide-react'
import { hsk1Words, hsk2Words, lang1511Units } from '../data/vocabulary'
import type { Word } from '../data/vocabulary'
import { authClient } from '#/lib/auth-client'
import { useTRPC } from '#/integrations/trpc/react'
import { speakHanzi } from '#/lib/tts'
import { type CardContent, charFontStyle, CardFace } from '#/components/flashcard/CardFace'
import { type ProgressCard, WordSetDashboard } from '#/components/flashcard/WordSetDashboard'
import { ResultsPage } from '#/components/flashcard/ResultsPage'
import { StudyHeader } from '#/components/flashcard/StudyHeader'
import { NextButton } from '#/components/flashcard/NextButton'
import { StageDots } from '#/components/flashcard/StageDots'
import { SessionCompleteScreen } from '#/components/flashcard/SessionCompleteScreen'
import { AnswerChoices } from '#/components/flashcard/AnswerChoices'

export const Route = createFileRoute('/')({ component: AuthGate })

// ── TYPES ────────────────────────────────────────────────────────
type Page = 'wordset' | 'study' | 'results' | 'sound' | 'tone'
type AnswerStyle = 'multiple-choice' | 'type'

interface Settings {
  answerStyle: AnswerStyle
  defaultMode: 1 | 2 | 3
  sessionSize: 10 | 20 | 30
}

interface QueueItem {
  word: Word
  stage: 1 | 2 | 3
}

interface LastSession {
  wordSetKey: string
  hskLevels: Set<number>
  units: Set<number>
  customSetId?: string
  settings: Settings
  soundSettings?: SoundSettings
  toneSessionSize?: 10 | 20 | 30
  vocab: Word[]
  desc: string
}

interface CustomWordSet {
  id: string
  name: string
  words: Word[]
  wordCount: number
  sourceFileName: string | null | undefined
  isFavorited: boolean
  createdAt: Date
}

// ── PROGRESS / MASTERY ────────────────────────────────────────────
// ProgressCard, MasteryStats, computeWordSetMastery → WordSetDashboard.tsx

interface AllTimeStats {
  studied: number
  correct: number
  sessions: number
}

type SoundAnswerFormat = 'char' | 'pinyin' | 'both'

interface SoundSettings {
  answerFormat: SoundAnswerFormat
  answerStyle: AnswerStyle
  sessionSize: 10 | 20 | 30
  stageCount?: 1 | 2
}

// CardContent → src/components/flashcard/CardFace.tsx

// ── HELPERS ──────────────────────────────────────────────────────
function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5)
}

function normalizeAnswer(s: string): string {
  return s
    .toLowerCase()
    .replace(/[āáǎà]/g, 'a')
    .replace(/[ēéěè]/g, 'e')
    .replace(/[īíǐì]/g, 'i')
    .replace(/[ōóǒò]/g, 'o')
    .replace(/[ūúǔùǖ]/g, 'u')
    .trim()
}

// ── TONE HELPERS ─────────────────────────────────────────────────
const TONE_VOWELS: Record<string, string[]> = {
  a: ['a', 'ā', 'á', 'ǎ', 'à'],
  e: ['e', 'ē', 'é', 'ě', 'è'],
  i: ['i', 'ī', 'í', 'ǐ', 'ì'],
  o: ['o', 'ō', 'ó', 'ǒ', 'ò'],
  u: ['u', 'ū', 'ú', 'ǔ', 'ù'],
  ü: ['ü', 'ǖ', 'ǘ', 'ǚ', 'ǜ'],
}

function stripTones(s: string): string {
  return s
    .replace(/[āáǎà]/g, 'a')
    .replace(/[ēéěè]/g, 'e')
    .replace(/[īíǐì]/g, 'i')
    .replace(/[ōóǒò]/g, 'o')
    .replace(/[ūúǔù]/g, 'u')
    .replace(/[ǖǘǚǜ]/g, 'ü')
}

function getSyllableTone(syllable: string): number {
  if (/[āēīōūǖ]/.test(syllable)) return 1
  if (/[áéíóúǘ]/.test(syllable)) return 2
  if (/[ǎěǐǒǔǚ]/.test(syllable)) return 3
  if (/[àèìòùǜ]/.test(syllable)) return 4
  return 0
}

function applyToneToSyllable(syllable: string, tone: number): string {
  if (tone === 0) return syllable
  for (const v of ['a', 'e']) {
    if (syllable.includes(v)) return syllable.replace(v, TONE_VOWELS[v][tone])
  }
  if (syllable.includes('ou')) return syllable.replace('o', TONE_VOWELS['o'][tone])
  let lastIdx = -1
  let lastVowel = ''
  for (const v of ['i', 'o', 'u', 'ü']) {
    const idx = syllable.lastIndexOf(v)
    if (idx > lastIdx) {
      lastIdx = idx
      lastVowel = v
    }
  }
  if (lastIdx !== -1)
    return (
      syllable.slice(0, lastIdx) +
      TONE_VOWELS[lastVowel][tone] +
      syllable.slice(lastIdx + 1)
    )
  return syllable
}

function buildToneChoices(word: Word, vocab: Word[]): string[] {
  const syllables = word.pinyin.split(' ')
  const correctTones = syllables.map(getSyllableTone)
  const stripped = syllables.map(stripTones)
  const distractors = new Set<string>()

  if (syllables.length === 1) {
    shuffle([1, 2, 3, 4].filter((t) => t !== correctTones[0]))
      .slice(0, 3)
      .forEach((t) => distractors.add(applyToneToSyllable(stripped[0], t)))
  } else {
    let attempts = 0
    while (distractors.size < 3 && attempts < 200) {
      attempts++
      const newTones = [...correctTones]
      const numChanges = Math.min(
        1 + Math.floor(Math.random() * 2),
        syllables.length,
      )
      shuffle(syllables.map((_, i) => i))
        .slice(0, numChanges)
        .forEach((i) => {
          const others = [0, 1, 2, 3, 4].filter((t) => t !== newTones[i])
          newTones[i] = others[Math.floor(Math.random() * others.length)]
        })
      if (newTones.every((t, i) => t === correctTones[i])) continue
      const variant = stripped
        .map((s, i) => applyToneToSyllable(s, newTones[i]))
        .join(' ')
      if (variant !== word.pinyin) distractors.add(variant)
    }
  }

  if (distractors.size < 3) {
    shuffle(vocab.filter((w) => w.char !== word.char))
      .slice(0, 3 - distractors.size)
      .forEach((w) => distractors.add(w.pinyin))
  }

  return shuffle([word.pinyin, ...Array.from(distractors).slice(0, 3)])
}

function buildQueue(vocab: Word[], mode: 1 | 2 | 3, size: number): QueueItem[] {
  const count = Math.min(
    size >= vocab.length ? vocab.length : size,
    vocab.length,
  )
  const words = shuffle(vocab).slice(0, count)

  if (mode !== 3) {
    const stages = (mode === 1 ? [1] : [1, 2]) as (1 | 2 | 3)[]
    return words.flatMap((w) => stages.map((s) => ({ word: w, stage: s })))
  }

  // Mode 3: interleave Anki recall cards (stage 3) between study pairs (stage 1+2).
  // Rules:
  //   - Recall for word X only appears after X's pair (1+2) has been seen
  //   - Recall never immediately follows X's own pair
  //   - At least one full pair separates any two recalls
  const studiedSet = new Set<Word>()
  const pendingRecalls: QueueItem[] = shuffle(words).map((w) => ({
    word: w,
    stage: 3 as const,
  }))

  const result: QueueItem[] = []
  let pairsSinceLastRecall = 0

  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    result.push({ word: w, stage: 1 })
    result.push({ word: w, stage: 2 })
    studiedSet.add(w)
    pairsSinceLastRecall++

    // Find an eligible recall: studied already, not the word we just finished
    const eligibleIdx = pendingRecalls.findIndex(
      (r) => studiedSet.has(r.word) && r.word !== w,
    )

    if (eligibleIdx !== -1) {
      // Force insert if we have more recalls than remaining pair slots
      const remainingPairs = words.length - i - 1
      const forceInsert = pendingRecalls.length > remainingPairs + 1
      // Probability rises the longer we go without a recall
      const insertProb = 0.5 + Math.min((pairsSinceLastRecall - 1) * 0.15, 0.35)

      if (forceInsert || Math.random() < insertProb) {
        const [recall] = pendingRecalls.splice(eligibleIdx, 1)
        result.push(recall)
        pairsSinceLastRecall = 0
      }
    }
  }

  // Any recalls that couldn't be placed earlier (e.g. the last word's own recall)
  result.push(...pendingRecalls)

  return result
}

function getQuestionContent(
  word: Word,
  stage: 1 | 2 | 3,
  mode: 1 | 2 | 3,
): CardContent {
  if (mode === 1 || stage === 2) {
    return { tag: 'What does this mean?', char: word.char, pinyin: word.pinyin }
  }
  if (stage === 1) {
    return { tag: 'What is the pinyin?', char: word.char }
  }
  // stage 3
  return {
    tag: 'Recall the character',
    english: word.english,
    englishLarge: true,
    isRecall: true,
  }
}

function getAnswerContent(
  word: Word,
  stage: 1 | 2 | 3,
  mode: 1 | 2 | 3,
): CardContent {
  if (mode === 1 || stage === 2) {
    return { tag: 'English', english: word.english }
  }
  if (stage === 1) {
    return { tag: 'Pinyin', pinyin: word.pinyin, pinyinLarge: true }
  }
  return { tag: 'Character', char: word.char, pinyin: word.pinyin }
}

// ── TTS ──────────────────────────────────────────────────────────
// speakHanzi → src/lib/tts.ts

// ── CARD FACE ────────────────────────────────────────────────────
// CardContent, charFontStyle, CardFace → src/components/flashcard/CardFace.tsx

// ── AUTH ──────────────────────────────────────────────────────────
function AuthPage({ onSkip }: { onSkip: () => void }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  async function handleGoogleSignIn() {
    setGoogleLoading(true)
    setError('')
    try {
      await authClient.signIn.social({ provider: 'google', callbackURL: '/' })
    } catch {
      setError('Google sign-in failed. Please try again.')
      setGoogleLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'signup') {
        const res = await authClient.signUp.email({ email, password, name })
        if (res.error) setError(res.error.message ?? 'Sign up failed')
      } else {
        const res = await authClient.signIn.email({ email, password })
        if (res.error) setError(res.error.message ?? 'Sign in failed')
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fc-app">
      <div className="fc-auth-container">
        <h1 className="fc-hero-title">学中文</h1>
        <form className="fc-auth-form" onSubmit={handleSubmit}>
          <h2 className="fc-auth-title">
            {mode === 'signin' ? 'Sign In' : 'Create Account'}
          </h2>
          {mode === 'signup' && (
            <input
              className="fc-type-input fc-auth-input"
              type="text"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          )}
          <input
            className="fc-type-input fc-auth-input"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus={mode === 'signin'}
          />
          <input
            className="fc-type-input fc-auth-input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <div className="fc-auth-error">{error}</div>}
          <button className="fc-start-btn" type="submit" disabled={loading}>
            {loading
              ? 'Please wait…'
              : mode === 'signin'
                ? 'Sign In →'
                : 'Create Account →'}
          </button>
        </form>
        <div className="fc-auth-divider">
          <span>or</span>
        </div>
        <button
          className="fc-auth-google-btn"
          type="button"
          onClick={handleGoogleSignIn}
          disabled={googleLoading || loading}
        >
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          {googleLoading ? 'Redirecting…' : 'Continue with Google'}
        </button>
        <p className="fc-auth-switch">
          {mode === 'signin'
            ? "Don't have an account? "
            : 'Already have an account? '}
          <button
            className="fc-auth-link"
            type="button"
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin')
              setError('')
            }}
          >
            {mode === 'signin' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
        <button className="fc-auth-skip" type="button" onClick={onSkip}>
          Continue without an account
        </button>
      </div>
    </div>
  )
}

function AuthGate() {
  const { data: session, isPending } = authClient.useSession()
  const [skipped, setSkipped] = useState(false)

  if (isPending) {
    return (
      <div className="fc-app fc-auth-loading">
        <div className="fc-auth-spinner" />
      </div>
    )
  }

  if (!session && !skipped) return <AuthPage onSkip={() => setSkipped(true)} />
  return <FlashcardsApp onSignIn={session ? undefined : () => setSkipped(false)} />
}

function wordSetDetailOf(session: LastSession | null): string {
  if (!session) return ''
  if (session.wordSetKey === 'hsk') return [...session.hskLevels].sort().join(',')
  if (session.wordSetKey === 'custom') return session.customSetId ?? ''
  return [...session.units].sort((a, b) => a - b).join(',')
}

// ── MAIN APP ─────────────────────────────────────────────────────
function FlashcardsApp({ onSignIn }: { onSignIn?: () => void }) {
  const trpc = useTRPC()
  const { data: authSession } = authClient.useSession()
  const isSignedIn = !!authSession?.user

  // Load per-user progress (only when signed in)
  const progressQuery = useQuery({
    ...trpc.progress.getProgress.queryOptions(),
    enabled: isSignedIn,
  })
  const customWordSetsQuery = useQuery({
    ...trpc.wordsets.list.queryOptions(),
    enabled: isSignedIn,
  })
  const batchRecordCardsMutation = useMutation(trpc.progress.batchRecordCards.mutationOptions())
  const cardResultsRef = useRef<{ cardId: string; correct: boolean }[]>([])
  const sessionSavedRef = useRef(false)
  const saveLastSessionMutation = useMutation(
    trpc.progress.saveLastSession.mutationOptions(),
  )
  const saveSessionMutation = useMutation(
    trpc.progress.saveSession.mutationOptions(),
  )
  const fetchDistractorsMutation = useMutation(
    trpc.distractors.getDistractors.mutationOptions(),
  )
  const prefetchDistractorsMutation = useMutation(
    trpc.distractors.getDistractors.mutationOptions(),
  )
  // vocabKey → resolved distractors (persists for the active session)
  const distractorCacheRef = useRef<Map<string, string[]>>(new Map())
  // vocabKey → in-flight promise (avoids duplicate requests)
  const distractorPendingRef = useRef<Map<string, Promise<string[]>>>(new Map())
  const currentDistractorFetchRef = useRef<string | null>(null)
  const answeredRef = useRef(false)
  const showSelfRateRef = useRef(false)
  const cardModeRef = useRef<'mc' | 'type' | 'selfrate'>('mc')
  const handleAnkiRateRef = useRef<(correct: boolean) => void>(() => {})

  const [page, setPage] = useState<Page>('wordset')

  // Word set selection
  const [lastSession, setLastSession] = useState<LastSession | null>(null)

  // Reconstruct lastSession from the user_last_session table on login
  useEffect(() => {
    const db = progressQuery.data?.lastSession
    if (!db || lastSession) return
    if (!db.wordSetDetail) return  // no valid data yet

    let vocab: Word[] = []
    let hskLevels = new Set<number>()
    let units = new Set<number>()
    let customSetId: string | undefined

    if (db.wordSetKey === 'hsk') {
      const detail = db.wordSetDetail.split(',').map(Number).filter(Boolean)
      if (detail.includes(1)) vocab = vocab.concat(hsk1Words)
      if (detail.includes(2)) vocab = vocab.concat(hsk2Words)
      hskLevels = new Set(detail)
    } else if (db.wordSetKey === 'lang1511') {
      const detail = db.wordSetDetail.split(',').map(Number).filter(Boolean)
      const unitSet = new Set(detail)
      vocab = lang1511Units.filter((u) => unitSet.has(u.unit)).flatMap((u) => u.words)
      units = new Set(detail)
    } else if (db.wordSetKey === 'custom') {
      if (!customWordSetsQuery.data) return // wait for custom sets to load
      const customSet = customWordSetsQuery.data.find((s) => s.id === db.wordSetDetail)
      if (!customSet) return
      vocab = customSet.words as Word[]
      customSetId = customSet.id
    }

    if (vocab.length === 0) return
    const size = ([10, 20, 30] as const).includes(db.sessionSize as 10 | 20 | 30)
      ? (db.sessionSize as 10 | 20 | 30)
      : 20
    const desc =
      db.wordSetKey === 'hsk'
        ? `HSK ${[...hskLevels].sort().join(' + ')} · ${vocab.length} words`
        : db.wordSetKey === 'custom'
          ? `${customWordSetsQuery.data?.find((s) => s.id === customSetId)?.name ?? 'Custom'} · ${vocab.length} words`
          : `LANG 1511 · Units ${[...units].sort((a, b) => a - b).join(', ')}`
    const modeStr = db.mode
    let soundSettings: SoundSettings | undefined
    let toneSessionSize: 10 | 20 | 30 | undefined
    let reconstructedSettings: Settings = {
      answerStyle: 'multiple-choice',
      defaultMode: 1,
      sessionSize: size,
    }
    if (modeStr === 'sound') {
      soundSettings = {
        answerFormat: 'char',
        answerStyle: 'multiple-choice',
        sessionSize: size,
      }
    } else if (modeStr === 'tone') {
      toneSessionSize = size
    } else {
      const modeNum = parseInt(modeStr.split(':')[1] ?? '1')
      reconstructedSettings = {
        answerStyle: 'multiple-choice',
        defaultMode: ([1, 2, 3].includes(modeNum) ? modeNum : 1) as 1 | 2 | 3,
        sessionSize: size,
      }
    }
    setLastSession({
      wordSetKey: db.wordSetKey,
      hskLevels,
      units,
      customSetId,
      settings: reconstructedSettings,
      soundSettings,
      toneSessionSize,
      vocab,
      desc,
    })
  }, [progressQuery.data, customWordSetsQuery.data]) // eslint-disable-line react-hooks/exhaustive-deps

  // Settings + mode
  const [settings, setSettings] = useState<Settings>({
    answerStyle: 'multiple-choice',
    defaultMode: 2,
    sessionSize: 20,
  })
  const [sessionMode, setSessionMode] = useState<1 | 2 | 3>(2)
  const [vocab, setVocab] = useState<Word[]>([])
  const [soundVocab, setSoundVocab] = useState<Word[]>([])
  const [soundSettings, setSoundSettings] = useState<SoundSettings>({
    answerFormat: 'char',
    answerStyle: 'multiple-choice',
    sessionSize: 10,
  })
  const [toneVocab, setToneVocab] = useState<Word[]>([])
  const [toneSessionSize, setToneSessionSize] = useState<10 | 20 | 30>(10)

  // All-time stats
  const [allTimeStats, setAllTimeStats] = useState<AllTimeStats>({
    studied: 0,
    correct: 0,
    sessions: 0,
  })

  // Study state
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [qIdx, setQIdx] = useState(0)
  const [score, setScore] = useState(0)
  const [wrongCount, setWrongCount] = useState(0)
  const [totalAttempts, setTotalAttempts] = useState(0)

  // Card faces
  const [faceA, setFaceA] = useState<CardContent | null>(null)
  const [faceB, setFaceB] = useState<CardContent | null>(null)
  const [isFlipped, setIsFlipped] = useState(false)

  // Answer state
  const [answered, setAnswered] = useState(false)
  const [nextBtnVisible, setNextBtnVisible] = useState(false)
  const [cardMode, setCardMode] = useState<'mc' | 'type' | 'selfrate'>('mc')
  const [answerTarget, setAnswerTarget] = useState<'english' | 'pinyin'>(
    'english',
  )
  const [answerCorrect, setAnswerCorrect] = useState('')
  const [answerChoices, setAnswerChoices] = useState<string[]>([])
  const [choiceStates, setChoiceStates] = useState<
    Record<string, 'correct' | 'wrong'>
  >({})
  const [typeValue, setTypeValue] = useState('')
  const [typeResult, setTypeResult] = useState<'correct' | 'wrong' | null>(null)
  const [showSelfRate, setShowSelfRate] = useState(false)

  // Refs to avoid stale closures
  const queueRef = useRef<QueueItem[]>([])
  const vocabRef = useRef<Word[]>([])
  const settingsRef = useRef(settings)
  const sessionModeRef = useRef<1 | 2 | 3>(2)
  const isFlippedRef = useRef(false)
  const nextBtnVisibleRef = useRef(false)
  const handleNextRef = useRef<() => void>(() => {})

  useEffect(() => {
    queueRef.current = queue
  }, [queue])
  useEffect(() => {
    vocabRef.current = vocab
  }, [vocab])
  useEffect(() => {
    settingsRef.current = settings
  }, [settings])
  useEffect(() => {
    sessionModeRef.current = sessionMode
  }, [sessionMode])
  useEffect(() => {
    isFlippedRef.current = isFlipped
  }, [isFlipped])
  useEffect(() => {
    nextBtnVisibleRef.current = nextBtnVisible
  }, [nextBtnVisible])
  useEffect(() => {
    answeredRef.current = answered
  }, [answered])
  useEffect(() => {
    showSelfRateRef.current = showSelfRate
  }, [showSelfRate])
  useEffect(() => {
    cardModeRef.current = cardMode
  }, [cardMode])

  // Upgrade to AI distractors when they arrive (if same card, not yet answered)
  useEffect(() => {
    const data = fetchDistractorsMutation.data
    const vars = fetchDistractorsMutation.variables
    if (!data || !vars) return
    if (vars.vocabKey !== currentDistractorFetchRef.current) return
    if (answeredRef.current) return
    distractorCacheRef.current.set(vars.vocabKey, data.distractors)
    setAnswerChoices(shuffle([vars.correctAnswer, ...data.distractors]))
  }, [fetchDistractorsMutation.data]) // eslint-disable-line react-hooks/exhaustive-deps

  // Kick off a distractor prefetch for a word so it's ready before doRenderCard runs
  function prefetchDistractors(word: Word) {
    const key = word.char
    // Already resolved — nothing to do
    if (distractorCacheRef.current.has(key)) return
    // Already in flight — nothing to do
    if (distractorPendingRef.current.has(key)) return
    const promise = prefetchDistractorsMutation
      .mutateAsync({ vocabKey: key, char: word.char, pinyin: word.pinyin, correctAnswer: word.english })
      .then((r) => {
        distractorCacheRef.current.set(key, r.distractors)
        distractorPendingRef.current.delete(key)
        return r.distractors
      })
      .catch(() => {
        distractorPendingRef.current.delete(key)
        return [] as string[]
      })
    distractorPendingRef.current.set(key, promise)
  }

  function doRenderCard(idx: number, currentFlipped: boolean, q: QueueItem[]) {
    const item = q[idx]
    if (!item) return
    const { word, stage } = item
    const mode = sessionModeRef.current
    const s = settingsRef.current
    const v = vocabRef.current

    const qContent = getQuestionContent(word, stage, mode)
    const aContent = getAnswerContent(word, stage, mode)

    if (currentFlipped) {
      setFaceB(qContent)
      setFaceA(aContent)
    } else {
      setFaceA(qContent)
      setFaceB(aContent)
    }

    setAnswered(false)
    setNextBtnVisible(false)
    setChoiceStates({})
    setTypeValue('')
    setTypeResult(null)
    setShowSelfRate(false)

    if (stage === 3) {
      setCardMode('selfrate')
      setAnswerCorrect(word.char)
      setAnswerChoices([])
    } else {
      const target: 'english' | 'pinyin' =
        mode === 1 || stage === 2 ? 'english' : 'pinyin'
      const correct = target === 'english' ? word.english : word.pinyin
      setAnswerTarget(target)
      setAnswerCorrect(correct)

      if (s.answerStyle === 'multiple-choice') {
        setCardMode('mc')
        if (target === 'english') {
          setAnswerChoices([])
          currentDistractorFetchRef.current = word.char
          const key = word.char

          // 1. Already in cache — instant
          const cached = distractorCacheRef.current.get(key)
          if (cached) {
            setAnswerChoices(shuffle([word.english, ...cached]))
            currentDistractorFetchRef.current = null
          } else {
            // 2. Prefetch already in flight — wait for it
            const pending = distractorPendingRef.current.get(key)
            if (pending) {
              pending.then((distractors) => {
                if (currentDistractorFetchRef.current === key && !answeredRef.current) {
                  setAnswerChoices(shuffle([word.english, ...distractors]))
                  currentDistractorFetchRef.current = null
                }
              }).catch(() => {
                fetchDistractorsMutation.mutate({ vocabKey: key, char: word.char, pinyin: word.pinyin, correctAnswer: word.english })
              })
            } else {
              // 3. Nothing available — fire a fresh fetch
              fetchDistractorsMutation.mutate({ vocabKey: key, char: word.char, pinyin: word.pinyin, correctAnswer: word.english })
            }
          }
        } else {
          // Pinyin targets have no AI fetch — set choices immediately
          const distractors = shuffle(v.filter((w) => w !== word)).slice(0, 3)
          const options = shuffle([word, ...distractors])
          setAnswerChoices(options.map((o) => o.pinyin))
          currentDistractorFetchRef.current = null
        }
      } else {
        setCardMode('type')
        setAnswerChoices([])
      }
    }
  }

  function handleStartStudy(v: Word[], mode: 1 | 2 | 3, s: Settings) {
    const q = buildQueue(
      v,
      mode,
      s.sessionSize === 30 ? v.length : s.sessionSize,
    )
    setQueue(q)
    queueRef.current = q
    vocabRef.current = v
    setVocab(v)
    setQIdx(0)
    setScore(0)
    setWrongCount(0)
    setTotalAttempts(0)
    setIsFlipped(false)
    isFlippedRef.current = false
    setAllTimeStats((prev) => ({ ...prev, sessions: prev.sessions + 1 }))
    sessionModeRef.current = mode
    settingsRef.current = s
    cardResultsRef.current = []
    sessionSavedRef.current = false
    distractorCacheRef.current = new Map()
    distractorPendingRef.current = new Map()

    // Prefetch distractors for the first 3 cards so they're ready immediately
    if (s.answerStyle === 'multiple-choice') {
      for (let i = 0; i < Math.min(3, q.length); i++) {
        const item = q[i]
        if (!item || item.stage === 3) continue
        const target = mode === 1 || item.stage === 2 ? 'english' : 'pinyin'
        if (target === 'english') prefetchDistractors(item.word)
      }
    }

    doRenderCard(0, false, q)
    setPage('study')
  }

  function handleReveal() {
    const newFlipped = !isFlippedRef.current
    setIsFlipped(newFlipped)
    isFlippedRef.current = newFlipped
    setShowSelfRate(true)
  }

  function handleAnkiRate(correct: boolean) {
    if (answeredRef.current) return
    setTotalAttempts((p) => p + 1)
    if (correct) {
      setScore((p) => p + 1)
      setAllTimeStats((p) => ({ ...p, correct: p.correct + 1 }))
    } else {
      setWrongCount((p) => p + 1)
    }
    setAllTimeStats((p) => ({ ...p, studied: p.studied + 1 }))
    setAnswered(true)
    if (isSignedIn) {
      const word = queueRef.current[qIdx]?.word
      if (word) cardResultsRef.current.push({ cardId: word.char, correct })
    }
    // Anki-style: rating immediately advances to the next card
    handleNextRef.current()
  }

  function handleChoiceAnswer(chosen: string) {
    if (answered) return
    setAnswered(true)
    setTotalAttempts((p) => p + 1)
    const correct = answerCorrect
    const isCorrect =
      chosen.trim().toLowerCase() === correct.trim().toLowerCase()
    const states: Record<string, 'correct' | 'wrong'> = {}
    answerChoices.forEach((c) => {
      if (c.trim().toLowerCase() === correct.trim().toLowerCase())
        states[c] = 'correct'
    })
    if (!isCorrect) states[chosen] = 'wrong'
    setChoiceStates(states)
    if (isCorrect) {
      setScore((p) => p + 1)
      setAllTimeStats((p) => ({ ...p, correct: p.correct + 1 }))
    } else {
      setWrongCount((p) => p + 1)
    }
    setAllTimeStats((p) => ({ ...p, studied: p.studied + 1 }))
    setNextBtnVisible(true)
    if (isSignedIn) {
      const word = queueRef.current[qIdx]?.word
      if (word) cardResultsRef.current.push({ cardId: word.char, correct: isCorrect })
    }
  }

  function handleTypeSubmit() {
    if (answered || !typeValue.trim()) return
    setAnswered(true)
    setTotalAttempts((p) => p + 1)
    const isCorrect =
      normalizeAnswer(typeValue) === normalizeAnswer(answerCorrect)
    setTypeResult(isCorrect ? 'correct' : 'wrong')
    if (isCorrect) {
      setScore((p) => p + 1)
      setAllTimeStats((p) => ({ ...p, correct: p.correct + 1 }))
    } else {
      setWrongCount((p) => p + 1)
    }
    setAllTimeStats((p) => ({ ...p, studied: p.studied + 1 }))
    setNextBtnVisible(true)
    if (isSignedIn) {
      const word = queueRef.current[qIdx]?.word
      if (word) cardResultsRef.current.push({ cardId: word.char, correct: isCorrect })
    }
  }

  function handleNext() {
    const currentQ = queueRef.current
    const currentFlipped = isFlippedRef.current
    const nextIdx = qIdx + 1

    if (nextIdx >= currentQ.length) {
      setPage('results')
      // Guard against double-fire (rapid Enter/click before React re-renders)
      if (isSignedIn && !sessionSavedRef.current) {
        sessionSavedRef.current = true
        // Refetch progress so ResultsPage shows up-to-date mastery
        void progressQuery.refetch()
        // Flush batched per-card results in a single call
        const results = cardResultsRef.current
        cardResultsRef.current = []
        if (results.length > 0) batchRecordCardsMutation.mutate(results)
        saveSessionMutation.mutate({
          wordSetKey: lastSession?.wordSetKey ?? 'unknown',
          wordSetDetail: wordSetDetailOf(lastSession),
          mode: `study:${sessionModeRef.current}`,
          sessionSize: settingsRef.current.sessionSize,
          correctCount: score,
          totalCount: totalAttempts,
        })
      }
      return
    }

    const nextItem = currentQ[nextIdx]
    const nextQContent = getQuestionContent(
      nextItem.word,
      nextItem.stage,
      sessionModeRef.current,
    )

    // Pre-load next question on hidden face
    if (currentFlipped) {
      setFaceA(nextQContent)
    } else {
      setFaceB(nextQContent)
    }

    // Prefetch distractors for the next 2 cards — cache deduplicates repeat words
    const mode = sessionModeRef.current
    const s = settingsRef.current
    if (s.answerStyle === 'multiple-choice') {
      for (let ahead = 0; ahead <= 1; ahead++) {
        const futureItem = currentQ[nextIdx + ahead]
        if (!futureItem || futureItem.stage === 3) continue
        const target = mode === 1 || futureItem.stage === 2 ? 'english' : 'pinyin'
        if (target === 'english') prefetchDistractors(futureItem.word)
      }
    }

    setAnswerChoices([])
    setNextBtnVisible(false)

    const newFlipped = !currentFlipped
    setIsFlipped(newFlipped)
    isFlippedRef.current = newFlipped
    setQIdx(nextIdx)

    setTimeout(() => {
      doRenderCard(nextIdx, newFlipped, queueRef.current)
    }, 560)
  }

  // Keep action refs current
  handleNextRef.current = handleNext
  handleAnkiRateRef.current = handleAnkiRate

  // Keyboard listener
  useEffect(() => {
    if (page !== 'study') return
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      // Space reveals the card in selfrate mode
      if (e.key === ' ' && cardModeRef.current === 'selfrate' && !showSelfRateRef.current && !answeredRef.current) {
        e.preventDefault()
        handleReveal()
        return
      }

      // 1=Again 2=Hard 3=Good 4=Easy
      if (['1', '2', '3', '4'].includes(e.key) && cardModeRef.current === 'selfrate' && showSelfRateRef.current && !answeredRef.current) {
        e.preventDefault()
        handleAnkiRateRef.current(e.key === '3' || e.key === '4')
        return
      }

      // Enter advances to next card in mc/type modes
      if (e.key === 'Enter' && nextBtnVisibleRef.current) {
        handleNextRef.current()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [page])

  // ── RENDER ───────────────────────────────────────────────────────
  if (page === 'wordset') {
    return (
      <WordSetPage
        lastSession={lastSession}
        allTimeStats={allTimeStats}
        settings={settings}
        cardProgress={progressQuery.data?.cards}
        customWordSets={customWordSetsQuery.data ?? []}
        isSignedIn={isSignedIn}
        onContinue={(v, mode, s, session) => {
          setVocab(v)
          setSessionMode(mode)
          setSettings(s)
          if (session) setLastSession(session)
          handleStartStudy(v, mode, s)
          if (isSignedIn && session) {
            saveLastSessionMutation.mutate({
              wordSetKey: session.wordSetKey,
              wordSetDetail: wordSetDetailOf(session),
              mode: `study:${mode}`,
              sessionSize: s.sessionSize,
            })
          }
        }}
        onStartSoundOnly={(v, ss, session) => {
          setSoundVocab(v)
          setSoundSettings(ss)
          if (session) setLastSession(session)
          setPage('sound')
          if (isSignedIn && session) {
            saveLastSessionMutation.mutate({
              wordSetKey: session.wordSetKey,
              wordSetDetail: wordSetDetailOf(session),
              mode: 'sound',
              sessionSize: ss.sessionSize,
            })
          }
        }}
        onStartToneQuiz={(v, sz, session) => {
          setToneVocab(v)
          setToneSessionSize(sz)
          if (session) setLastSession(session)
          setPage('tone')
          if (isSignedIn && session) {
            saveLastSessionMutation.mutate({
              wordSetKey: session.wordSetKey,
              wordSetDetail: wordSetDetailOf(session),
              mode: 'tone',
              sessionSize: sz,
            })
          }
        }}
        onSignIn={onSignIn}
      />
    )
  }

  if (page === 'sound') {
    return (
      <SoundOnlyPage
        vocab={soundVocab}
        soundSettings={soundSettings}
        onBack={() => setPage('wordset')}
        onSessionComplete={
          isSignedIn
            ? (stats) =>
                saveSessionMutation.mutate({
                  wordSetKey: lastSession?.wordSetKey ?? 'unknown',
                  wordSetDetail: wordSetDetailOf(lastSession),
                  mode: 'sound',
                  sessionSize: soundSettings.sessionSize,
                  correctCount: stats.correct,
                  totalCount: stats.total,
                })
            : undefined
        }
      />
    )
  }

  if (page === 'tone') {
    return (
      <ToneQuizPage
        vocab={toneVocab}
        sessionSize={toneSessionSize}
        onBack={() => setPage('wordset')}
        onSessionComplete={
          isSignedIn
            ? (stats) =>
                saveSessionMutation.mutate({
                  wordSetKey: lastSession?.wordSetKey ?? 'unknown',
                  wordSetDetail: wordSetDetailOf(lastSession),
                  mode: 'tone',
                  sessionSize: toneSessionSize,
                  correctCount: stats.correct,
                  totalCount: stats.total,
                })
            : undefined
        }
      />
    )
  }

  if (page === 'results') {
    const pct =
      totalAttempts > 0 ? Math.round((score / totalAttempts) * 100) : 0
    const words = queue.filter((q) => q.stage === 1).length
    return (
      <ResultsPage
        correct={score}
        wrong={wrongCount}
        pct={pct}
        words={words}
        vocab={vocab}
        cardProgress={progressQuery.data?.cards}
        streak={progressQuery.data?.streak}
        onStudyAgain={() => handleStartStudy(vocab, sessionMode, settings)}
        onHome={() => setPage('wordset')}
      />
    )
  }

  // study page
  const currentItem = queue[qIdx]
  const pct = queue.length > 0 ? Math.round((qIdx / queue.length) * 100) : 0

  // Card context for the inline chat — updates automatically as cards advance
  const chatCtx: ChatCardContext | undefined = currentItem?.word
    ? {
        char: currentItem.word.char,
        pinyin: currentItem.word.pinyin,
        english: currentItem.word.english,
        category: lastSession?.wordSetKey,
      }
    : undefined

  return (
    <div className="fc-app">
      {/* Back button (fixed) */}
      <button onClick={() => setPage('wordset')} className="fc-back-btn">
        ← Home
      </button>

      {/* Study workspace: header spans full width, body is two-column grid */}
      <div className="fc-study-workspace">

        {/* Progress header — spans both columns */}
        <StudyHeader current={qIdx + 1} total={queue.length} pct={pct} score={score} />

        {/* Two-column grid body */}
        <div className="fc-study-body">

          {/* Stage dots (grid row 1, col 1) */}
          <StageDots stageCount={sessionMode} currentStage={currentItem?.stage ?? 0} />

          {/* Card + answers (grid row 2, col 1) */}
          <div className="fc-card-answers">
            {/* Card */}
            <div className="fc-card-scene">
              <div className={`fc-card-inner${isFlipped ? ' flipped' : ''}`}>
                <CardFace content={faceA} hanzi={currentItem?.word.char ?? ''} />
                <CardFace content={faceB} isBack hanzi={currentItem?.word.char ?? ''} />
              </div>
            </div>

            {/* Answer area */}
            <div className="fc-answer-area">
              {cardMode === 'selfrate' && (
                <>
                  {!showSelfRate ? (
                    <div style={{ textAlign: 'center' }}>
                      <button className="fc-flip-btn" onClick={handleReveal}>
                        Reveal
                      </button>
                      <div className="fc-flip-hint">press Space</div>
                    </div>
                  ) : (
                    <div>
                      <p className="fc-self-rate-label">How well did you know it?</p>
                      <div className="fc-anki-rating">
                        <button
                          className="fc-anki-btn fc-anki-again"
                          disabled={answered}
                          onClick={() => handleAnkiRate(false)}
                        >
                          <span className="fc-anki-key">1</span>
                          Again
                        </button>
                        <button
                          className="fc-anki-btn fc-anki-hard"
                          disabled={answered}
                          onClick={() => handleAnkiRate(false)}
                        >
                          <span className="fc-anki-key">2</span>
                          Hard
                        </button>
                        <button
                          className="fc-anki-btn fc-anki-good"
                          disabled={answered}
                          onClick={() => handleAnkiRate(true)}
                        >
                          <span className="fc-anki-key">3</span>
                          Good
                        </button>
                        <button
                          className="fc-anki-btn fc-anki-easy"
                          disabled={answered}
                          onClick={() => handleAnkiRate(true)}
                        >
                          <span className="fc-anki-key">4</span>
                          Easy
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {cardMode === 'mc' && answerChoices.length === 0 && !answered && (
                <div className="fc-choices fc-choices--loading">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="fc-choice-btn fc-choice-btn--skeleton" />
                  ))}
                </div>
              )}

              {cardMode === 'mc' && answerChoices.length > 0 && (
                <AnswerChoices
                  choices={answerChoices}
                  choiceStates={choiceStates}
                  answered={answered}
                  onChoose={handleChoiceAnswer}
                />
              )}

              {cardMode === 'type' && (
                <div className="fc-type-area">
                  <input
                    className={`fc-type-input${typeResult ? ` ${typeResult}` : ''}`}
                    placeholder={
                      answerTarget === 'pinyin'
                        ? 'Type pinyin (e.g. nǐ hǎo)...'
                        : 'Type English meaning...'
                    }
                    value={typeValue}
                    disabled={answered}
                    onChange={(e) => setTypeValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleTypeSubmit()
                    }}
                    autoFocus
                  />
                  <button
                    className="fc-submit-btn"
                    disabled={answered}
                    onClick={handleTypeSubmit}
                  >
                    Check
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Next button (grid row 3, col 1) */}
          <NextButton visible={nextBtnVisible} onClick={handleNext} />

          {/* RIGHT: inline AI chat (grid row 2, col 2) */}
          <div className="fc-study-right">
            <ChatPanel cardContext={chatCtx} inline />
            <PronunciationBox />
          </div>

        </div>
      </div>
    </div>
  )
}

// ── CHAT PANEL ───────────────────────────────────────────────────
interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ChatCardContext {
  char: string
  pinyin: string
  english: string
  category?: string
}

const CHAT_SUGGESTIONS_DEFAULT = [
  'How do I say "thank you" in Chinese?',
  'Explain tones in Mandarin.',
  'Give me 3 example sentences using 你好.',
]

function CHAT_SUGGESTIONS_FOR_CARD(ctx: ChatCardContext) {
  return [
    `Use ${ctx.char} in a sentence.`,
    `What does ${ctx.char} mean exactly?`,
    `How do I remember ${ctx.char}?`,
  ]
}

function ChatPanel({
  cardContext,
  onClose,
  inline = false,
}: {
  cardContext?: ChatCardContext
  onClose?: () => void
  inline?: boolean
}) {
  const trpc = useTRPC()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const sendMutation = useMutation(trpc.chat.sendMessage.mutationOptions())

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  // Close on Escape (overlay mode only)
  useEffect(() => {
    if (inline) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [inline, onClose])

  async function sendMessage(text: string) {
    const userText = text.trim()
    if (!userText || isLoading) return
    setInput('')
    setErrorMsg('')
    const newMessages: ChatMessage[] = [...messages, { role: 'user', content: userText }]
    setMessages(newMessages)
    setIsLoading(true)
    try {
      const result = await sendMutation.mutateAsync({
        messages: newMessages,
        cardContext,
      })
      setMessages((prev) => [...prev, { role: 'assistant', content: result.content }])
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Something went wrong. Please try again.'
      setErrorMsg(msg)
    } finally {
      setIsLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const suggestions = cardContext
    ? CHAT_SUGGESTIONS_FOR_CARD(cardContext)
    : CHAT_SUGGESTIONS_DEFAULT

  const panel = (
    <div className={inline ? 'fc-chat-panel--inline' : 'fc-chat-panel--overlay'}>
      {/* Header */}
      <div className="fc-chat-header">
        <div className="fc-chat-header-left">
          <span className="fc-chat-title">Ask AI</span>
        </div>
        {!inline && onClose && (
          <button className="fc-chat-close" onClick={onClose} aria-label="Close chat">
            ✕
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="fc-chat-messages">
        {messages.length === 0 ? (
          <div className="fc-chat-empty">
            <div className="fc-chat-empty-char">
              {cardContext ? cardContext.char : '问'}
            </div>
            <div>
              {cardContext
                ? `Ask anything about ${cardContext.char} or Chinese in general.`
                : 'Ask me anything about Mandarin Chinese!'}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`fc-chat-msg ${msg.role}`}>
              <div className="fc-chat-bubble">{msg.content}</div>
            </div>
          ))
        )}
        {/* Suggestions always visible at the bottom, updating with each new card */}
        {!isLoading && (
          <div className="fc-chat-suggestions">
            {suggestions.map((s) => (
              <button
                key={s}
                className="fc-chat-suggest-btn"
                onClick={() => sendMessage(s)}
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {isLoading && (
          <div className="fc-chat-msg assistant">
            <div className="fc-chat-bubble fc-chat-typing">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Error */}
      {errorMsg && <div className="fc-chat-error">{errorMsg}</div>}

      {/* Input */}
      <div className="fc-chat-input-row">
        <textarea
          ref={inputRef}
          className="fc-chat-input"
          rows={1}
          placeholder="Ask about Chinese…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
        />
        <button
          className="fc-chat-send"
          onClick={() => sendMessage(input)}
          disabled={isLoading || !input.trim()}
          aria-label="Send"
        >
          ↑
        </button>
      </div>
    </div>
  )

  if (inline) return panel

  return (
    <div
      className="fc-chat-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
    >
      {panel}
    </div>
  )
}

// ── PRONUNCIATION BOX ─────────────────────────────────────────────
const MAX_TRANSLATIONS = 5

function isChineseText(text: string) {
  return /[\u4e00-\u9fff]/.test(text)
}

function PronunciationBox() {
  const trpc = useTRPC()
  const [input, setInput] = useState('')
  const [translationsLeft, setTranslationsLeft] = useState(MAX_TRANSLATIONS)
  const [result, setResult] = useState<{ char: string; pinyin: string } | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const translateMutation = useMutation(trpc.chat.translateToZh.mutationOptions())

  const isChinese = isChineseText(input.trim())
  const translationBlocked = !isChinese && translationsLeft <= 0

  async function handlePlay() {
    const text = input.trim()
    if (!text || isLoading || translationBlocked) return
    setErrorMsg('')
    setIsLoading(true)

    try {
      if (isChinese) {
        setResult(null)
        speakHanzi(text)
      } else {
        const translated = await translateMutation.mutateAsync({ text })
        setResult(translated)
        speakHanzi(translated.char)
        setTranslationsLeft((n) => n - 1)
      }
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Something went wrong.'
      setErrorMsg(msg)
    } finally {
      setIsLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handlePlay()
    }
  }

  return (
    <div className="fc-pronbox">
      <div className="fc-pronbox-header">
        <span className="fc-pronbox-title">Pronunciation</span>
        <span className="fc-pronbox-limit">
          {translationsLeft > 0
            ? `${translationsLeft} English translation${translationsLeft !== 1 ? 's' : ''} left`
            : 'Translation limit reached'}
        </span>
      </div>
      <div className="fc-pronbox-body">
        <textarea
          className="fc-pronbox-input"
          rows={3}
          placeholder="Type Chinese, pinyin, or English…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
        />
        <button
          className="fc-pronbox-play"
          onClick={handlePlay}
          disabled={isLoading || !input.trim() || translationBlocked}
          aria-label="Play pronunciation"
        >
          {isLoading ? (
            <span className="fc-pronbox-spinner" />
          ) : (
            <Volume2 size={18} />
          )}
        </button>
      </div>
      {result && (
        <div className="fc-pronbox-result">
          <span className="fc-pronbox-result-char">{result.char}</span>
          <span className="fc-pronbox-result-pinyin">{result.pinyin}</span>
        </div>
      )}
      {errorMsg && <div className="fc-pronbox-error">{errorMsg}</div>}
    </div>
  )
}

// ── SOUND ONLY PAGE ───────────────────────────────────────────────
function SoundOnlyPage({
  vocab,
  soundSettings,
  onBack,
  onSessionComplete,
}: {
  vocab: Word[]
  soundSettings: SoundSettings
  onBack: () => void
  onSessionComplete?: (stats: { correct: number; total: number }) => void
}) {
  const { answerFormat, answerStyle, sessionSize, stageCount = 1 } = soundSettings

  function buildQueue(): Word[] {
    const count =
      sessionSize === 30 ? vocab.length : Math.min(sessionSize, vocab.length)
    return shuffle(vocab).slice(0, count)
  }

  const [queue, setQueue] = useState<Word[]>(() => buildQueue())
  const [idx, setIdx] = useState(0)
  const [stage, setStage] = useState<1 | 2>(1)
  const [score, setScore] = useState(0)
  const [totalAttempts, setTotalAttempts] = useState(0)
  const [answered, setAnswered] = useState(false)
  const [nextBtnVisible, setNextBtnVisible] = useState(false)
  const [done, setDone] = useState(false)
  const [choiceWords, setChoiceWords] = useState<Word[]>([])
  const [choiceStates, setChoiceStates] = useState<
    Record<string, 'correct' | 'wrong'>
  >({})
  const [englishChoices, setEnglishChoices] = useState<Word[]>([])
  const [englishChoiceStates, setEnglishChoiceStates] = useState<
    Record<string, 'correct' | 'wrong'>
  >({})
  const [typeValue, setTypeValue] = useState('')
  const [typeResult, setTypeResult] = useState<'correct' | 'wrong' | null>(null)

  const nextBtnVisibleRef = useRef(false)
  const handleNextRef = useRef<() => void>(() => {})
  useEffect(() => {
    nextBtnVisibleRef.current = nextBtnVisible
  }, [nextBtnVisible])

  // Set up question and auto-play when the word changes
  useEffect(() => {
    const word = queue[idx]
    if (!word) return
    setStage(1)
    setAnswered(false)
    setNextBtnVisible(false)
    setChoiceStates({})
    setEnglishChoiceStates({})
    setTypeValue('')
    setTypeResult(null)
    if (answerStyle === 'multiple-choice') {
      const distractors = shuffle(
        vocab.filter((w) => w.char !== word.char),
      ).slice(0, 3)
      setChoiceWords(shuffle([word, ...distractors]))
      if (stageCount === 2) {
        const engDistractors = shuffle(
          vocab.filter((w) => w.char !== word.char),
        ).slice(0, 3)
        setEnglishChoices(shuffle([word, ...engDistractors]))
      }
    }
    const t = setTimeout(() => speakHanzi(word.char), 150)
    return () => clearTimeout(t)
  }, [idx, queue]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard: Enter → Next, Space → Replay
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.code === 'Space') {
        e.preventDefault()
        const word = queue[idx]
        if (word && !done && stage === 1) speakHanzi(word.char)
        return
      }
      if (e.key !== 'Enter') return
      if (nextBtnVisibleRef.current) handleNextRef.current()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [queue, idx, done, stage]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleChoice(word: Word) {
    if (answered) return
    const currentWord = queue[idx]
    setAnswered(true)
    setTotalAttempts((p) => p + 1)
    const isCorrect = word.char === currentWord.char
    const states: Record<string, 'correct' | 'wrong'> = {
      [currentWord.char]: 'correct',
    }
    if (!isCorrect) states[word.char] = 'wrong'
    setChoiceStates(states)
    if (isCorrect) setScore((p) => p + 1)
    setNextBtnVisible(true)
  }

  function handleEnglishChoice(word: Word) {
    if (answered) return
    const currentWord = queue[idx]
    setAnswered(true)
    setTotalAttempts((p) => p + 1)
    const isCorrect = word.char === currentWord.char
    const states: Record<string, 'correct' | 'wrong'> = {
      [currentWord.char]: 'correct',
    }
    if (!isCorrect) states[word.char] = 'wrong'
    setEnglishChoiceStates(states)
    if (isCorrect) setScore((p) => p + 1)
    setNextBtnVisible(true)
  }

  function handleTypeSubmit() {
    const currentWord = queue[idx]
    if (answered || !typeValue.trim() || !currentWord) return
    setAnswered(true)
    setTotalAttempts((p) => p + 1)
    const isCorrect =
      normalizeAnswer(typeValue) === normalizeAnswer(currentWord.pinyin)
    setTypeResult(isCorrect ? 'correct' : 'wrong')
    if (isCorrect) setScore((p) => p + 1)
    setNextBtnVisible(true)
  }

  function handleNext() {
    // In 2-stage mode, first Next press advances to stage 2
    if (stageCount === 2 && stage === 1) {
      setStage(2)
      setAnswered(false)
      setNextBtnVisible(false)
      return
    }
    if (idx + 1 >= queue.length) {
      setDone(true)
      onSessionComplete?.({ correct: score, total: totalAttempts })
      return
    }
    setIdx((p) => p + 1)
  }
  handleNextRef.current = handleNext

  function startSession() {
    const newQ = buildQueue()
    setQueue(newQ)
    setIdx(0)
    setStage(1)
    setScore(0)
    setTotalAttempts(0)
    setDone(false)
  }

  const currentWord = queue[idx] ?? null
  const pct = queue.length > 0 ? Math.round((idx / queue.length) * 100) : 0

  if (done) {
    return (
      <SessionCompleteScreen
        score={score}
        totalAttempts={totalAttempts}
        queueLength={queue.length}
        onStudyAgain={startSession}
        onBack={onBack}
      />
    )
  }

  const soundChatCtx: ChatCardContext | undefined = currentWord
    ? { char: currentWord.char, pinyin: currentWord.pinyin, english: currentWord.english }
    : undefined

  return (
    <div className="fc-app">
      <button onClick={onBack} className="fc-back-btn">
        ← Home
      </button>

      <div className="fc-study-workspace">
        <StudyHeader current={idx + 1} total={queue.length} pct={pct} score={score} />

        <div className="fc-study-body">
          <StageDots stageCount={stageCount} currentStage={stage} />

          <div className="fc-card-answers">
            {/* Stage 1: audio card */}
            {stage === 1 && (
              <div className="fc-card-scene">
                <div className="fc-card-inner">
                  <div className="fc-card-face">
                    <div className="fc-card-tag">What word do you hear?</div>
                    <button
                      className="fc-sound-play-btn"
                      onClick={(e) => {
                        e.currentTarget.blur()
                        currentWord && speakHanzi(currentWord.char)
                      }}
                      aria-label="Replay pronunciation"
                    >
                      <Volume2 size={36} />
                    </button>
                    <div className="fc-sound-hint">Tap or press Space to replay</div>
                  </div>
                </div>
              </div>
            )}

            {/* Stage 2: character card → guess English */}
            {stage === 2 && currentWord && (
              <div className="fc-card-scene">
                <div className="fc-card-inner">
                  <div className="fc-card-face">
                    <div className="fc-card-tag">What does this mean?</div>
                    <div className="fc-card-char" style={charFontStyle(currentWord.char, true)}>{currentWord.char}</div>
                    <div className="fc-card-pinyin">{currentWord.pinyin}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Answers */}
            <div className="fc-answer-area">
              {/* Stage 1 answers */}
              {stage === 1 && answerStyle === 'multiple-choice' && choiceWords.length > 0 && (
                <div
                  className={`fc-choices${answerFormat === 'both' || (answerFormat === 'char' && answered) ? ' fc-choices--tall' : ''}`}
                >
                  {choiceWords.map((w) => (
                    <button
                      key={w.char}
                      className={`fc-choice-btn${choiceStates[w.char] ? ` ${choiceStates[w.char]}` : ''}`}
                      disabled={answered}
                      onClick={() => handleChoice(w)}
                    >
                      {answerFormat === 'char' &&
                        (answered ? (
                          <span className="fc-sound-choice-both">
                            <span className="fc-sound-choice-char">{w.char}</span>
                            <span className="fc-sound-choice-pinyin">{w.pinyin}</span>
                          </span>
                        ) : (
                          <span className="fc-sound-choice-char">{w.char}</span>
                        ))}
                      {answerFormat === 'pinyin' && w.pinyin}
                      {answerFormat === 'both' && (
                        <span className="fc-sound-choice-both">
                          <span className="fc-sound-choice-char">{w.char}</span>
                          <span className="fc-sound-choice-pinyin">{w.pinyin}</span>
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {stage === 1 && answerStyle === 'type' && (
                <div className="fc-type-area">
                  <input
                    className={`fc-type-input${typeResult ? ` ${typeResult}` : ''}`}
                    placeholder="Type pinyin (e.g. nǐ hǎo)..."
                    value={typeValue}
                    disabled={answered}
                    onChange={(e) => setTypeValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleTypeSubmit()
                    }}
                    autoFocus
                  />
                  {answered && typeResult === 'wrong' && currentWord && (
                    <div className="fc-type-correct">
                      Correct: {currentWord.pinyin} ({currentWord.char})
                    </div>
                  )}
                  <button
                    className="fc-submit-btn"
                    disabled={answered}
                    onClick={handleTypeSubmit}
            >
                    Check
                  </button>
                </div>
              )}

              {/* Stage 2 answers: guess English meaning */}
              {stage === 2 && englishChoices.length > 0 && (
                <AnswerChoices
                  choices={englishChoices.map((w) => w.english)}
                  choiceStates={Object.fromEntries(
                    englishChoices
                      .filter((w) => englishChoiceStates[w.char])
                      .map((w) => [w.english, englishChoiceStates[w.char]]),
                  )}
                  answered={answered}
                  onChoose={(english) => {
                    const w = englishChoices.find((x) => x.english === english)
                    if (w) handleEnglishChoice(w)
                  }}
                />
              )}
            </div>
          </div>

          <NextButton visible={nextBtnVisible} onClick={handleNext} />

          <div className="fc-study-right">
            <ChatPanel cardContext={soundChatCtx} inline />
            <PronunciationBox />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── TONE QUIZ PAGE ────────────────────────────────────────────────
function ToneQuizPage({
  vocab,
  sessionSize,
  onBack,
  onSessionComplete,
}: {
  vocab: Word[]
  sessionSize: 10 | 20 | 30
  onBack: () => void
  onSessionComplete?: (stats: { correct: number; total: number }) => void
}) {
  function buildQueue(): Word[] {
    const count =
      sessionSize === 30 ? vocab.length : Math.min(sessionSize, vocab.length)
    return shuffle(vocab).slice(0, count)
  }

  const [queue, setQueue] = useState<Word[]>(() => buildQueue())
  const [idx, setIdx] = useState(0)
  const [score, setScore] = useState(0)
  const [totalAttempts, setTotalAttempts] = useState(0)
  const [answered, setAnswered] = useState(false)
  const [nextBtnVisible, setNextBtnVisible] = useState(false)
  const [done, setDone] = useState(false)
  const [choices, setChoices] = useState<string[]>([])
  const [choiceStates, setChoiceStates] = useState<
    Record<string, 'correct' | 'wrong'>
  >({})

  const nextBtnVisibleRef = useRef(false)
  const handleNextRef = useRef<() => void>(() => {})
  useEffect(() => {
    nextBtnVisibleRef.current = nextBtnVisible
  }, [nextBtnVisible])

  useEffect(() => {
    const word = queue[idx]
    if (!word) return
    setAnswered(false)
    setNextBtnVisible(false)
    setChoiceStates({})
    setChoices(buildToneChoices(word, vocab))
    const t = setTimeout(() => speakHanzi(word.char), 150)
    return () => clearTimeout(t)
  }, [idx, queue]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.code === 'Space') {
        e.preventDefault()
        const word = queue[idx]
        if (word && !done) speakHanzi(word.char)
        return
      }
      if (e.key !== 'Enter') return
      if (nextBtnVisibleRef.current) handleNextRef.current()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [queue, idx, done]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleChoice(choice: string) {
    if (answered) return
    const currentWord = queue[idx]
    setAnswered(true)
    setTotalAttempts((p) => p + 1)
    const isCorrect = choice === currentWord.pinyin
    const states: Record<string, 'correct' | 'wrong'> = {
      [currentWord.pinyin]: 'correct',
    }
    if (!isCorrect) states[choice] = 'wrong'
    setChoiceStates(states)
    if (isCorrect) setScore((p) => p + 1)
    setNextBtnVisible(true)
  }

  function handleNext() {
    if (idx + 1 >= queue.length) {
      setDone(true)
      onSessionComplete?.({ correct: score, total: totalAttempts })
      return
    }
    setIdx((p) => p + 1)
  }
  handleNextRef.current = handleNext

  function startSession() {
    const newQ = buildQueue()
    setQueue(newQ)
    setIdx(0)
    setScore(0)
    setTotalAttempts(0)
    setDone(false)
  }

  const currentWord = queue[idx] ?? null
  const pct = queue.length > 0 ? Math.round((idx / queue.length) * 100) : 0

  if (done) {
    return (
      <SessionCompleteScreen
        score={score}
        totalAttempts={totalAttempts}
        queueLength={queue.length}
        onStudyAgain={startSession}
        onBack={onBack}
      />
    )
  }

  const toneChatCtx: ChatCardContext | undefined = currentWord
    ? { char: currentWord.char, pinyin: currentWord.pinyin, english: currentWord.english }
    : undefined

  return (
    <div className="fc-app">
      <button onClick={onBack} className="fc-back-btn">
        ← Home
      </button>

      <div className="fc-study-workspace">
        <StudyHeader current={idx + 1} total={queue.length} pct={pct} score={score} />

        <div className="fc-study-body">
          <StageDots stageCount={1} currentStage={1} />

          <div className="fc-card-answers">
            <div className="fc-card-scene">
              <div className="fc-card-inner">
                <div className="fc-card-face">
                  <div className="fc-card-tag">Which tones are correct?</div>
                  {currentWord && (
                    <>
                      <div className="fc-card-pinyin" style={{ fontSize: '2rem' }}>
                        {stripTones(currentWord.pinyin)}
                      </div>
                      <div className="fc-card-english">{currentWord.english}</div>
                      <button
                        className="fc-speaker-btn"
                        style={{ marginTop: 8 }}
                        onClick={(e) => {
                          e.stopPropagation()
                          speakHanzi(currentWord.char)
                        }}
                        aria-label="Play pronunciation"
                      >
                        <Volume2 size={16} />
                      </button>
                      <div className="fc-sound-hint">Tap or press Space to replay</div>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="fc-answer-area">
              <AnswerChoices
                choices={choices}
                choiceStates={choiceStates}
                answered={answered}
                onChoose={handleChoice}
              />
            </div>
          </div>

          <NextButton visible={nextBtnVisible} onClick={handleNext} />

          <div className="fc-study-right">
            <ChatPanel cardContext={toneChatCtx} inline />
            <PronunciationBox />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── STREAK BANNER ─────────────────────────────────────────────────
// StreakBanner → src/components/flashcard/StreakBanner.tsx

// ── WORD SET DASHBOARD ────────────────────────────────────────────
// WordSetDashboard, ProgressCard, MasteryStats, computeWordSetMastery → src/components/flashcard/WordSetDashboard.tsx

// ── WORD SET PAGE ─────────────────────────────────────────────────
// ── INLINE LEADERBOARD SIDEBAR ────────────────────────────────────
function InlineLeaderboard() {
  const trpc = useTRPC()
  const lbQuery = useQuery({
    ...trpc.social.getWeeklyLeaderboard.queryOptions(),
    staleTime: 60_000,
  })

  const entries = lbQuery.data?.entries ?? []
  const hasFriends = lbQuery.data?.hasFriends ?? false

  return (
    <div className="fc-ws-lb">
      <div className="fc-ws-lb-header">
        <span className="fc-ws-lb-title">This Week</span>
        <Link to="/leaderboard" className="fc-ws-lb-fulllink">Full view →</Link>
      </div>

      {lbQuery.isPending && (
        <div className="fc-ws-lb-loading">
          <div className="fc-auth-spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
        </div>
      )}

      {!lbQuery.isPending && !hasFriends && (
        <div className="fc-ws-lb-empty">
          <Link to="/friends" className="fc-ws-lb-add-link">Add friends to compete →</Link>
        </div>
      )}

      {!lbQuery.isPending && hasFriends && entries.every((e) => e.xp === 0) && (
        <div className="fc-ws-lb-empty">No activity yet this week.</div>
      )}

      {!lbQuery.isPending && entries.map((entry) => (
        <div
          key={entry.userId}
          className={`fc-ws-lb-row${entry.isMe ? ' fc-ws-lb-row--me' : ''}`}
        >
          <span className="fc-ws-lb-rank">
            {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`}
          </span>
          <span className="fc-ws-lb-name">
            {entry.displayName}
            {entry.isMe && <span className="fc-ws-lb-you">you</span>}
          </span>
          <span className={`fc-ws-lb-xp${entry.xp === 0 ? ' fc-ws-lb-xp--zero' : ''}`}>
            {entry.xp > 0 ? `${entry.xp} XP` : '—'}
          </span>
        </div>
      ))}
    </div>
  )
}

function WordSetPage({
  lastSession,
  allTimeStats,
  settings: initialSettings,
  cardProgress,
  customWordSets,
  isSignedIn,
  onContinue,
  onStartSoundOnly,
  onStartToneQuiz,
  onSignIn,
}: {
  lastSession: LastSession | null
  allTimeStats: AllTimeStats
  settings: Settings
  cardProgress?: ProgressCard[]
  customWordSets: CustomWordSet[]
  isSignedIn: boolean
  onContinue: (
    vocab: Word[],
    mode: 1 | 2 | 3,
    settings: Settings,
    session: LastSession | null,
  ) => void
  onStartSoundOnly: (
    vocab: Word[],
    soundSettings: SoundSettings,
    session?: LastSession,
  ) => void
  onStartToneQuiz: (
    vocab: Word[],
    sessionSize: 10 | 20 | 30,
    session?: LastSession,
  ) => void
  onSignIn?: () => void
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const generateMutation = useMutation(trpc.wordsets.generate.mutationOptions())
  const saveMutation = useMutation(trpc.wordsets.save.mutationOptions())
  const updateMutation = useMutation(trpc.wordsets.update.mutationOptions())
  const deleteMutation = useMutation(trpc.wordsets.delete.mutationOptions())
  const toggleFavoriteMutation = useMutation(trpc.wordsets.toggleFavorite.mutationOptions())

  // Modal state
  const [showCustomModal, setShowCustomModal] = useState(false)
  // null = list view; 'upload' | 'paste' = create/edit view
  const [createMode, setCreateMode] = useState<'upload' | 'paste' | null>(null)
  // Create/edit form state
  const [uploadFiles, setUploadFiles] = useState<File[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [uploadName, setUploadName] = useState('')
  const [previewWords, setPreviewWords] = useState<Word[] | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  // Which word set is highlighted inside the modal (for the shared action bar)
  const [selectedModalSetId, setSelectedModalSetId] = useState<string | null>(null)
  // Set ID being edited (add more words); null = create new
  const [editTargetSetId, setEditTargetSetId] = useState<string | null>(null)
  const [selectedWordSet, setSelectedWordSet] = useState<string | null>(null)
  const [selectedUnits, setSelectedUnits] = useState<Set<number>>(new Set())
  const [selectedHSKLevels, setSelectedHSKLevels] = useState<Set<number>>(
    new Set(),
  )
  const [settings, setSettings] = useState<Settings>(initialSettings)
  const [soundOnlyOpen, setSoundOnlyOpen] = useState(false)
  const [soundSettings, setSoundSettings] = useState<SoundSettings>({
    answerFormat: 'char',
    answerStyle: 'multiple-choice',
    sessionSize: 10,
  })
  const [toneQuizOpen, setToneQuizOpen] = useState(false)

  const dashVocab = useMemo(() => {
    if (selectedWordSet === 'hsk') {
      if (selectedHSKLevels.size > 0) {
        let v: Word[] = []
        if (selectedHSKLevels.has(1)) v = v.concat(hsk1Words)
        if (selectedHSKLevels.has(2)) v = v.concat(hsk2Words)
        return v
      }
      return [...hsk1Words, ...hsk2Words]
    }
    if (selectedWordSet === 'lang1511') {
      if (selectedUnits.size > 0) {
        return lang1511Units
          .filter((u) => selectedUnits.has(u.unit))
          .flatMap((u) => u.words)
      }
      return lang1511Units.flatMap((u) => u.words)
    }
    if (selectedWordSet === 'last' && lastSession) return lastSession.vocab
    if (selectedWordSet?.startsWith('custom:')) {
      const id = selectedWordSet.slice(7)
      return customWordSets.find((s) => s.id === id)?.words ?? null
    }
    return null
  }, [selectedWordSet, selectedHSKLevels, selectedUnits, lastSession, customWordSets])

  // Drag-select state
  const mouseIsDownRef = useRef(false)
  const isDraggingRef = useRef(false)
  const dragAnchorIdxRef = useRef<number | null>(null)
  const dragActionRef = useRef<'select' | 'deselect'>('select')
  const dragTypeRef = useRef<'unit' | 'hsk' | null>(null)
  const preDragUnitsRef = useRef<Set<number>>(new Set())
  const preDragHSKRef = useRef<Set<number>>(new Set())

  useEffect(() => {
    const handleMouseUp = () => {
      if (mouseIsDownRef.current && !isDraggingRef.current) {
        // Pure click — toggle the single anchor item
        if (
          dragTypeRef.current === 'unit' &&
          dragAnchorIdxRef.current !== null
        ) {
          const anchorUnit = lang1511Units[dragAnchorIdxRef.current].unit
          setSelectedUnits((prev) => {
            const next = new Set(prev)
            if (dragActionRef.current === 'select') next.add(anchorUnit)
            else next.delete(anchorUnit)
            return next
          })
        } else if (
          dragTypeRef.current === 'hsk' &&
          dragAnchorIdxRef.current !== null
        ) {
          const anchorLevel = [1, 2][dragAnchorIdxRef.current]
          setSelectedHSKLevels((prev) => {
            const next = new Set(prev)
            if (dragActionRef.current === 'select') next.add(anchorLevel)
            else next.delete(anchorLevel)
            return next
          })
        }
      }
      mouseIsDownRef.current = false
      isDraggingRef.current = false
      dragAnchorIdxRef.current = null
      dragTypeRef.current = null
    }
    document.addEventListener('mouseup', handleMouseUp)
    return () => document.removeEventListener('mouseup', handleMouseUp)
  }, [])

  function buildSelectedVocab(): Word[] | null {
    if (selectedWordSet === 'hsk') {
      if (selectedHSKLevels.size === 0) {
        alert('Please select at least one HSK level.')
        return null
      }
      let v: Word[] = []
      if (selectedHSKLevels.has(1)) v = v.concat(hsk1Words)
      if (selectedHSKLevels.has(2)) v = v.concat(hsk2Words)
      return v
    }
    if (selectedWordSet === 'lang1511') {
      if (selectedUnits.size === 0) {
        alert('Please select at least one unit.')
        return null
      }
      return lang1511Units
        .filter((u) => selectedUnits.has(u.unit))
        .flatMap((u) => u.words)
    }
    if (selectedWordSet?.startsWith('custom:')) {
      const id = selectedWordSet.slice(7)
      const words = customWordSets.find((s) => s.id === id)?.words
      if (!words || words.length === 0) {
        alert('Word set not found.')
        return null
      }
      return words
    }
    alert('Please select a word set.')
    return null
  }

  function buildSessionDesc(v: Word[]): string {
    if (selectedWordSet === 'hsk')
      return `HSK ${[...selectedHSKLevels].sort().join(' + ')} · ${v.length} words`
    if (selectedWordSet?.startsWith('custom:')) {
      const id = selectedWordSet.slice(7)
      const name = customWordSets.find((s) => s.id === id)?.name ?? 'Custom'
      return `${name} · ${v.length} words`
    }
    return `LANG 1511 · Units ${[...selectedUnits].sort((a, b) => a - b).join(', ')}`
  }

  function buildSessionBase(v: Word[]): LastSession {
    const isCustom = selectedWordSet?.startsWith('custom:')
    return {
      wordSetKey: isCustom ? 'custom' : (selectedWordSet ?? ''),
      hskLevels: new Set(selectedHSKLevels),
      units: new Set(selectedUnits),
      customSetId: isCustom ? selectedWordSet!.slice(7) : undefined,
      settings: { ...settings },
      vocab: v,
      desc: buildSessionDesc(v),
    }
  }

  function handleStartSoundOnly() {
    const v = buildSelectedVocab()
    if (!v) return
    const ss: SoundSettings = {
      answerFormat: soundSettings.answerFormat,
      answerStyle: settings.answerStyle,
      sessionSize: settings.sessionSize,
      stageCount: settings.defaultMode >= 2 ? 2 : 1,
    }
    const session: LastSession = { ...buildSessionBase(v), soundSettings: ss }
    onStartSoundOnly(v, ss, session)
  }

  function handleStartToneQuiz() {
    const v = buildSelectedVocab()
    if (!v) return
    const session: LastSession = { ...buildSessionBase(v), toneSessionSize: settings.sessionSize }
    onStartToneQuiz(v, settings.sessionSize, session)
  }

  function handleGoNext() {
    if (selectedWordSet === 'last') {
      if (!lastSession) return
      if (lastSession.soundSettings) {
        onStartSoundOnly(lastSession.vocab, lastSession.soundSettings)
        return
      }
      if (lastSession.toneSessionSize !== undefined) {
        onStartToneQuiz(lastSession.vocab, lastSession.toneSessionSize)
        return
      }
      onContinue(
        lastSession.vocab,
        lastSession.settings.defaultMode,
        lastSession.settings,
        null,
      )
      return
    }

    const vocab = buildSelectedVocab()
    if (!vocab) return

    const session = buildSessionBase(vocab)

    onContinue(vocab, settings.defaultMode, settings, session)
  }

  async function handleGenerate() {
    setUploadError(null)
    setPreviewWords(null)
    try {
      let allWords: Word[] = []
      if (createMode === 'paste') {
        if (!pasteText.trim()) return
        const result = await generateMutation.mutateAsync({ pasteText }) as { words: Word[] }
        allWords = result.words
      } else {
        if (uploadFiles.length === 0) return
        for (const file of uploadFiles) {
          const buffer = await file.arrayBuffer()
          const bytes = new Uint8Array(buffer)
          let binary = ''
          const chunkSize = 8192
          for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
          }
          const base64 = btoa(binary)
          const result = await generateMutation.mutateAsync({
            fileName: file.name,
            fileBase64: base64,
          }) as { words: Word[] }
          // Merge, deduplicating by char
          const seen = new Set(allWords.map((w) => w.char))
          allWords = [...allWords, ...result.words.filter((w) => !seen.has(w.char))]
        }
      }
      setPreviewWords(allWords)
      if (!uploadName) {
        if (createMode === 'paste') {
          setUploadName('My Word Set')
        } else if (uploadFiles.length === 1) {
          setUploadName(uploadFiles[0]!.name.replace(/\.[^.]+$/, ''))
        } else {
          setUploadName('Combined Word Set')
        }
      }
    } catch (e: unknown) {
      setUploadError(e instanceof Error ? e.message : 'Generation failed.')
    }
  }

  async function handleSaveWordSet() {
    if (!previewWords || !uploadName.trim()) return
    setUploadError(null)
    try {
      if (editTargetSetId) {
        // Edit mode: merge new words into existing set
        await updateMutation.mutateAsync({ id: editTargetSetId, additionalWords: previewWords })
        await queryClient.invalidateQueries({ queryKey: trpc.wordsets.list.queryKey() })
        setCreateMode(null)
        setUploadFiles([])
        setPasteText('')
        setUploadName('')
        setPreviewWords(null)
        setEditTargetSetId(null)
      } else {
        const { id } = await saveMutation.mutateAsync({
          name: uploadName.trim(),
          words: previewWords,
          sourceFileName: createMode === 'upload' ? uploadFiles[0]?.name : undefined,
        }) as { id: string }
        await queryClient.invalidateQueries({ queryKey: trpc.wordsets.list.queryKey() })
        setSelectedWordSet(`custom:${id}`)
        setShowCustomModal(false)
        setCreateMode(null)
        setUploadFiles([])
        setPasteText('')
        setUploadName('')
        setPreviewWords(null)
      }
    } catch (e: unknown) {
      setUploadError(e instanceof Error ? e.message : 'Save failed.')
    }
  }

  async function handleDeleteCustomSet(id: string) {
    if (!confirm('Delete this word set?')) return
    await deleteMutation.mutateAsync({ id })
    await queryClient.invalidateQueries({ queryKey: trpc.wordsets.list.queryKey() })
    if (selectedWordSet === `custom:${id}`) setSelectedWordSet(null)
    if (selectedModalSetId === id) setSelectedModalSetId(null)
  }

  async function handleToggleFavorite(id: string) {
    await toggleFavoriteMutation.mutateAsync({ id })
    await queryClient.invalidateQueries({ queryKey: trpc.wordsets.list.queryKey() })
  }

  function handleEditSet(id: string) {
    const set = customWordSets.find((s) => s.id === id)
    setEditTargetSetId(id)
    setUploadName(set?.name ?? '')
    setCreateMode('upload')
    setPreviewWords(null)
    setUploadError(null)
  }


  return (
    <div className="fc-app">
      <div className="fc-nav-btns">
        {onSignIn ? (
          <button className="fc-profile-nav-btn" onClick={onSignIn}>
            Sign in
          </button>
        ) : (
          <Link to="/profile" className="fc-profile-icon-btn" aria-label="Profile">
            <User size={18} strokeWidth={1.8} />
          </Link>
        )}
      </div>
      <div className="fc-wordset-container">
        <div className="fc-ws-outer-row">
        <div className="fc-ws-layout">
          {/* Left: brand + stats + word set buttons */}
          <div className="fc-ws-left">
            <div className="fc-ws-brand">
              <div className="fc-ws-brand-title">学中文</div>
              <div className="fc-ws-brand-sub">Choose a word set to study.</div>
            </div>
            {allTimeStats.sessions > 0 && (
              <div className="fc-stats-bar fc-stats-bar--compact">
                <div className="fc-stat">
                  <div className="fc-stat-num">{allTimeStats.studied}</div>
                  <div className="fc-stat-label">Words Studied</div>
                </div>
                <div className="fc-stat">
                  <div className="fc-stat-num">{allTimeStats.correct}</div>
                  <div className="fc-stat-label">Correct</div>
                </div>
                <div className="fc-stat">
                  <div className="fc-stat-num">{allTimeStats.sessions}</div>
                  <div className="fc-stat-label">Sessions</div>
                </div>
              </div>
            )}
          <div className="fc-ws-list">
            <button
              className={`fc-ws-btn${selectedWordSet === 'hsk' ? ' selected' : ''}`}
              onClick={() =>
                setSelectedWordSet(selectedWordSet === 'hsk' ? null : 'hsk')
              }
            >
              <span className="fc-ws-char">汉语</span>
              <span className="fc-ws-label">HSK</span>
              <span className="fc-ws-count">2 levels · 300 words</span>
              <span className="fc-ws-desc">Official HSK vocabulary</span>
            </button>
            <button
              className={`fc-ws-btn${selectedWordSet === 'lang1511' ? ' selected' : ''}`}
              onClick={() =>
                setSelectedWordSet(
                  selectedWordSet === 'lang1511' ? null : 'lang1511',
                )
              }
            >
              <span className="fc-ws-char">课程</span>
              <span className="fc-ws-label">LANG 1511</span>
              <span className="fc-ws-count">10 units · 123 words</span>
              <span className="fc-ws-desc">University course vocabulary</span>
            </button>
            {lastSession && (
              <button
                className={`fc-ws-btn${selectedWordSet === 'last' ? ' selected' : ''}`}
                onClick={() =>
                  setSelectedWordSet(selectedWordSet === 'last' ? null : 'last')
                }
              >
                <span className="fc-ws-char">上次</span>
                <span className="fc-ws-label">Last Session</span>
                <span className="fc-ws-count">{lastSession.desc}</span>
                <span className="fc-ws-desc">Continue where you left off</span>
              </button>
            )}

            {isSignedIn && (
              <button
                className={`fc-ws-btn${selectedWordSet?.startsWith('custom:') ? ' selected' : ''}`}
                onClick={() => setShowCustomModal(true)}
              >
                <span className="fc-ws-char">自定</span>
                <span className="fc-ws-label">My Word Sets</span>
                <span className="fc-ws-count">
                  {customWordSets.length === 0
                    ? 'No sets yet'
                    : `${customWordSets.length} set${customWordSets.length !== 1 ? 's' : ''}`}
                </span>
                <span className="fc-ws-desc">
                  {selectedWordSet?.startsWith('custom:')
                    ? customWordSets.find((s) => s.id === selectedWordSet.slice(7))?.name ?? 'Custom set selected'
                    : 'Upload a document or paste text'}
                </span>
              </button>
            )}
          </div>{/* end fc-ws-list */}
          </div>{/* end fc-ws-left */}

          {/* Right: scrollable content area + pinned start button */}
          <div className="fc-ws-right">
            <div className="fc-ws-right-scroll">
            {selectedWordSet ? (
              <>
                {/* Progress dashboard — always at top, updates with selection */}
                {dashVocab && cardProgress && (
                  <WordSetDashboard vocab={dashVocab} cardProgress={cardProgress} />
                )}

                {/* Session Settings */}
                {selectedWordSet !== 'last' && !selectedWordSet.startsWith('custom') && (
                  <div className="fc-settings-wrap">
                    {/* HSK level picker */}
                    {selectedWordSet === 'hsk' && (
                      <div className="fc-settings-section">
                        <div className="fc-settings-label">HSK Level</div>
                        <div className="fc-picker-grid">
                          {[1, 2].map((level, idx) => (
                            <button
                              key={level}
                              className={`fc-unit-btn${selectedHSKLevels.has(level) ? ' selected' : ''}`}
                              onMouseDown={() => {
                                mouseIsDownRef.current = true
                                isDraggingRef.current = false
                                dragAnchorIdxRef.current = idx
                                dragTypeRef.current = 'hsk'
                                dragActionRef.current = selectedHSKLevels.has(level)
                                  ? 'deselect'
                                  : 'select'
                                preDragHSKRef.current = new Set(selectedHSKLevels)
                              }}
                              onMouseEnter={() => {
                                if (
                                  !mouseIsDownRef.current ||
                                  dragTypeRef.current !== 'hsk' ||
                                  dragAnchorIdxRef.current === null
                                )
                                  return
                                isDraggingRef.current = true
                                const hskLevels = [1, 2]
                                const [lo, hi] = [
                                  Math.min(dragAnchorIdxRef.current, idx),
                                  Math.max(dragAnchorIdxRef.current, idx),
                                ]
                                const next = new Set(preDragHSKRef.current)
                                hskLevels.slice(lo, hi + 1).forEach((l) => {
                                  if (dragActionRef.current === 'select') next.add(l)
                                  else next.delete(l)
                                })
                                setSelectedHSKLevels(next)
                              }}
                            >
                              HSK {level}{' '}
                              <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>
                                (150)
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* LANG 1511 unit picker */}
                    {selectedWordSet === 'lang1511' && (
                      <div className="fc-settings-section">
                        <div className="fc-settings-label">Units</div>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                          <button
                            className="fc-util-btn"
                            onClick={() =>
                              setSelectedUnits(new Set(lang1511Units.map((u) => u.unit)))
                            }
                          >
                            Select all
                          </button>
                          <button
                            className="fc-util-btn"
                            onClick={() => setSelectedUnits(new Set())}
                          >
                            Clear
                          </button>
                        </div>
                        <div className="fc-picker-grid fc-picker-grid--units">
                          {lang1511Units.map((u, idx) => (
                            <button
                              key={u.unit}
                              className={`fc-unit-btn${selectedUnits.has(u.unit) ? ' selected' : ''}`}
                              onMouseDown={() => {
                                mouseIsDownRef.current = true
                                isDraggingRef.current = false
                                dragAnchorIdxRef.current = idx
                                dragTypeRef.current = 'unit'
                                dragActionRef.current = selectedUnits.has(u.unit)
                                  ? 'deselect'
                                  : 'select'
                                preDragUnitsRef.current = new Set(selectedUnits)
                              }}
                              onMouseEnter={() => {
                                if (
                                  !mouseIsDownRef.current ||
                                  dragTypeRef.current !== 'unit' ||
                                  dragAnchorIdxRef.current === null
                                )
                                  return
                                isDraggingRef.current = true
                                const [lo, hi] = [
                                  Math.min(dragAnchorIdxRef.current, idx),
                                  Math.max(dragAnchorIdxRef.current, idx),
                                ]
                                const next = new Set(preDragUnitsRef.current)
                                lang1511Units.slice(lo, hi + 1).forEach((unit) => {
                                  if (dragActionRef.current === 'select')
                                    next.add(unit.unit)
                                  else next.delete(unit.unit)
                                })
                                setSelectedUnits(next)
                              }}
                            >
                              Unit {u.unit}{' '}
                              <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>
                                ({u.words.length})
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {(selectedWordSet === 'hsk' || selectedWordSet === 'lang1511') && (
                      <div className="fc-settings-divider" />
                    )}
                    <div
                      className="fc-settings-section"
                      style={toneQuizOpen ? { opacity: 0.35, pointerEvents: 'none' } : undefined}
                    >
                      <div className="fc-settings-label">Study Mode</div>
                      <div className="fc-settings-options">
                        {([1, 2, 3] as const).map((m) => (
                          <button
                            key={m}
                            className={`fc-setting-opt${settings.defaultMode === m ? ' selected' : ''}`}
                            disabled={soundOnlyOpen && m === 3}
                            style={soundOnlyOpen && m === 3 ? { opacity: 0.35 } : undefined}
                            onClick={() =>
                              setSettings((s) => ({ ...s, defaultMode: m }))
                            }
                          >
                            {m} Card{m > 1 ? 's' : ''}
                          </button>
                        ))}
                      </div>
                      <p className="fc-settings-mode-hint">
                        {settings.defaultMode === 1 &&
                          'See character + pinyin, guess the English meaning.'}
                        {settings.defaultMode === 2 &&
                          'Guess pinyin from character, then guess English.'}
                        {settings.defaultMode === 3 &&
                          'Full cycle: character → pinyin → English → recall character.'}
                      </p>
                    </div>
                    <div className="fc-settings-section">
                      <div className="fc-settings-label">Answer Style</div>
                      <div className="fc-settings-options">
                        {(
                          [
                            ['multiple-choice', 'Multiple Choice'],
                            ['type', 'Type Answer'],
                          ] as const
                        ).map(([val, label]) => (
                          <button
                            key={val}
                            className={`fc-setting-opt${settings.answerStyle === val ? ' selected' : ''}`}
                            onClick={() =>
                              setSettings((s) => ({ ...s, answerStyle: val }))
                            }
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="fc-settings-section">
                      <div className="fc-settings-label">Cards per Session</div>
                      <div className="fc-settings-options">
                        {(
                          [
                            [10, '10'],
                            [20, '20'],
                            [30, 'All'],
                          ] as const
                        ).map(([val, label]) => (
                          <button
                            key={val}
                            className={`fc-setting-opt${settings.sessionSize === val ? ' selected' : ''}`}
                            onClick={() =>
                              setSettings((s) => ({ ...s, sessionSize: val }))
                            }
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div
                      className="fc-settings-section"
                      style={toneQuizOpen ? { opacity: 0.35, pointerEvents: 'none' } : undefined}
                    >
                      <div className="fc-settings-label">Sound Only Mode</div>
                      <div className="fc-settings-options">
                        <button
                          className={`fc-setting-opt${!soundOnlyOpen ? ' selected' : ''}`}
                          onClick={() => setSoundOnlyOpen(false)}
                        >
                          Off
                        </button>
                        {(
                          [
                            ['char', 'Characters'],
                            ['pinyin', 'Pinyin'],
                            ['both', 'Char + Pinyin'],
                          ] as const
                        ).map(([val, label]) => (
                          <button
                            key={val}
                            className={`fc-setting-opt${soundOnlyOpen && soundSettings.answerFormat === val ? ' selected' : ''}`}
                            onClick={() => {
                              setSoundOnlyOpen(true)
                              setToneQuizOpen(false)
                              setSoundSettings((s) => ({ ...s, answerFormat: val }))
                              if (settings.defaultMode === 3)
                                setSettings((s) => ({ ...s, defaultMode: 1 }))
                            }}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div
                      className="fc-settings-section"
                      style={soundOnlyOpen ? { opacity: 0.35, pointerEvents: 'none' } : undefined}
                    >
                      <div className="fc-settings-label">Tone Quiz Mode</div>
                      <div className="fc-settings-options">
                        <button
                          className={`fc-setting-opt${!toneQuizOpen ? ' selected' : ''}`}
                          onClick={() => setToneQuizOpen(false)}
                        >
                          Off
                        </button>
                        <button
                          className={`fc-setting-opt${toneQuizOpen ? ' selected' : ''}`}
                          onClick={() => {
                            setToneQuizOpen(true)
                            setSoundOnlyOpen(false)
                          }}
                        >
                          On
                        </button>
                      </div>
                      {toneQuizOpen && (
                        <p className="fc-settings-mode-hint">
                          See pinyin without tones + English, pick the correct tones.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="fc-ws-right-empty">
                ← Select a word set to get started
              </div>
            )}

            <button
              className="fc-start-btn"
              onClick={
                soundOnlyOpen
                  ? handleStartSoundOnly
                  : toneQuizOpen
                    ? handleStartToneQuiz
                    : handleGoNext
              }
            >
              {soundOnlyOpen ||
              (selectedWordSet === 'last' && lastSession?.soundSettings)
                ? 'Start Sound Only →'
                : toneQuizOpen ||
                    (selectedWordSet === 'last' &&
                      lastSession?.toneSessionSize !== undefined)
                  ? 'Start Tone Quiz →'
                  : selectedWordSet === 'last'
                    ? 'Start →'
                    : 'Start Studying →'}
            </button>
            </div>{/* end fc-ws-right-scroll */}
          </div>
        </div>{/* end fc-ws-layout */}

        {/* Leaderboard sidebar — visible on large screens only, sibling to layout */}
        {isSignedIn && <InlineLeaderboard />}
        </div>{/* end fc-ws-outer-row */}
      </div>

      {/* ── CUSTOM WORD SETS MODAL ────────────────────────────────── */}
      {showCustomModal && (
        <div
          className="fc-modal-overlay"
          onClick={() => {
            setShowCustomModal(false)
            setCreateMode(null)
            setPreviewWords(null)
            setUploadError(null)
            setEditTargetSetId(null)
            setUploadFiles([])
            setSelectedModalSetId(null)
          }}
        >
          <div className="fc-modal" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="fc-modal-header">
              {createMode !== null && (
                <button
                  className="fc-modal-back"
                  onClick={() => {
                    setCreateMode(null)
                    setPreviewWords(null)
                    setUploadError(null)
                    setUploadFiles([])
                    setPasteText('')
                    setUploadName('')
                    setEditTargetSetId(null)
                    setSelectedModalSetId(null)
                  }}
                >
                  ← Back
                </button>
              )}
              <span className="fc-modal-title">
                {createMode !== null
                  ? editTargetSetId ? 'Add More Words' : 'Create Word Set'
                  : 'My Word Sets'}
              </span>
              <button
                className="fc-modal-close"
                onClick={() => {
                  setShowCustomModal(false)
                  setCreateMode(null)
                  setPreviewWords(null)
                  setUploadError(null)
                  setEditTargetSetId(null)
                  setUploadFiles([])
                  setSelectedModalSetId(null)
                }}
              >
                ✕
              </button>
            </div>

            {/* LIST VIEW — scrollable cards, shared action bar, footer */}
            {createMode === null && (
              <>
                <div className="fc-modal-scroll-body">
                  {customWordSets.length === 0 ? (
                    <p className="fc-modal-empty">No word sets yet. Create one below.</p>
                  ) : (
                    <div className="fc-modal-set-list">
                      {customWordSets.map((cs) => (
                        <button
                          key={cs.id}
                          className={`fc-modal-set-row${selectedModalSetId === cs.id ? ' selected' : ''}`}
                          onClick={() => setSelectedModalSetId(selectedModalSetId === cs.id ? null : cs.id)}
                        >
                          <span className="fc-modal-set-name">
                            {cs.isFavorited && <span className="fc-modal-set-star">★ </span>}
                            {cs.name}
                          </span>
                          <span className="fc-modal-set-meta">{cs.wordCount} words</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Bottom toolbar — 5 buttons always visible, right-aligned */}
                <div className="fc-modal-toolbar">
                  <button
                    className="fc-modal-action-study"
                    disabled={!selectedModalSetId}
                    onClick={() => {
                      if (!selectedModalSetId) return
                      setSelectedWordSet(`custom:${selectedModalSetId}`)
                      setShowCustomModal(false)
                      setSelectedModalSetId(null)
                    }}
                  >
                    Study
                  </button>
                  <button
                    className="fc-modal-action-edit"
                    disabled={!selectedModalSetId}
                    onClick={() => { if (selectedModalSetId) handleEditSet(selectedModalSetId) }}
                  >
                    Edit
                  </button>
                  <button
                    className={`fc-modal-action-fav${customWordSets.find((cs) => cs.id === selectedModalSetId)?.isFavorited ? ' active' : ''}`}
                    disabled={!selectedModalSetId}
                    onClick={() => { if (selectedModalSetId) void handleToggleFavorite(selectedModalSetId) }}
                  >
                    {customWordSets.find((cs) => cs.id === selectedModalSetId)?.isFavorited ? 'Unfavorite' : 'Favorite'}
                  </button>
                  <button
                    className="fc-modal-action-delete"
                    disabled={!selectedModalSetId}
                    onClick={() => { if (selectedModalSetId) void handleDeleteCustomSet(selectedModalSetId) }}
                  >
                    Delete
                  </button>
                  <button
                    className="fc-modal-action-new"
                    onClick={() => { setCreateMode('upload'); setSelectedModalSetId(null) }}
                  >
                    New+
                  </button>
                </div>
              </>
            )}

            {/* CREATE / EDIT VIEW */}
            {createMode !== null && (
              <div className="fc-modal-body">
                {/* Input mode toggle */}
                <div className="fc-modal-mode-tabs">
                  <button
                    className={`fc-modal-tab${createMode === 'upload' ? ' active' : ''}`}
                    onClick={() => {
                      setCreateMode('upload')
                      setPreviewWords(null)
                      setUploadError(null)
                    }}
                  >
                    Upload Document
                  </button>
                  <button
                    className={`fc-modal-tab${createMode === 'paste' ? ' active' : ''}`}
                    onClick={() => {
                      setCreateMode('paste')
                      setPreviewWords(null)
                      setUploadError(null)
                    }}
                  >
                    Paste Text
                  </button>
                </div>

                {/* Upload / drag-and-drop input */}
                {createMode === 'upload' && !previewWords && (
                  <div
                    className={`fc-upload-dropzone${isDragOver ? ' drag-over' : ''}`}
                    onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault()
                      setIsDragOver(false)
                      const files = Array.from(e.dataTransfer.files).filter((f) =>
                        /\.(txt|pdf|docx)$/i.test(f.name),
                      )
                      if (files.length > 0) {
                        setUploadFiles(files)
                        setPreviewWords(null)
                        setUploadError(null)
                        if (!uploadName && files.length === 1)
                          setUploadName(files[0]!.name.replace(/\.[^.]+$/, ''))
                      }
                    }}
                  >
                    <label className="fc-upload-label">
                      <span className="fc-upload-drop-hint">
                        {isDragOver ? 'Drop files here' : 'Click to browse or drag & drop'}
                      </span>
                      <span className="fc-upload-file-types">.txt · .pdf · .docx — multiple files OK</span>
                      <input
                        type="file"
                        accept=".txt,.pdf,.docx"
                        multiple
                        className="fc-upload-file-input"
                        onChange={(e) => {
                          const files = Array.from(e.target.files ?? [])
                          setUploadFiles(files)
                          setPreviewWords(null)
                          setUploadError(null)
                          if (files.length === 1 && !uploadName)
                            setUploadName(files[0]!.name.replace(/\.[^.]+$/, ''))
                        }}
                      />
                    </label>
                    {uploadFiles.length > 0 && (
                      <div className="fc-upload-file-list">
                        {uploadFiles.map((f, i) => (
                          <span key={i} className="fc-upload-file-chip">{f.name}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Paste input */}
                {createMode === 'paste' && !previewWords && (
                  <label className="fc-upload-label">
                    Paste your text
                    <textarea
                      className="fc-upload-paste-input"
                      placeholder="Paste Chinese text, a vocabulary list, lesson notes, etc."
                      value={pasteText}
                      onChange={(e) => setPasteText(e.target.value)}
                      rows={7}
                      maxLength={20000}
                    />
                    <span className="fc-upload-paste-count">{pasteText.length} / 20,000 chars</span>
                  </label>
                )}

                {/* Extract button */}
                {!previewWords && (
                  <button
                    className="fc-upload-generate-btn"
                    disabled={
                      generateMutation.isPending ||
                      (createMode === 'upload' ? uploadFiles.length === 0 : !pasteText.trim())
                    }
                    onClick={() => void handleGenerate()}
                  >
                    {generateMutation.isPending ? 'Extracting vocabulary…' : 'Extract Vocabulary →'}
                  </button>
                )}

                {uploadError && <p className="fc-upload-error">{uploadError}</p>}

                {/* Preview + save */}
                {previewWords && (
                  <>
                    <div className="fc-upload-preview-header">
                      <span>{previewWords.length} words extracted</span>
                      <button
                        className="fc-modal-redo"
                        onClick={() => {
                          setPreviewWords(null)
                          setUploadError(null)
                        }}
                      >
                        Try again
                      </button>
                    </div>
                    <div className="fc-upload-preview-list">
                      {previewWords.map((w, i) => (
                        <div key={i} className="fc-upload-preview-row">
                          <span className="fc-upload-preview-char">{w.char}</span>
                          <span className="fc-upload-preview-pinyin">{w.pinyin}</span>
                          <span className="fc-upload-preview-english">{w.english}</span>
                        </div>
                      ))}
                    </div>
                    {!editTargetSetId && (
                      <label className="fc-upload-label">
                        Name this word set
                        <input
                          type="text"
                          className="fc-upload-name-input"
                          placeholder="e.g. Chapter 3 vocabulary"
                          value={uploadName}
                          onChange={(e) => setUploadName(e.target.value)}
                          maxLength={100}
                        />
                      </label>
                    )}
                    <button
                      className="fc-upload-save-btn"
                      disabled={
                        (!editTargetSetId && !uploadName.trim()) ||
                        saveMutation.isPending ||
                        updateMutation.isPending
                      }
                      onClick={() => void handleSaveWordSet()}
                    >
                      {saveMutation.isPending || updateMutation.isPending
                        ? 'Saving…'
                        : editTargetSetId
                          ? 'Add Words to Set →'
                          : 'Save & Start Studying →'}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── RESULTS PAGE ──────────────────────────────────────────────────
// ResultsPage → src/components/flashcard/ResultsPage.tsx
