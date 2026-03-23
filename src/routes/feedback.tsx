import { createFileRoute, Link } from '@tanstack/react-router'
import { AppHeader } from '#/components/AppHeader'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authClient } from '#/lib/auth-client'
import { useTRPC } from '#/integrations/trpc/react'

export const Route = createFileRoute('/feedback')({ component: FeedbackPage })

function FeedbackPage() {
  const { data: session, isPending } = authClient.useSession()
  const trpc = useTRPC()
  const qc = useQueryClient()

  const [type, setType] = useState<'feedback' | 'feature' | 'bug'>('feedback')
  const [message, setMessage] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const pastFeedback = useQuery({
    ...trpc.feedback.list.queryOptions(),
    enabled: !!session?.user,
  })

  const submitMutation = useMutation(
    trpc.feedback.submit.mutationOptions({
      onSuccess: () => {
        setMessage('')
        setSubmitted(true)
        qc.invalidateQueries({ queryKey: trpc.feedback.list.queryKey() })
        setTimeout(() => setSubmitted(false), 3000)
      },
    }),
  )

  if (isPending) {
    return (
      <div className="fc-app fc-auth-loading">
        <div className="fc-auth-spinner" />
      </div>
    )
  }

  if (!session?.user) {
    return (
      <div className="fc-app">
        <div className="fc-profile-noauth">
          <div className="fc-profile-noauth-char">反</div>
          <h2 className="fc-profile-noauth-title">Sign in to give feedback</h2>
          <p className="fc-profile-noauth-sub">
            We'd love to hear your ideas for improving the app.
          </p>
          <Link
            to="/"
            className="fc-start-btn"
            style={{ display: 'inline-block', textDecoration: 'none' }}
          >
            ← Back to flashcards
          </Link>
        </div>
      </div>
    )
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim() || submitMutation.isPending) return
    submitMutation.mutate({ type, message: message.trim() })
  }

  const typeLabels = {
    feedback: 'General Feedback',
    feature: 'Feature Request',
    bug: 'Bug Report',
  } as const

  return (
    <div className="fc-app fc-app--wordset">
      <AppHeader />
      <div className="fc-social-container">
        <h1 className="fc-social-title" style={{ marginBottom: 16 }}>
          Feedback
        </h1>

        {/* Submit form */}
        <div className="fc-social-section">
          <div className="fc-social-section-title">Share your thoughts</div>

          <form onSubmit={handleSubmit}>
            {/* Type selector */}
            <div className="fc-feedback-type-row">
              {(['feedback', 'feature', 'bug'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`fc-setting-opt${type === t ? ' selected' : ''}`}
                  onClick={() => setType(t)}
                >
                  {typeLabels[t]}
                </button>
              ))}
            </div>

            {/* Message */}
            <textarea
              className="fc-feedback-textarea"
              placeholder={
                type === 'feature'
                  ? 'Describe the feature you would like to see...'
                  : type === 'bug'
                    ? 'Describe what went wrong...'
                    : 'Tell us what you think...'
              }
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              maxLength={2000}
            />

            <div className="fc-feedback-footer">
              <span className="fc-feedback-charcount">
                {message.length} / 2,000
              </span>
              <button
                type="submit"
                className="fc-start-btn"
                disabled={!message.trim() || submitMutation.isPending}
                style={{ padding: '10px 28px', fontSize: '0.95rem' }}
              >
                {submitMutation.isPending ? 'Sending...' : 'Send Feedback'}
              </button>
            </div>

            {submitted && (
              <div className="fc-feedback-success">
                Thanks for your feedback!
              </div>
            )}
          </form>
        </div>

        {/* Past feedback */}
        {(pastFeedback.data?.length ?? 0) > 0 && (
          <div className="fc-social-section">
            <div className="fc-social-section-title">Your past feedback</div>
            {pastFeedback.data!.map((fb) => (
              <div key={fb.id} className="fc-feedback-item">
                <div className="fc-feedback-item-header">
                  <span className="fc-feedback-item-type">
                    {typeLabels[fb.type as keyof typeof typeLabels]}
                  </span>
                  <span className="fc-feedback-item-date">
                    {new Date(fb.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="fc-feedback-item-message">{fb.message}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
