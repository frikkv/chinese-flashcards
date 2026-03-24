import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import type { Word } from '../data/vocabulary'
import type { Dialect } from '../lib/dialect'
import { getRomanization } from '../lib/dialect'
import { hsk1Words, hsk2Words, hsk3Words, hsk4Words, lang1511Units } from '../data/vocabulary'
import { cantoneseBasicsWords } from '../data/cantonese-vocabulary'
import { authClient } from '#/lib/auth-client'
import { useTRPC } from '#/integrations/trpc/react'
import { speakHanzi } from '#/lib/tts'
import { playCorrect, playWrong } from '#/lib/sound'
import type { QueueItem } from '#/lib/flashcard-logic'
import {
  shuffle,
  normalizeAnswer,
  buildQueue,
  getQuestionContent,
  getAnswerContent,
} from '#/lib/flashcard-logic'
import { AuthPage } from '#/components/AuthPage'
import type { CardContent } from '#/components/flashcard/CardFace'
import { CardFace } from '#/components/flashcard/CardFace'
import type { ProgressCard } from '#/lib/mastery'
import { StudyHeader } from '#/components/flashcard/StudyHeader'
import { NextButton } from '#/components/flashcard/NextButton'
import { StageDots } from '#/components/flashcard/StageDots'
import { AnswerChoices } from '#/components/flashcard/AnswerChoices'
import type { ChatCardContext } from '#/components/flashcard/ChatPanel'
import { ChatPanel } from '#/components/flashcard/ChatPanel'
import { PronunciationBox } from '#/components/flashcard/PronunciationBox'
import { Skeleton } from '#/components/Skeleton'
import type {
  Page,
  Settings,
  LastSession,
  SoundSettings,
  AllTimeStats,
} from '#/components/flashcard/types'
import { SoundOnlyPage } from '#/components/flashcard/SoundOnlyPage'
import { ToneQuizPage } from '#/components/flashcard/ToneQuizPage'
import { WordSetPage } from '#/components/flashcard/wordset/WordSetPage'

// Lazy-loaded: not needed for the word-set selection screen (first paint)
const ResultsPage = lazy(() =>
  import('#/components/flashcard/ResultsPage').then((m) => ({
    default: m.ResultsPage,
  })),
)

export const Route = createFileRoute('/')({
  component: AuthGate,
  loader: ({ context: { queryClient, trpc } }) => {
    // Fire prefetch queries without awaiting — the route renders immediately
    // and components pick up in-flight queries via their useQuery hooks.
    // Skeletons cover each section until data arrives.
    //
    // retry:false — skip the retry budget on 401s for unauthenticated users
    // so the one wasted request resolves quickly and doesn't add latency.
    void queryClient.prefetchQuery({ ...trpc.progress.getProgress.queryOptions(), retry: false })
    void queryClient.prefetchQuery({ ...trpc.wordsets.list.queryOptions(), retry: false })
    void queryClient.prefetchQuery({ ...trpc.social.getWeeklyLeaderboard.queryOptions(), retry: false })
  },
})

function wordSetDetailOf(session: LastSession | null): string {
  if (!session) return ''
  if (session.wordSetKey === 'cantonese_basics') return ''
  if (session.wordSetKey === 'hsk')
    return [...session.hskLevels].sort().join(',')
  if (session.wordSetKey === 'custom') return session.customSetId ?? ''
  return [...session.units].sort((a, b) => a - b).join(',')
}

function AuthGate() {
  const { data: session, isPending } = authClient.useSession()
  const [skipped, setSkipped] = useState(false)

  // While pending we treat the user as unauthenticated but still render the
  // full app immediately — this eliminates the spinner→content layout shift
  // for returning logged-in users (by far the largest CLS contributor).
  // For logged-out first-time users the AuthPage appears once isPending
  // resolves, which is a very brief sub-200 ms transition.
  if (!isPending && !session?.user && !skipped) {
    return <AuthPage onSkip={() => setSkipped(true)} />
  }

  return (
    <FlashcardsApp
      onSignIn={
        !isPending && !session?.user ? () => setSkipped(false) : undefined
      }
    />
  )
}

