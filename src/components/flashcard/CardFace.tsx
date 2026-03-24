import { memo } from 'react'
import { Volume2 } from 'lucide-react'
import type { Dialect } from '#/lib/dialect'
import { speakHanzi } from '#/lib/tts'

export interface CardContent {
  tag: string
  char?: string
  pinyin?: string
  pinyinLarge?: boolean
  english?: string
  englishLarge?: boolean
  isRecall?: boolean
}

// Card usable width ≈ 448px = 28rem (560px card – 56px padding each side).
// Target 25rem so there's always a margin. Each CJK char is ~1em wide.
export function charFontStyle(
  char: string,
  compact: boolean,
): React.CSSProperties | undefined {
  const len = [...char].length
  const cssMax = compact ? 6 : 10
  const fitMax = 25 / len
  if (fitMax >= cssMax) return undefined // CSS clamp handles it fine
  return { fontSize: `${Math.max(1.5, fitMax).toFixed(2)}rem` }
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V']

export const CardFace = memo(function CardFace({
  content,
  isBack,
  hanzi,
  dialect = 'mandarin',
  stage,
  stageCount,
}: {
  content: CardContent | null
  isBack?: boolean
  hanzi: string
  dialect?: Dialect
  stage?: number
  stageCount?: number
}) {
  return (
    <div className={`fc-card-face${isBack ? ' back' : ''}`}>
      {/* Stage numeral — top left, same size as speaker button */}
      {stageCount && stageCount > 1 && stage && (
        <span className="fc-card-stage">{ROMAN[stage] ?? stage}</span>
      )}
      {hanzi && (
        <button
          className="fc-speaker-btn"
          onClick={(e) => {
            e.stopPropagation()
            speakHanzi(hanzi, dialect)
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
})
