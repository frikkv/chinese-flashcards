import { memo, useState, useEffect, useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTRPC } from '#/integrations/trpc/react'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatCardContext {
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

function CHAT_SUGGESTIONS_FOR_CARD(_ctx: ChatCardContext) {
  return [
    'Use this word in a sentence.',
    'What are common mistakes with this word?',
    'How do I remember this word?',
  ]
}

export const ChatPanel = memo(function ChatPanel({
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
    const newMessages: ChatMessage[] = [
      ...messages,
      { role: 'user', content: userText },
    ]
    setMessages(newMessages)
    setIsLoading(true)
    try {
      const result = await sendMutation.mutateAsync({
        messages: newMessages,
        cardContext,
      })
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: result.content },
      ])
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
    <div
      className={inline ? 'fc-chat-panel--inline' : 'fc-chat-panel--overlay'}
    >
      {/* Header */}
      <div className="fc-chat-header">
        <div className="fc-chat-header-left">
          <span className="fc-chat-title">Ask AI</span>
        </div>
        {!inline && onClose && (
          <button
            className="fc-chat-close"
            onClick={onClose}
            aria-label="Close chat"
          >
            ✕
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="fc-chat-messages">
        {messages.length === 0 ? (
          <div className="fc-chat-empty">
            <div className="fc-chat-empty-char">问</div>
            <div>
              {cardContext
                ? 'Ask anything about this word or Chinese in general.'
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
        {/* Suggestions / typing indicator — fixed-height container prevents shift */}
        <div className="fc-chat-bottom">
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
        </div>
        <div ref={messagesEndRef} />
      </div>

      {/* Error */}
      {errorMsg && <div className="fc-chat-error">{errorMsg}</div>}

      {/* Input */}
      <div className="fc-chat-input-row">
        <textarea
          ref={inputRef}
          className="fc-chat-input"
          rows={2}
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
})
