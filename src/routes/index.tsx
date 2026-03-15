import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Volume2 } from 'lucide-react'
import { hsk1Words, hsk2Words, lang1511Units } from '../data/vocabulary'
import type { Word } from '../data/vocabulary'
import { authClient } from '#/lib/auth-client'
import { useTRPC } from '#/integrations/trpc/react'

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
  settings: Settings
  soundSettings?: SoundSettings
  toneSessionSize?: 10 | 20 | 30
  vocab: Word[]
  desc: string
}

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

interface CardContent {
  tag: string
  char?: string
  pinyin?: string
  pinyinLarge?: boolean
  english?: string
  englishLarge?: boolean
  isRecall?: boolean
}

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
  const stages: (1 | 2 | 3)[] =
    mode === 1 ? [1] : mode === 2 ? [1, 2] : [1, 2, 3]
  return words.flatMap((w) => stages.map((s) => ({ word: w, stage: s })))
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
let _currentAudio: HTMLAudioElement | null = null

// Fallback: Web Speech API for any word without a cached MP3
let _zhVoice: SpeechSynthesisVoice | null = null

function loadZhVoice() {
  const voices = window.speechSynthesis.getVoices()
  _zhVoice =
    voices.find((v) => v.lang === 'zh-CN') ??
    voices.find((v) => v.lang === 'zh-TW') ??
    voices.find((v) => v.lang.startsWith('zh')) ??
    null
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  window.speechSynthesis.addEventListener('voiceschanged', loadZhVoice)
  loadZhVoice()
}

function speakFallback(hanzi: string) {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  setTimeout(() => {
    const chars = [...hanzi]
    const text =
      chars.length > 1
        ? chars.join('\u2009') + '\u2009，。'
        : hanzi + '，。'
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'zh-CN'
    utterance.rate = 0.65
    if (_zhVoice) utterance.voice = _zhVoice
    window.speechSynthesis.speak(utterance)
  }, 80)
}

function speakHanzi(hanzi: string) {
  if (!hanzi) return

  // Stop any currently playing audio
  if (_currentAudio) {
    _currentAudio.pause()
    _currentAudio.currentTime = 0
    _currentAudio = null
  }
  window.speechSynthesis?.cancel()

  const src = '/audio/' + encodeURIComponent(hanzi) + '.mp3'
  const audio = new Audio(src)
  _currentAudio = audio

  function play() {
    if (_currentAudio !== audio) return // superseded by a newer call
    audio.play().catch(() => speakFallback(hanzi))
  }

  if (audio.readyState >= 3) {
    play()
  } else {
    audio.addEventListener('canplaythrough', play, { once: true })
    audio.addEventListener('error', () => speakFallback(hanzi), { once: true })
  }
}

// ── CARD FACE ────────────────────────────────────────────────────
// Card usable width ≈ 448px = 28rem (560px card – 56px padding each side).
// Target 25rem so there's always a margin. Each CJK char is ~1em wide.
function charFontStyle(
  char: string,
  compact: boolean,
): React.CSSProperties | undefined {
  const len = [...char].length
  const cssMax = compact ? 6 : 10
  const fitMax = 25 / len
  if (fitMax >= cssMax) return undefined // CSS clamp handles it fine
  return { fontSize: `${Math.max(1.5, fitMax).toFixed(2)}rem` }
}

