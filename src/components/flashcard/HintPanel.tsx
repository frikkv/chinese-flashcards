import { useState, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Lightbulb, X } from 'lucide-react'
import { useTRPC } from '#/integrations/trpc/react'

interface HintPanelProps {
  char: string
  pinyin: string
  english: string
  answerTarget: 'english' | 'pinyin'
  onClose?: () => void
}

export function HintPanel({
  char,
  pinyin,
  english,
  answerTarget,
  onClose,
}: HintPanelProps) {
  const trpc = useTRPC()
  const [hints, setHints] = useState<string[]>([])
  const [currentLevel, setCurrentLevel] = useState(0)

  const hintMutation = useMutation(trpc.chat.generateHint.mutationOptions())

  // Reset when card changes
  useEffect(() => {
    setHints([])
    setCurrentLevel(0)
  }, [char])

  // Auto-fetch first hint on mount
  useEffect(() => {
    if (currentLevel === 0 && hints.length === 0 && !hintMutation.isPending) {
      hintMutation.mutate(
        { char, pinyin, english, level: 1, answerTarget },
        {
          onSuccess: (data) => {
            setHints([data.hint])
            setCurrentLevel(1)
          },
        },
      )
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleReveal() {
    const nextLevel = currentLevel + 1
    if (nextLevel > 3 || hintMutation.isPending) return

    hintMutation.mutate(
      { char, pinyin, english, level: nextLevel, answerTarget },
      {
        onSuccess: (data) => {
          setHints((prev) => [...prev, data.hint])
          setCurrentLevel(nextLevel)
        },
      },
    )
  }

  const buttonLabel =
    currentLevel === 0
      ? 'Reveal hint'
      : currentLevel === 1
        ? 'Another hint'
        : currentLevel === 2
          ? 'Final hint'
          : null

  return (
    <div className="fc-hint-panel">
      <div className="fc-hint-header">
        <div className="fc-hint-title">
          <Lightbulb size={15} strokeWidth={2} />
          <span>Hints</span>
        </div>
        {onClose && (
          <button className="fc-util-close-btn" onClick={onClose} aria-label="Close">
            <X size={14} />
          </button>
        )}
      </div>

      <div className="fc-hint-body">
        {hints.length === 0 && !hintMutation.isPending && (
          <div className="fc-hint-empty">
            <span className="fc-hint-empty-icon">💡</span>
            <span className="fc-hint-empty-text">Need a hint?</span>
          </div>
        )}

        {hints.map((hint, i) => (
          <div key={i} className="fc-hint-item fc-hint-item--revealed">
            <span className="fc-hint-level">Hint {i + 1}</span>
            <span className="fc-hint-text">{hint}</span>
          </div>
        ))}

        {hintMutation.isPending && (
          <div className="fc-hint-item fc-hint-item--loading">
            <span className="fc-hint-level">Hint {currentLevel + 1}</span>
            <span className="fc-hint-skeleton-bar" />
          </div>
        )}
      </div>

      {buttonLabel && !hintMutation.isPending && (
        <button className="fc-hint-reveal-btn" onClick={handleReveal}>
          {buttonLabel}
        </button>
      )}
    </div>
  )
}
