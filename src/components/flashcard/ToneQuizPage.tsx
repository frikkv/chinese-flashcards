import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { Volume2 } from 'lucide-react'
import type { Word } from '#/data/vocabulary'
import { speakHanzi } from '#/lib/tts'
import { playCorrect, playWrong } from '#/lib/sound'
import { shuffle, buildToneChoices, stripTones } from '#/lib/flashcard-logic'
import { StudyHeader } from '#/components/flashcard/StudyHeader'
import { NextButton } from '#/components/flashcard/NextButton'
import { StageDots } from '#/components/flashcard/StageDots'
import { AnswerChoices } from '#/components/flashcard/AnswerChoices'
import type { ChatCardContext } from '#/components/flashcard/ChatPanel'
import { ChatPanel } from '#/components/flashcard/ChatPanel'
import { PronunciationBox } from '#/components/flashcard/PronunciationBox'

const SessionCompleteScreen = lazy(() =>
  import('#/components/flashcard/SessionCompleteScreen').then((m) => ({
    default: m.SessionCompleteScreen,
  })),
)

export function ToneQuizPage({
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
  function buildToneQueue(): Word[] {
    const count =
      sessionSize === 30 ? vocab.length : Math.min(sessionSize, vocab.length)
    return shuffle(vocab).slice(0, count)
  }

  const [queue, setQueue] = useState<Word[]>(() => buildToneQueue())
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
    const isCorrect = choice === currentWord.pinyin
    if (isCorrect) playCorrect(); else playWrong()
    setAnswered(true)
    setTotalAttempts((p) => p + 1)
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
    const newQ = buildToneQueue()
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

  const toneChatCtx: ChatCardContext | undefined = currentWord
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
          <StageDots stageCount={1} currentStage={1} />

          <div className="fc-card-answers">
            <div className="fc-card-scene">
              <div className="fc-card-inner">
                <div className="fc-card-face">
                  <div className="fc-card-tag">Which tones are correct?</div>
                  {currentWord && (
                    <>
                      <div
                        className="fc-card-pinyin"
                        style={{ fontSize: '2rem' }}
                      >
                        {stripTones(currentWord.pinyin)}
                      </div>
                      <div className="fc-card-english">
                        {currentWord.english}
                      </div>
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
                      <div className="fc-sound-hint">
                        Tap or press Space to replay
                      </div>
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