function CardFace({
  content,
  isBack,
  hanzi,
}: {
  content: CardContent | null
  isBack?: boolean
  hanzi: string
}) {
  return (
    <div className={`fc-card-face${isBack ? ' back' : ''}`}>
      {hanzi && (
        <button
          className="fc-speaker-btn"
          onClick={(e) => {
            e.stopPropagation()
            speakHanzi(hanzi)
          }}
          aria-label="Play pronunciation"
        >
          <Volume2 size={16} />
        </button>
      )}
      {content && (
        <>
          <div className="fc-card-tag">{content.tag}</div>
          {content.char && (
            <div
              className={`fc-card-char${content.pinyin ? ' fc-card-char--compact' : ''}`}
              style={charFontStyle(content.char, !!content.pinyin)}
            >
              {content.char}
            </div>
          )}
          {content.pinyin && (
            <div
              className="fc-card-pinyin"
              style={content.pinyinLarge ? { fontSize: '2rem' } : undefined}
            >
              {content.pinyin}
            </div>
          )}
          {content.english && (
            <div
              className="fc-card-english"
              style={
                content.englishLarge
                  ? { fontSize: '2rem', margin: '12px 0' }
                  : undefined
              }
            >
              {content.english}
            </div>
          )}
          {content.isRecall && (
            <div className="fc-flip-hint">↩ Click to reveal</div>
          )}
        </>
      )}
    </div>
  )
}

