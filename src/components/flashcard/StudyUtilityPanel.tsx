import { useState, useEffect } from 'react'
import { Lightbulb, MessageCircle, Flame, Flag, X } from 'lucide-react'
import { HintPanel } from '#/components/flashcard/HintPanel'
import type { ChatCardContext } from '#/components/flashcard/ChatPanel'
import { ChatPanel } from '#/components/flashcard/ChatPanel'
import { XpPopup } from '#/components/flashcard/XpPopup'

type PanelId = 'hint' | 'ai' | 'report'

interface StudyUtilityPanelProps {
  char: string
  pinyin: string
  english: string
  answerTarget: 'english' | 'pinyin'
  correctCombo: number
  xpTrigger: number
  xpAmount: number
  chatContext?: ChatCardContext
}

export function StudyUtilityPanel({
  char,
  pinyin,
  english,
  answerTarget,
  correctCombo,
  xpTrigger,
  xpAmount,
  chatContext,
}: StudyUtilityPanelProps) {
  const [activePanel, setActivePanel] = useState<PanelId | null>(null)

  // Reset to menu when the card changes
  useEffect(() => {
    setActivePanel(null)
  }, [char])

  if (activePanel === 'ai') {
    return (
      <ChatPanel
        cardContext={chatContext}
        inline
        onClose={() => setActivePanel(null)}
      />
    )
  }

  if (activePanel === 'hint') {
    return (
      <HintPanel
        char={char}
        pinyin={pinyin}
        english={english}
        answerTarget={answerTarget}
        onClose={() => setActivePanel(null)}
      />
    )
  }

  if (activePanel === 'report') {
    return (
      <div className="fc-util-expanded">
        <div className="fc-util-expanded-header">
          <div className="fc-util-expanded-title">
            <Flag size={15} strokeWidth={2} />
            <span>Report Issue</span>
          </div>
          <button
            className="fc-util-close-btn"
            onClick={() => setActivePanel(null)}
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>
        <div className="fc-util-expanded-body">
          <ReportForm char={char} pinyin={pinyin} english={english} />
        </div>
      </div>
    )
  }

  // Default: 2x2 menu grid
  return (
    <div className="fc-util-menu">
      <button
        className="fc-util-cell"
        onClick={() => setActivePanel('hint')}
      >
        <Lightbulb size={20} strokeWidth={1.8} className="fc-util-cell-icon" />
        <span className="fc-util-cell-label">Hint</span>
      </button>
      <button
        className="fc-util-cell"
        onClick={() => setActivePanel('ai')}
      >
        <MessageCircle size={20} strokeWidth={1.8} className="fc-util-cell-icon" />
        <span className="fc-util-cell-label">Ask AI</span>
      </button>
      <div className="fc-util-cell fc-util-cell--static">
        <Flame size={20} strokeWidth={1.8} className="fc-util-cell-icon fc-util-cell-icon--streak" />
        <span className="fc-util-cell-streak-num">
          {correctCombo}
        </span>
        <XpPopup triggerKey={xpTrigger} amount={xpAmount} />
      </div>
      <button
        className="fc-util-cell"
        onClick={() => setActivePanel('report')}
      >
        <Flag size={20} strokeWidth={1.8} className="fc-util-cell-icon" />
        <span className="fc-util-cell-label">Report</span>
      </button>
    </div>
  )
}

// ── Report Form (inline) ──
function ReportForm({
  char,
  pinyin,
  english,
}: {
  char: string
  pinyin: string
  english: string
}) {
  const [message, setMessage] = useState('')
  const [submitted, setSubmitted] = useState(false)

  // Reset when card changes
  useEffect(() => {
    setMessage('')
    setSubmitted(false)
  }, [char])

  if (submitted) {
    return (
      <div className="fc-util-report-done">
        <span className="fc-util-report-done-icon">✓</span>
        <span>Thanks for the report!</span>
      </div>
    )
  }

  return (
    <div className="fc-util-report-form">
      <div className="fc-util-report-card-info">
        {char} · {pinyin} · {english}
      </div>
      <textarea
        className="fc-util-report-textarea"
        placeholder="What's wrong with this card?"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={3}
      />
      <button
        className="fc-util-report-submit"
        disabled={!message.trim()}
        onClick={() => {
          setSubmitted(true)
        }}
      >
        Submit
      </button>
    </div>
  )
}
