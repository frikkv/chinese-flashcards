import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { Volume2 } from 'lucide-react'
import type { Word } from '#/data/vocabulary'
import type { Dialect } from '#/lib/dialect'
import { getRomanization } from '#/lib/dialect'
import { playCorrect, playWrong } from '#/lib/sound'
import { comboXp } from '#/lib/combo'
import { speakHanzi } from '#/lib/tts'
import { shuffle, normalizeAnswer } from '#/lib/flashcard-logic'
import { charFontStyle } from '#/components/flashcard/CardFace'
import { StudyHeader } from '#/components/flashcard/StudyHeader'
import { NextButton } from '#/components/flashcard/NextButton'
import { StageDots } from '#/components/flashcard/StageDots'
import { AnswerChoices } from '#/components/flashcard/AnswerChoices'
import type { ChatCardContext } from '#/components/flashcard/ChatPanel'
import { StudyUtilityPanel } from '#/components/flashcard/StudyUtilityPanel'
import type { SoundSettings } from '#/components/flashcard/types'

const SessionCompleteScreen = lazy(() =>
  import('#/components/flashcard/SessionCompleteScreen').then((m) => ({
    default: m.SessionCompleteScreen,
  })),
)

export function SoundOnlyPage({
  vocab,
  soundSettings,
  dialect = 'mandarin',
  onBack,
  onSessionComplete,
}: {
  vocab: Word[]
  soundSettings: SoundSettings
  dialect?: Dialect
  onBack: () => void
  onSessionComplete?: (stats: { correct: number; total: number }) => void
}) {
  const {
    answerFormat,
    answerStyle,
    sessionSize,
    stageCount = 1,
  } = soundSettings

  function buildSoundQueue(): Word[] {
    const count =
      sessionSize === 30 ? vocab.length : Math.min(sessionSize, vocab.length)
    return shuffle(vocab).slice(0, count)
  }

  const [queue, setQueue] = useState<Word[]>(() => buildSoundQueue())
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
  const [xpTrigger, setXpTrigger] = useState(0)
  const [xpAmount, setXpAmount] = useState(1)
  const [correctCombo, setCorrectCombo] = useState(0)

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
      if (stageCount === 2 || answerFormat === 'english') {
        const engDistractors = shuffle(
          vocab.filter((w) => w.char !== word.char),
        ).slice(0, 3)
        setEnglishChoices(shuffle([word, ...engDistractors]))
      }
    }
    const t = setTimeout(() => speakHanzi(word.char, dialect), 150)
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
        if (word && !done && stage === 1) speakHanzi(word.char, dialect)
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
    const isCorrect = word.char === currentWord.char
    if (isCorrect) { const nc = correctCombo + 1; const xp = comboXp(nc); playCorrect(); setXpAmount(xp); setXpTrigger(Date.now()); setCorrectCombo(nc) } else { playWrong(); setCorrectCombo(0) }
    setAnswered(true)
    setTotalAttempts((p) => p + 1)
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
    const isCorrect = word.char === currentWord.char
    if (isCorrect) { const nc = correctCombo + 1; const xp = comboXp(nc); playCorrect(); setXpAmount(xp); setXpTrigger(Date.now()); setCorrectCombo(nc) } else { playWrong(); setCorrectCombo(0) }
    setAnswered(true)
    setTotalAttempts((p) => p + 1)
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
    const correctVal =
      answerFormat === 'english'
        ? currentWord.english
        : getRomanization(currentWord, dialect)
    const isCorrect = normalizeAnswer(typeValue) === normalizeAnswer(correctVal)
    if (isCorrect) { const nc = correctCombo + 1; const xp = comboXp(nc); playCorrect(); setXpAmount(xp); setXpTrigger(Date.now()); setCorrectCombo(nc) } else { playWrong(); setCorrectCombo(0) }
    setAnswered(true)
    setTotalAttempts((p) => p + 1)
    setTypeResult(isCorrect ? 'correct' : 'wrong')
    if (isCorrect) setScore((p) => p + 1)
    setNextBtnVisible(true)
  }

  function handleNext() {
    // In 2-stage mode, first Next press advances to stage 2 (not for english format — single stage)
    if (stageCount === 2 && stage === 1 && answerFormat !== 'english') {
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
    const newQ = buildSoundQueue()
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
      <Suspense fallback={<div className="fc-app" />}>
        <SessionCompleteScreen
          score={score}
          totalAttempts={totalAttempts}
          queueLength={queue.length}
          onStudyAgain={startSession}
          onBack={onBack}
        />
      </Suspense>
    )
  }

  const soundChatCtx: ChatCardContext | undefined = currentWord
    ? {
        char: currentWord.char,
        pinyin: currentWord.pinyin,
        english: currentWord.english,
      }
    : undefined

  return (
    <div className="fc-app">
      <button onClick={onBack} className="fc-back-btn">
        ← Home
      </button>

      <div className="fc-study-workspace">
        <StudyHeader
          current={idx + 1}
          total={queue.length}
          pct={pct}
          score={score}
        />

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
                        currentWord && speakHanzi(currentWord.char, dialect)
                      }}
                      aria-label="Replay pronunciation"
                    >
                      <Volume2 size={36} />
                    </button>
                    <div className="fc-sound-hint">
                      Tap or press Space to replay
                    </div>
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
                    <div
                      className="fc-card-char"
                      style={charFontStyle(currentWord.char, true)}
                    >
                      {currentWord.char}
                    </div>
                    <div className="fc-card-pinyin">
                      {getRomanization(currentWord, dialect)}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Answers */}
            <div className="fc-answer-area">
              {/* Stage 1 answers — English format (audio → guess English) */}
              {stage === 1 &&
                answerFormat === 'english' &&
                answerStyle === 'multiple-choice' &&
                englishChoices.length > 0 && (
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

              {/* Reveal character + romanization after answering in English format.
                  Always rendered in english mode so the container height is stable;
                  visibility:hidden keeps the space reserved before answering. */}
              {answerFormat === 'english' && (
                <div
                  className="fc-sound-reveal"
                  style={!answered ? { visibility: 'hidden' } : undefined}
                  aria-hidden={!answered}
                >
                  <span className="fc-sound-reveal-char">
                    {currentWord?.char ?? ''}
                  </span>
                  <span className="fc-sound-reveal-pinyin">
                    {currentWord ? getRomanization(currentWord, dialect) : ''}
                  </span>
                </div>
              )}

              {/* Stage 1 answers — char/pinyin/both formats */}
              {stage === 1 &&
                answerFormat !== 'english' &&
                answerStyle === 'multiple-choice' &&
                choiceWords.length > 0 && (
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
                              <span className="fc-sound-choice-char">
                                {w.char}
                              </span>
                              <span className="fc-sound-choice-pinyin">
                                {getRomanization(w, dialect)}
                              </span>
                            </span>
                          ) : (
                            <span className="fc-sound-choice-char">
                              {w.char}
                            </span>
                          ))}
                        {answerFormat === 'pinyin' &&
                          getRomanization(w, dialect)}
                        {answerFormat === 'both' && (
                          <span className="fc-sound-choice-both">
                            <span className="fc-sound-choice-char">
                              {w.char}
                            </span>
                            <span className="fc-sound-choice-pinyin">
                              {getRomanization(w, dialect)}
                            </span>
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
                    placeholder={
                      answerFormat === 'english'
                        ? 'Type the English meaning...'
                        : dialect === 'cantonese'
                          ? 'Type jyutping (e.g. nei5 hou2)...'
                          : 'Type pinyin (e.g. nǐ hǎo)...'
                    }
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
                      Correct:{' '}
                      {answerFormat === 'english'
                        ? currentWord.english
                        : `${getRomanization(currentWord, dialect)} (${currentWord.char})`}
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
            {currentWord && (
              <StudyUtilityPanel
                char={currentWord.char}
                pinyin={currentWord.pinyin}
                english={currentWord.english}
                answerTarget={answerFormat === 'english' ? 'english' : 'pinyin'}
                correctCombo={correctCombo}
                xpTrigger={xpTrigger}
                xpAmount={xpAmount}
                chatContext={soundChatCtx}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
