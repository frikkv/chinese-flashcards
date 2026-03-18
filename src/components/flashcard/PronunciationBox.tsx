import { memo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Volume2 } from 'lucide-react'
import { useTRPC } from '#/integrations/trpc/react'
import { speakHanzi } from '#/lib/tts'

const MAX_TRANSLATIONS = 5

function isChineseText(text: string) {
  return /[\u4e00-\u9fff]/.test(text)
}

export const PronunciationBox = memo(function PronunciationBox() {
  const trpc = useTRPC()
  const [input, setInput] = useState('')
  const [translationsLeft, setTranslationsLeft] = useState(MAX_TRANSLATIONS)
  const [result, setResult] = useState<{ char: string; pinyin: string } | null>(
    null,
  )
  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const translateMutation = useMutation(
    trpc.chat.translateToZh.mutationOptions(),
  )

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
})
