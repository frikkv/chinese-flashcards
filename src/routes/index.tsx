import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useRef } from 'react'
import { hsk1Words, hsk2Words, lang1511Units } from '../data/vocabulary'
import type { Word } from '../data/vocabulary'

export const Route = createFileRoute('/')({ component: FlashcardsApp })

// ── TYPES ────────────────────────────────────────────────────────
type Page = 'wordset' | 'home' | 'study' | 'results'
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
  vocab: Word[]
  desc: string
}

interface AllTimeStats {
  studied: number
  correct: number
  sessions: number
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

function buildQueue(vocab: Word[], mode: 1 | 2 | 3, size: number): QueueItem[] {
  const count = Math.min(size >= vocab.length ? vocab.length : size, vocab.length)
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

// ── CARD FACE ────────────────────────────────────────────────────
function CardFace({
  content,
  isBack,
}: {
  content: CardContent | null
  isBack?: boolean
}) {
  return (
    <div className={`fc-card-face${isBack ? ' back' : ''}`}>
      {content && (
        <>
          <div className="fc-card-tag">{content.tag}</div>
          {content.char && <div className="fc-card-char">{content.char}</div>}
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
              style={content.englishLarge ? { fontSize: '2rem', margin: '12px 0' } : undefined}
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

// ── MAIN APP ─────────────────────────────────────────────────────
function FlashcardsApp() {
  const [page, setPage] = useState<Page>('wordset')

  // Word set selection
  const [lastSession, setLastSession] = useState<LastSession | null>(null)

  // Settings + mode
  const [settings, setSettings] = useState<Settings>({
    answerStyle: 'multiple-choice',
    defaultMode: 2,
    sessionSize: 20,
  })
  const [sessionMode, setSessionMode] = useState<1 | 2 | 3>(2)
  const [vocab, setVocab] = useState<Word[]>([])

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
  const [answerTarget, setAnswerTarget] = useState<'english' | 'pinyin'>('english')
  const [answerCorrect, setAnswerCorrect] = useState('')
  const [answerChoices, setAnswerChoices] = useState<string[]>([])
  const [choiceStates, setChoiceStates] = useState<Record<string, 'correct' | 'wrong'>>({})
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

  useEffect(() => { queueRef.current = queue }, [queue])
  useEffect(() => { vocabRef.current = vocab }, [vocab])
  useEffect(() => { settingsRef.current = settings }, [settings])
  useEffect(() => { sessionModeRef.current = sessionMode }, [sessionMode])
  useEffect(() => { isFlippedRef.current = isFlipped }, [isFlipped])
  useEffect(() => { nextBtnVisibleRef.current = nextBtnVisible }, [nextBtnVisible])

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
        const distractors = shuffle(v.filter((w) => w !== word)).slice(0, 3)
        const options = shuffle([word, ...distractors])
        setAnswerChoices(options.map((o) => (target === 'english' ? o.english : o.pinyin)))
      } else {
        setCardMode('type')
        setAnswerChoices([])
      }
    }
  }

  function handleStartStudy(v: Word[], mode: 1 | 2 | 3, s: Settings) {
    const q = buildQueue(v, mode, s.sessionSize === 30 ? v.length : s.sessionSize)
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
  }

  function handleNext() {
    const currentQ = queueRef.current
    const currentFlipped = isFlippedRef.current
    const nextIdx = qIdx + 1

    if (nextIdx >= currentQ.length) {
      setPage('results')
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
      if (
        document.activeElement &&
        (document.activeElement as HTMLElement).tagName === 'INPUT'
      )
        return
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
        settings={settings}
        onContinue={(v, mode, s, session) => {
          setVocab(v)
          setSessionMode(mode)
          setSettings(s)
          if (session) setLastSession(session)
          setPage('home')
        }}
      />
    )
  }

  if (page === 'home') {
    return (
      <ModePage
        allTimeStats={allTimeStats}
        sessionMode={sessionMode}
        onSelectMode={setSessionMode}
        onStart={() => handleStartStudy(vocab, sessionMode, settings)}
        onBack={() => setPage('wordset')}
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

  return (
    <div className="fc-app">
      {/* Back button */}
      <button
        onClick={() => setPage('wordset')}
        className="fc-back-btn"
      >
        ← Home
      </button>

      {/* Progress header */}
      <div className="fc-study-header">
        <div style={{ flex: 1 }}>
          <div className="fc-progress-label">
            Card {qIdx + 1} of {queue.length}
          </div>
          <div className="fc-progress-bar">
            <div
              className="fc-progress-fill"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <div className="fc-score-badge">
          Score: <b style={{ color: '#27ae60' }}>{score}</b>
        </div>
      </div>

      {/* Stage dots */}
      {sessionMode > 1 && currentItem && (
        <div className="fc-stage-dots">
          {Array.from({ length: sessionMode }, (_, i) => i + 1).map((i) => (
            <div
              key={i}
              className={`fc-stage-dot${i === currentItem.stage ? ' active' : i < currentItem.stage ? ' done' : ''}`}
            />
          ))}
        </div>
      )}

      {/* Card */}
      <div className="fc-card-scene">
        <div className={`fc-card-inner${isFlipped ? ' flipped' : ''}`}>
          <CardFace content={faceA} />
          <CardFace content={faceB} isBack />
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

      {/* Next button */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <button
          className={`fc-next-btn${nextBtnVisible ? ' visible' : ''}`}
          onClick={handleNext}
        >
          Next →
        </button>
        {nextBtnVisible && (
          <div className="fc-enter-hint">press Enter ↵</div>
        )}
      </div>
    </div>
  )
}

// ── WORD SET PAGE ─────────────────────────────────────────────────
function WordSetPage({
  lastSession,
  settings: initialSettings,
  onContinue,
}: {
  lastSession: LastSession | null
  settings: Settings
  onContinue: (
    vocab: Word[],
    mode: 1 | 2 | 3,
    settings: Settings,
    session: LastSession | null,
  ) => void
}) {
  const [selectedWordSet, setSelectedWordSet] = useState<string | null>(null)
  const [selectedUnits, setSelectedUnits] = useState<Set<number>>(new Set())
  const [selectedHSKLevels, setSelectedHSKLevels] = useState<Set<number>>(new Set())
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settings, setSettings] = useState<Settings>(initialSettings)

  // Drag-select state
  const isDraggingRef = useRef(false)
  const dragActionRef = useRef<'select' | 'deselect'>('select')
  const dragTypeRef = useRef<'unit' | 'hsk' | null>(null)

  useEffect(() => {
    const handler = () => {
      isDraggingRef.current = false
    }
    document.addEventListener('mouseup', handler)
    return () => document.removeEventListener('mouseup', handler)
  }, [])

  function applyUnitAction(unit: number, action: 'select' | 'deselect') {
    setSelectedUnits((prev) => {
      const next = new Set(prev)
      if (action === 'select') next.add(unit)
      else next.delete(unit)
      return next
    })
  }

  function applyHSKAction(level: number, action: 'select' | 'deselect') {
    setSelectedHSKLevels((prev) => {
      const next = new Set(prev)
      if (action === 'select') next.add(level)
      else next.delete(level)
      return next
    })
  }

  function handleGoNext() {
    let vocab: Word[] = []

    if (selectedWordSet === 'last') {
      if (!lastSession) return
      onContinue(
        lastSession.vocab,
        lastSession.settings.defaultMode,
        lastSession.settings,
        null,
      )
      return
    }

    if (selectedWordSet === 'hsk') {
      if (selectedHSKLevels.size === 0) {
        alert('Please select at least one HSK level.')
        return
      }
      if (selectedHSKLevels.has(1)) vocab = vocab.concat(hsk1Words)
      if (selectedHSKLevels.has(2)) vocab = vocab.concat(hsk2Words)
    } else if (selectedWordSet === 'lang1511') {
      if (selectedUnits.size === 0) {
        alert('Please select at least one unit.')
        return
      }
      vocab = lang1511Units
        .filter((u) => selectedUnits.has(u.unit))
        .flatMap((u) => u.words)
    } else {
      alert('Please select a word set.')
      return
    }

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
      <div className="fc-wordset-container">
        <h1 className="fc-hero-title">学中文</h1>
        <p className="fc-hero-sub">Choose a word set to study.</p>

        {/* Word set buttons */}
        <div className="fc-ws-grid">
          <button
            className={`fc-ws-btn${selectedWordSet === 'hsk' ? ' selected' : ''}`}
            onClick={() => setSelectedWordSet(selectedWordSet === 'hsk' ? null : 'hsk')}
          >
            <span className="fc-ws-char">汉语</span>
            <span className="fc-ws-label">HSK</span>
            <span className="fc-ws-count">2 levels · 300 words</span>
            <span className="fc-ws-desc">Official HSK vocabulary</span>
          </button>
          <button
            className={`fc-ws-btn${selectedWordSet === 'lang1511' ? ' selected' : ''}`}
            onClick={() => setSelectedWordSet(selectedWordSet === 'lang1511' ? null : 'lang1511')}
          >
            <span className="fc-ws-char">课程</span>
            <span className="fc-ws-label">LANG 1511</span>
            <span className="fc-ws-count">10 units · 123 words</span>
            <span className="fc-ws-desc">University course vocabulary</span>
          </button>
          {lastSession && (
            <button
              className={`fc-ws-btn${selectedWordSet === 'last' ? ' selected' : ''}`}
              onClick={() => setSelectedWordSet(selectedWordSet === 'last' ? null : 'last')}
            >
              <span className="fc-ws-char">上次</span>
              <span className="fc-ws-label">Last Session</span>
              <span className="fc-ws-count">{lastSession.desc}</span>
              <span className="fc-ws-desc">Continue where you left off</span>
            </button>
          )}
        </div>

        {/* HSK level picker */}
        {selectedWordSet === 'hsk' && (
          <div className="fc-picker">
            <p className="fc-picker-label">Select HSK level</p>
            <div className="fc-picker-grid">
              {[1, 2].map((level) => (
                <button
                  key={level}
                  className={`fc-unit-btn${selectedHSKLevels.has(level) ? ' selected' : ''}`}
                  onMouseDown={() => {
                    isDraggingRef.current = true
                    dragActionRef.current = selectedHSKLevels.has(level) ? 'deselect' : 'select'
                    dragTypeRef.current = 'hsk'
                    applyHSKAction(level, selectedHSKLevels.has(level) ? 'deselect' : 'select')
                  }}
                  onMouseEnter={() => {
                    if (isDraggingRef.current && dragTypeRef.current === 'hsk') {
                      applyHSKAction(level, dragActionRef.current)
                    }
                  }}
                >
                  HSK {level}{' '}
                  <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>(150)</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* LANG 1511 unit picker */}
        {selectedWordSet === 'lang1511' && (
          <div className="fc-picker">
            <p className="fc-picker-label">Select units to study</p>
            <div className="fc-picker-grid">
              {lang1511Units.map((u) => (
                <button
                  key={u.unit}
                  className={`fc-unit-btn${selectedUnits.has(u.unit) ? ' selected' : ''}`}
                  onMouseDown={() => {
                    isDraggingRef.current = true
                    dragActionRef.current = selectedUnits.has(u.unit) ? 'deselect' : 'select'
                    dragTypeRef.current = 'unit'
                    applyUnitAction(
                      u.unit,
                      selectedUnits.has(u.unit) ? 'deselect' : 'select',
                    )
                  }}
                  onMouseEnter={() => {
                    if (isDraggingRef.current && dragTypeRef.current === 'unit') {
                      applyUnitAction(u.unit, dragActionRef.current)
                    }
                  }}
                >
                  Unit {u.unit}{' '}
                  <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>
                    ({u.words.length})
                  </span>
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
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
          </div>
        )}

        {/* Settings */}
        {selectedWordSet && selectedWordSet !== 'last' && (
          <div className="fc-settings-wrap">
            <button
              className="fc-settings-toggle"
              onClick={() => setSettingsOpen((o) => !o)}
            >
              <span
                style={{
                  display: 'inline-block',
                  transition: 'transform 0.2s',
                  transform: settingsOpen ? 'rotate(90deg)' : '',
                }}
              >
                ▸
              </span>{' '}
              Settings
            </button>
            {settingsOpen && (
              <div className="fc-settings-dropdown">
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
                  <div className="fc-settings-label">Default Study Mode</div>
                  <div className="fc-settings-options">
                    {([1, 2, 3] as const).map((m) => (
                      <button
                        key={m}
                        className={`fc-setting-opt${settings.defaultMode === m ? ' selected' : ''}`}
                        onClick={() =>
                          setSettings((s) => ({ ...s, defaultMode: m }))
                        }
                      >
                        {m} Card{m > 1 ? 's' : ''}
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
              </div>
            )}
          </div>
        )}

        <button
          className="fc-start-btn"
          style={{ marginTop: 24 }}
          onClick={handleGoNext}
        >
          Next →
        </button>
        <div style={{ height: 40 }} />
      </div>
    </div>
  )
}

// ── MODE PAGE ─────────────────────────────────────────────────────
function ModePage({
  allTimeStats,
  sessionMode,
  onSelectMode,
  onStart,
  onBack,
}: {
  allTimeStats: AllTimeStats
  sessionMode: 1 | 2 | 3
  onSelectMode: (m: 1 | 2 | 3) => void
  onStart: () => void
  onBack: () => void
}) {
  const modes: { num: string; title: string; desc: string; val: 1 | 2 | 3 }[] = [
    {
      num: '一',
      title: '1 Card',
      desc: 'See character + pinyin, guess the English meaning.',
      val: 1,
    },
    {
      num: '二',
      title: '2 Cards',
      desc: 'Character → guess pinyin, then pinyin → guess English.',
      val: 2,
    },
    {
      num: '三',
      title: '3 Cards',
      desc: 'Full system: character → pinyin → English → recall character.',
      val: 3,
    },
  ]

  return (
    <div className="fc-app">
      <div className="fc-home-container">
        <div className="fc-home-hero">
          <h1 className="fc-hero-title">学中文</h1>
          <p className="fc-hero-sub">
            Learn Chinese characters the right way — character first, always.
          </p>
        </div>

        <div className="fc-stats-bar">
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

        <p className="fc-section-label">Choose a study mode</p>

        <div className="fc-mode-grid">
          {modes.map((m) => (
            <div
              key={m.val}
              className={`fc-mode-card${sessionMode === m.val ? ' selected' : ''}`}
              onClick={() => onSelectMode(m.val)}
            >
              <div className="fc-mode-num">{m.num}</div>
              <div className="fc-mode-title">{m.title}</div>
              <div className="fc-mode-desc">{m.desc}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button className="fc-util-btn" onClick={onBack}>
            ← Back
          </button>
          <button className="fc-start-btn" onClick={onStart}>
            Start Studying →
          </button>
        </div>
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
            You practiced {words} word{words !== 1 ? 's' : ''} · {pct}%
            accuracy
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