// ── AUTH ──────────────────────────────────────────────────────────
function AuthPage({ onSkip }: { onSkip: () => void }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

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
  if (session.wordSetKey === 'hsk')
    return [...session.hskLevels].sort().join(',')
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
  const recordCard = useMutation(trpc.progress.recordCard.mutationOptions())
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
  // Stores an in-flight or completed prefetch so doRenderCard can consume it instantly
  const prefetchPromiseRef = useRef<{ vocabKey: string; promise: Promise<string[]> } | null>(null)
  const currentDistractorFetchRef = useRef<string | null>(null)
  const answeredRef = useRef(false)

  const [page, setPage] = useState<Page>('wordset')

  // Word set selection
  const [lastSession, setLastSession] = useState<LastSession | null>(null)

  // Reconstruct lastSession from the user_last_session table on login
  useEffect(() => {
    const db = progressQuery.data?.lastSession
    if (!db || lastSession) return
    if (!db.wordSetDetail) return  // no valid data yet
    const detail = db.wordSetDetail
      .split(',')
      .map(Number)
      .filter(Boolean)
    let vocab: Word[] = []
    if (db.wordSetKey === 'hsk') {
      if (detail.includes(1)) vocab = vocab.concat(hsk1Words)
      if (detail.includes(2)) vocab = vocab.concat(hsk2Words)
    } else if (db.wordSetKey === 'lang1511') {
      const unitSet = new Set(detail)
      vocab = lang1511Units
        .filter((u) => unitSet.has(u.unit))
        .flatMap((u) => u.words)
    }
    if (vocab.length === 0) return
    const size = ([10, 20, 30] as const).includes(db.sessionSize as 10 | 20 | 30)
      ? (db.sessionSize as 10 | 20 | 30)
      : 20
    const hskLevels = new Set<number>(
      db.wordSetKey === 'hsk' ? detail : [],
    )
    const units = new Set<number>(
      db.wordSetKey === 'lang1511' ? detail : [],
    )
    const desc =
      db.wordSetKey === 'hsk'
        ? `HSK ${[...hskLevels].sort().join(' + ')} · ${vocab.length} words`
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
      settings: reconstructedSettings,
      soundSettings,
      toneSessionSize,
      vocab,
      desc,
    })
  }, [progressQuery.data]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Upgrade to AI distractors when they arrive (if same card, not yet answered)
  useEffect(() => {
    const data = fetchDistractorsMutation.data
    const vars = fetchDistractorsMutation.variables
    if (!data || !vars) return
    if (vars.vocabKey !== currentDistractorFetchRef.current) return
    if (answeredRef.current) return
    setAnswerChoices(shuffle([vars.correctAnswer, ...data.distractors]))
  }, [fetchDistractorsMutation.data]) // eslint-disable-line react-hooks/exhaustive-deps

  // Kick off a distractor prefetch for a word so it's ready before doRenderCard runs
  function prefetchDistractors(word: Word) {
    const promise = prefetchDistractorsMutation
      .mutateAsync({
        vocabKey: word.char,
        char: word.char,
        pinyin: word.pinyin,
        correctAnswer: word.english,
      })
      .then((r) => r.distractors)
    prefetchPromiseRef.current = { vocabKey: word.char, promise }
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
          const prefetch = prefetchPromiseRef.current
          if (prefetch?.vocabKey === word.char) {
            // Consume the prefetch promise — may already be resolved (instant) or still in flight
            prefetchPromiseRef.current = null
            prefetch.promise
              .then((distractors) => {
                if (currentDistractorFetchRef.current === word.char && !answeredRef.current) {
                  setAnswerChoices(shuffle([word.english, ...distractors]))
                  currentDistractorFetchRef.current = null
                }
              })
              .catch(() => {
                // Prefetch failed — fall back to normal fetch
                fetchDistractorsMutation.mutate({
                  vocabKey: word.char,
                  char: word.char,
                  pinyin: word.pinyin,
                  correctAnswer: word.english,
                })
              })
          } else {
            // No prefetch available (first card or pinyin card before this)
            fetchDistractorsMutation.mutate({
              vocabKey: word.char,
              char: word.char,
              pinyin: word.pinyin,
              correctAnswer: word.english,
            })
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

    // Prefetch distractors for the first card so it's ready immediately
    if (s.answerStyle === 'multiple-choice') {
      const first = q[0]
      if (first && first.stage !== 3) {
        const target = mode === 1 || first.stage === 2 ? 'english' : 'pinyin'
        if (target === 'english') prefetchDistractors(first.word)
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

  function handleSelfRate(correct: boolean) {
    setTotalAttempts((p) => p + 1)
    if (correct) {
      setScore((p) => p + 1)
      setAllTimeStats((p) => ({ ...p, correct: p.correct + 1 }))
    } else {
      setWrongCount((p) => p + 1)
    }
    setAllTimeStats((p) => ({ ...p, studied: p.studied + 1 }))
    setAnswered(true)
    setNextBtnVisible(true)
    if (isSignedIn) {
      const word = queueRef.current[qIdx]?.word
      if (word) recordCard.mutate({ cardId: word.char, correct })
    }
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
      if (word) recordCard.mutate({ cardId: word.char, correct: isCorrect })
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
      if (word) recordCard.mutate({ cardId: word.char, correct: isCorrect })
    }
  }

  function handleNext() {
    const currentQ = queueRef.current
    const currentFlipped = isFlippedRef.current
    const nextIdx = qIdx + 1

    if (nextIdx >= currentQ.length) {
      setPage('results')
      if (isSignedIn) {
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

    // Prefetch distractors for next card NOW — the 560ms flip gives them time to load
    const mode = sessionModeRef.current
    const s = settingsRef.current
    if (s.answerStyle === 'multiple-choice' && nextItem.stage !== 3) {
      const target = mode === 1 || nextItem.stage === 2 ? 'english' : 'pinyin'
      if (target === 'english') prefetchDistractors(nextItem.word)
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

  // Keep handleNextRef current
  handleNextRef.current = handleNext

  // Keyboard listener
  useEffect(() => {
    if (page !== 'study') return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return
      const tag = (document.activeElement as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (nextBtnVisibleRef.current) handleNextRef.current()
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
        dbLastSession={progressQuery.data?.lastCompletedSession ?? null}
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
        <div className="fc-study-header">
          <div style={{ flex: 1 }}>
            <div className="fc-progress-label">
              Card {qIdx + 1} of {queue.length}
            </div>
            <div className="fc-progress-bar">
              <div className="fc-progress-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <div className="fc-score-badge">
            Score: <b style={{ color: '#27ae60' }}>{score}</b>
          </div>
        </div>

        {/* Two-column grid body */}
        <div className="fc-study-body">

          {/* Stage dots (grid row 1, col 1) */}
          <div className="fc-stage-dots">
            {sessionMode > 1 && currentItem
              ? Array.from({ length: sessionMode }, (_, i) => i + 1).map((i) => (
                  <div
                    key={i}
                    className={`fc-stage-dot${i === currentItem.stage ? ' active' : i < currentItem.stage ? ' done' : ''}`}
                  />
                ))
              : null}
          </div>

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
                    <button className="fc-flip-btn" onClick={handleReveal}>
                      Reveal Character
                    </button>
                  ) : (
                    <div>
                      <p className="fc-self-rate-label">Did you remember it?</p>
                      <div className="fc-choices" style={{ gridTemplateColumns: '1fr 1fr' }}>
                        <button
                          className={`fc-choice-btn${answered ? ' correct' : ''}`}
                          disabled={answered}
                          onClick={() => handleSelfRate(true)}
                          style={{ textAlign: 'center' }}
                        >
                          ✓ Yes
                        </button>
                        <button
                          className={`fc-choice-btn${answered ? ' wrong' : ''}`}
                          disabled={answered}
                          onClick={() => handleSelfRate(false)}
                          style={{ textAlign: 'center' }}
                        >
                          ✗ No
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
                <div className="fc-choices">
                  {answerChoices.map((choice) => (
                    <button
                      key={choice}
                      className={`fc-choice-btn${choiceStates[choice] ? ` ${choiceStates[choice]}` : ''}`}
                      disabled={answered}
                      onClick={() => handleChoiceAnswer(choice)}
                    >
                      {choice}
                    </button>
                  ))}
                </div>
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
          <div className="fc-study-next-area">
            <button
              className={`fc-next-btn${nextBtnVisible ? ' visible' : ''}`}
              onClick={handleNext}
            >
              Next →
            </button>
            {nextBtnVisible && <div className="fc-enter-hint">press Enter ↵</div>}
          </div>

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
    const finalPct =
      totalAttempts > 0 ? Math.round((score / totalAttempts) * 100) : 0
    return (
      <div className="fc-app">
        <div className="fc-results-container">
          <div className="fc-results-char">好！</div>
          <div>
            <div className="fc-results-title">Session Complete</div>
            <div className="fc-results-sub">
              You practiced {queue.length} word{queue.length !== 1 ? 's' : ''} ·{' '}
              {finalPct}% accuracy
            </div>
          </div>
          <div className="fc-results-grid">
            <div className="fc-result-stat">
              <div className="fc-result-num" style={{ color: '#27ae60' }}>
                {score}
              </div>
              <div className="fc-result-label">Correct</div>
            </div>
            <div className="fc-result-stat">
              <div className="fc-result-num" style={{ color: '#e74c3c' }}>
                {totalAttempts - score}
              </div>
              <div className="fc-result-label">Incorrect</div>
            </div>
            <div className="fc-result-stat">
              <div className="fc-result-num">{finalPct}%</div>
              <div className="fc-result-label">Accuracy</div>
            </div>
          </div>
          <div className="fc-results-actions">
            <button className="fc-start-btn" onClick={startSession}>
              Study Again
            </button>
            <button className="fc-results-btn" onClick={onBack}>
              Home
            </button>
          </div>
        </div>
      </div>
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
        <div className="fc-study-header">
          <div style={{ flex: 1 }}>
            <div className="fc-progress-label">
              Card {idx + 1} of {queue.length}
            </div>
            <div className="fc-progress-bar">
              <div className="fc-progress-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <div className="fc-score-badge">
            Score: <b style={{ color: '#27ae60' }}>{score}</b>
          </div>
        </div>

        <div className="fc-study-body">
          <div className="fc-stage-dots">
            {stageCount === 2 &&
              [1, 2].map((s) => (
                <div
                  key={s}
                  className={`fc-stage-dot${stage === s ? ' active' : stage > s ? ' done' : ''}`}
                />
              ))}
          </div>

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
                <div className="fc-choices">
                  {englishChoices.map((w) => (
                    <button
                      key={w.char}
                      className={`fc-choice-btn${englishChoiceStates[w.char] ? ` ${englishChoiceStates[w.char]}` : ''}`}
                      disabled={answered}
                      onClick={() => handleEnglishChoice(w)}
                    >
                      {w.english}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="fc-study-next-area">
            <button
              className={`fc-next-btn${nextBtnVisible ? ' visible' : ''}`}
              onClick={handleNext}
            >
              Next →
            </button>
            {nextBtnVisible && <div className="fc-enter-hint">press Enter ↵</div>}
          </div>

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
    const finalPct =
      totalAttempts > 0 ? Math.round((score / totalAttempts) * 100) : 0
    return (
      <div className="fc-app">
        <div className="fc-results-container">
          <div className="fc-results-char">好！</div>
          <div>
            <div className="fc-results-title">Session Complete</div>
            <div className="fc-results-sub">
              You practiced {queue.length} word{queue.length !== 1 ? 's' : ''} ·{' '}
              {finalPct}% accuracy
            </div>
          </div>
          <div className="fc-results-grid">
            <div className="fc-result-stat">
              <div className="fc-result-num" style={{ color: '#27ae60' }}>
                {score}
              </div>
              <div className="fc-result-label">Correct</div>
            </div>
            <div className="fc-result-stat">
              <div className="fc-result-num" style={{ color: '#e74c3c' }}>
                {totalAttempts - score}
              </div>
              <div className="fc-result-label">Incorrect</div>
            </div>
            <div className="fc-result-stat">
              <div className="fc-result-num">{finalPct}%</div>
              <div className="fc-result-label">Accuracy</div>
            </div>
          </div>
          <div className="fc-results-actions">
            <button className="fc-start-btn" onClick={startSession}>
              Study Again
            </button>
            <button className="fc-results-btn" onClick={onBack}>
              Home
            </button>
          </div>
        </div>
      </div>
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
        <div className="fc-study-header">
          <div style={{ flex: 1 }}>
            <div className="fc-progress-label">
              Card {idx + 1} of {queue.length}
            </div>
            <div className="fc-progress-bar">
              <div className="fc-progress-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <div className="fc-score-badge">
            Score: <b style={{ color: '#27ae60' }}>{score}</b>
          </div>
        </div>

        <div className="fc-study-body">
          <div className="fc-stage-dots" />

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
              <div className="fc-choices">
                {choices.map((choice) => (
                  <button
                    key={choice}
                    className={`fc-choice-btn${choiceStates[choice] ? ` ${choiceStates[choice]}` : ''}`}
                    disabled={answered}
                    onClick={() => handleChoice(choice)}
                  >
                    {choice}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="fc-study-next-area">
            <button
              className={`fc-next-btn${nextBtnVisible ? ' visible' : ''}`}
              onClick={handleNext}
            >
              Next →
            </button>
            {nextBtnVisible && <div className="fc-enter-hint">press Enter ↵</div>}
          </div>

          <div className="fc-study-right">
            <ChatPanel cardContext={toneChatCtx} inline />
            <PronunciationBox />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── WORD SET PAGE ─────────────────────────────────────────────────
function WordSetPage({
  lastSession,
  allTimeStats,
  settings: initialSettings,
  dbLastSession,
  onContinue,
  onStartSoundOnly,
  onStartToneQuiz,
  onSignIn,
}: {
  lastSession: LastSession | null
  allTimeStats: AllTimeStats
  settings: Settings
  dbLastSession?: {
    wordSetKey: string
    mode: string
    correctCount: number
    totalCount: number
    completedAt: Date
  } | null
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
    alert('Please select a word set.')
    return null
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
    const session: LastSession = {
      wordSetKey: selectedWordSet ?? '',
      hskLevels: new Set(selectedHSKLevels),
      units: new Set(selectedUnits),
      settings: { ...settings },
      soundSettings: ss,
      vocab: v,
      desc:
        selectedWordSet === 'hsk'
          ? `HSK ${[...selectedHSKLevels].sort().join(' + ')} · ${v.length} words`
          : `LANG 1511 · Units ${[...selectedUnits].sort((a, b) => a - b).join(', ')}`,
    }
    onStartSoundOnly(v, ss, session)
  }

  function handleStartToneQuiz() {
    const v = buildSelectedVocab()
    if (!v) return
    const session: LastSession = {
      wordSetKey: selectedWordSet ?? '',
      hskLevels: new Set(selectedHSKLevels),
      units: new Set(selectedUnits),
      settings: { ...settings },
      toneSessionSize: settings.sessionSize,
      vocab: v,
      desc:
        selectedWordSet === 'hsk'
          ? `HSK ${[...selectedHSKLevels].sort().join(' + ')} · ${v.length} words`
          : `LANG 1511 · Units ${[...selectedUnits].sort((a, b) => a - b).join(', ')}`,
    }
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

    const session: LastSession = {
      wordSetKey: selectedWordSet ?? '',
      hskLevels: new Set(selectedHSKLevels),
      units: new Set(selectedUnits),
      settings: { ...settings },
      vocab,
      desc:
        selectedWordSet === 'hsk'
          ? `HSK ${[...selectedHSKLevels].sort().join(' + ')} · ${vocab.length} words`
          : `LANG 1511 · Units ${[...selectedUnits].sort((a, b) => a - b).join(', ')}`,
    }

    onContinue(vocab, settings.defaultMode, settings, session)
  }

  return (
    <div className="fc-app">
      <button
        className="fc-signout-btn"
        onClick={() =>
          onSignIn
            ? onSignIn()
            : authClient.signOut({ fetchOptions: { onSuccess: () => window.location.reload() } })
        }
      >
        {onSignIn ? 'Sign in' : 'Sign out'}
      </button>
      <div className="fc-wordset-container">
        <h1 className="fc-hero-title">学中文</h1>
        <p className="fc-hero-sub">Choose a word set to study.</p>
        {dbLastSession && (
          <p className="fc-last-session-hint">
            Last studied:{' '}
            {dbLastSession.completedAt.toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            })}{' '}
            · {dbLastSession.correctCount}/{dbLastSession.totalCount} correct
          </p>
        )}

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

        {/* Word set buttons */}
        <div className="fc-ws-grid">
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
        </div>

        {/* Session Settings */}
        {selectedWordSet && selectedWordSet !== 'last' && (
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
      </div>
    </div>
  )
}

// ── RESULTS PAGE ──────────────────────────────────────────────────
function ResultsPage({
  correct,
  wrong,
  pct,
  words,
  onStudyAgain,
  onHome,
}: {
  correct: number
  wrong: number
  pct: number
  words: number
  onStudyAgain: () => void
  onHome: () => void
}) {
  return (
    <div className="fc-app">
      <div className="fc-results-container">
        <div className="fc-results-char">好！</div>
        <div>
          <div className="fc-results-title">Session Complete</div>
          <div className="fc-results-sub">
            You practiced {words} word{words !== 1 ? 's' : ''} · {pct}% accuracy
          </div>
        </div>
        <div className="fc-results-grid">
          <div className="fc-result-stat">
            <div className="fc-result-num" style={{ color: '#27ae60' }}>
              {correct}
            </div>
            <div className="fc-result-label">Correct</div>
          </div>
          <div className="fc-result-stat">
            <div className="fc-result-num" style={{ color: '#e74c3c' }}>
              {wrong}
            </div>
            <div className="fc-result-label">Incorrect</div>
          </div>
          <div className="fc-result-stat">
            <div className="fc-result-num">{pct}%</div>
            <div className="fc-result-label">Accuracy</div>
          </div>
        </div>
        <div className="fc-results-actions">
          <button className="fc-start-btn" onClick={onStudyAgain}>
            Study Again
          </button>
          <button className="fc-results-btn" onClick={onHome}>
            Home
          </button>
        </div>
      </div>
    </div>
  )
}