// ── MAIN APP ─────────────────────────────────────────────────────
function FlashcardsApp({ onSignIn }: { onSignIn?: () => void }) {
  const trpc = useTRPC()
  const { data: authSession, isPending: authPending } = authClient.useSession()
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
  const batchRecordCardsMutation = useMutation(
    trpc.progress.batchRecordCards.mutationOptions(),
  )
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
  const [activeDialect, _setActiveDialect] = useState<Dialect>('mandarin')
  const activeDialectRef = useRef<Dialect>('mandarin')
  function setActiveDialect(d: Dialect) {
    activeDialectRef.current = d
    _setActiveDialect(d)
  }

  // Word set selection
  const [lastSession, setLastSession] = useState<LastSession | null>(null)

  // Reconstruct lastSession from the user_last_session table on login
  useEffect(() => {
    const db = progressQuery.data?.lastSession
    if (!db || lastSession) return
    if (!db.wordSetDetail) return // no valid data yet

    let vocab: Word[] = []
    let hskLevels = new Set<number>()
    let units = new Set<number>()
    let customSetId: string | undefined

    if (db.wordSetKey === 'cantonese_basics') {
      vocab = cantoneseBasicsWords
    } else if (db.wordSetKey === 'hsk') {
      const detail = db.wordSetDetail.split(',').map(Number).filter(Boolean)
      if (detail.includes(1)) vocab = vocab.concat(hsk1Words)
      if (detail.includes(2)) vocab = vocab.concat(hsk2Words)
      if (detail.includes(3)) vocab = vocab.concat(hsk3Words)
      if (detail.includes(4)) vocab = vocab.concat(hsk4Words)
      hskLevels = new Set(detail)
    } else if (db.wordSetKey === 'lang1511') {
      const detail = db.wordSetDetail.split(',').map(Number).filter(Boolean)
      const unitSet = new Set(detail)
      vocab = lang1511Units
        .filter((u) => unitSet.has(u.unit))
        .flatMap((u) => u.words)
      units = new Set(detail)
    } else if (db.wordSetKey === 'custom') {
      if (!customWordSetsQuery.data) return // wait for custom sets to load
      const customSet = customWordSetsQuery.data.find(
        (s) => s.id === db.wordSetDetail,
      )
      if (!customSet) return
      vocab = customSet.words as Word[]
      customSetId = customSet.id
    }

    if (vocab.length === 0) return
    const size = ([10, 20, 30] as const).includes(
      db.sessionSize as 10 | 20 | 30,
    )
      ? (db.sessionSize as 10 | 20 | 30)
      : 20
    const dbDialect = (
      db.dialect === 'cantonese' ? 'cantonese' : 'mandarin'
    ) as Dialect
    const desc =
      db.wordSetKey === 'cantonese_basics'
        ? `Cantonese Basics · ${vocab.length} words`
        : db.wordSetKey === 'hsk'
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
      dialect: dbDialect,
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

  // Sync refs during render — these are only read in event handlers/callbacks,
  // never during render output, so direct assignment is safe.
  queueRef.current = queue
  vocabRef.current = vocab
  settingsRef.current = settings
  sessionModeRef.current = sessionMode
  isFlippedRef.current = isFlipped
  nextBtnVisibleRef.current = nextBtnVisible
  answeredRef.current = answered
  showSelfRateRef.current = showSelfRate
  cardModeRef.current = cardMode

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
      .mutateAsync({
        vocabKey: key,
        char: word.char,
        pinyin: word.pinyin,
        correctAnswer: word.english,
      })
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

    const dialect = activeDialectRef.current
    const qContent = getQuestionContent(word, stage, mode, dialect)
    const aContent = getAnswerContent(word, stage, mode, dialect)

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

    // Cantonese mode 2 stage 2 = recall (like Mandarin stage 3)
    const isSelfRate =
      stage === 3 || (dialect === 'cantonese' && mode === 2 && stage === 2)
    if (isSelfRate) {
      setCardMode('selfrate')
      setAnswerCorrect(word.char)
      setAnswerChoices([])
    } else {
      const target: 'english' | 'pinyin' =
        mode === 1 || stage === 2 || dialect === 'cantonese'
          ? 'english'
          : 'pinyin'
      const correct =
        target === 'english' ? word.english : getRomanization(word, dialect)
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
              pending
                .then((distractors) => {
                  if (
                    currentDistractorFetchRef.current === key &&
                    !answeredRef.current
                  ) {
                    setAnswerChoices(shuffle([word.english, ...distractors]))
                    currentDistractorFetchRef.current = null
                  }
                })
                .catch(() => {
                  fetchDistractorsMutation.mutate({
                    vocabKey: key,
                    char: word.char,
                    pinyin: word.pinyin,
                    correctAnswer: word.english,
                  })
                })
            } else {
              // 3. Nothing available — fire a fresh fetch
              fetchDistractorsMutation.mutate({
                vocabKey: key,
                char: word.char,
                pinyin: word.pinyin,
                correctAnswer: word.english,
              })
            }
          }
        } else {
          // Pinyin/jyutping targets have no AI fetch — set choices immediately
          const distractors = shuffle(v.filter((w) => w !== word)).slice(0, 3)
          const options = shuffle([word, ...distractors])
          setAnswerChoices(options.map((o) => getRomanization(o, dialect)))
          currentDistractorFetchRef.current = null
        }
      } else {
        setCardMode('type')
        setAnswerChoices([])
      }
    }
  }

  function handleStartStudy(
    v: Word[],
    mode: 1 | 2 | 3,
    s: Settings,
    dialect: Dialect = 'mandarin',
  ) {
    setActiveDialect(dialect)
    const q = buildQueue(
      v,
      mode,
      s.sessionSize === 30 ? v.length : s.sessionSize,
      dialect,
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
    if (correct) playCorrect(); else playWrong()
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
    const correct = answerCorrect
    const isCorrect =
      chosen.trim().toLowerCase() === correct.trim().toLowerCase()
    if (isCorrect) playCorrect(); else playWrong()
    setAnswered(true)
    setTotalAttempts((p) => p + 1)
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
      if (word)
        cardResultsRef.current.push({ cardId: word.char, correct: isCorrect })
    }
  }

  function handleTypeSubmit() {
    if (answered || !typeValue.trim()) return
    const isCorrect =
      normalizeAnswer(typeValue) === normalizeAnswer(answerCorrect)
    if (isCorrect) playCorrect(); else playWrong()
    setAnswered(true)
    setTotalAttempts((p) => p + 1)
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
      if (word)
        cardResultsRef.current.push({ cardId: word.char, correct: isCorrect })
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
        if (results.length > 0)
          batchRecordCardsMutation.mutate({
            dialect: activeDialect,
            cards: results,
          })
        saveSessionMutation.mutate({
          wordSetKey: lastSession?.wordSetKey ?? 'unknown',
          wordSetDetail: wordSetDetailOf(lastSession),
          mode: `study:${sessionModeRef.current}`,
          sessionSize: settingsRef.current.sessionSize,
          dialect: activeDialect,
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
      activeDialect,
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
        const target =
          mode === 1 || futureItem.stage === 2 ? 'english' : 'pinyin'
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
      if (
        e.key === ' ' &&
        cardModeRef.current === 'selfrate' &&
        !showSelfRateRef.current &&
        !answeredRef.current
      ) {
        e.preventDefault()
        handleReveal()
        return
      }

      // 1=Again 2=Hard 3=Good 4=Easy
      if (
        ['1', '2', '3', '4'].includes(e.key) &&
        cardModeRef.current === 'selfrate' &&
        showSelfRateRef.current &&
        !answeredRef.current
      ) {
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
        thisWeekSessions={progressQuery.data?.thisWeekSessions ?? 0}
        thisWeekXP={progressQuery.data?.thisWeekXP ?? 0}
        lastWeekXP={progressQuery.data?.lastWeekXP ?? 0}
        streak={progressQuery.data?.streak ?? 0}
        customWordSets={customWordSetsQuery.data ?? []}
        isSignedIn={isSignedIn}
        authPending={authPending}
        progressPending={progressQuery.isPending}
        customWordSetsPending={customWordSetsQuery.isPending}
        onContinue={(v, mode, s, session) => {
          setVocab(v)
          setSessionMode(mode)
          setSettings(s)
          if (session) setLastSession(session)
          const dialect = session?.dialect ?? 'mandarin'
          handleStartStudy(v, mode, s, dialect)
          if (isSignedIn && session) {
            saveLastSessionMutation.mutate({
              wordSetKey: session.wordSetKey,
              wordSetDetail: wordSetDetailOf(session),
              mode: `study:${mode}`,
              sessionSize: s.sessionSize,
              dialect,
            })
          }
        }}
        onStartSoundOnly={(v, ss, session) => {
          setSoundVocab(v)
          setSoundSettings(ss)
          if (session) setLastSession(session)
          const dialect = session?.dialect ?? 'mandarin'
          setActiveDialect(dialect)
          setPage('sound')
          if (isSignedIn && session) {
            saveLastSessionMutation.mutate({
              wordSetKey: session.wordSetKey,
              wordSetDetail: wordSetDetailOf(session),
              mode: 'sound',
              sessionSize: ss.sessionSize,
              dialect,
            })
          }
        }}
        onStartToneQuiz={(v, sz, session) => {
          setToneVocab(v)
          setToneSessionSize(sz)
          if (session) setLastSession(session)
          const dialect = session?.dialect ?? 'mandarin'
          setActiveDialect(dialect)
          setPage('tone')
          if (isSignedIn && session) {
            saveLastSessionMutation.mutate({
              wordSetKey: session.wordSetKey,
              wordSetDetail: wordSetDetailOf(session),
              mode: 'tone',
              sessionSize: sz,
              dialect,
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
        dialect={activeDialect}
        onBack={() => setPage('wordset')}
        onSessionComplete={
          isSignedIn
            ? (stats) =>
                saveSessionMutation.mutate({
                  wordSetKey: lastSession?.wordSetKey ?? 'unknown',
                  wordSetDetail: wordSetDetailOf(lastSession),
                  mode: 'sound',
                  sessionSize: soundSettings.sessionSize,
                  dialect: activeDialect,
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
      <Suspense fallback={<div className="fc-app" />}>
        <ResultsPage
          correct={score}
          wrong={wrongCount}
          pct={pct}
          words={words}
          vocab={vocab}
          cardProgress={progressQuery.data?.cards}
          onStudyAgain={() => handleStartStudy(vocab, sessionMode, settings)}
          onHome={() => setPage('wordset')}
        />
      </Suspense>
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
        <StudyHeader
          current={qIdx + 1}
          total={queue.length}
          pct={pct}
          score={score}
        />

        {/* Two-column grid body */}
        <div className="fc-study-body">
          {/* Stage dots (grid row 1, col 1) */}
          <StageDots
            stageCount={sessionMode}
            currentStage={currentItem?.stage ?? 0}
          />

          {/* Card + answers (grid row 2, col 1) */}
          <div className="fc-card-answers">
            {/* Card */}
            <div className="fc-card-scene">
              <div className={`fc-card-inner${isFlipped ? ' flipped' : ''}`}>
                <CardFace
                  content={faceA}
                  hanzi={currentItem?.word.char ?? ''}
                  dialect={activeDialect}
                />
                <CardFace
                  content={faceB}
                  isBack
                  hanzi={currentItem?.word.char ?? ''}
                  dialect={activeDialect}
                />
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
                      <p className="fc-self-rate-label">
                        How well did you know it?
                      </p>
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
                    <div
                      key={i}
                      className="fc-choice-btn fc-choice-btn--skeleton"
                    />
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
