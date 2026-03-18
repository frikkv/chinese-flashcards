import type { MasteryStats } from '#/lib/mastery'

interface PerformanceInsightsProps {
  strongest: { name: string; stats: MasteryStats } | null
  weakest: { name: string; stats: MasteryStats } | null
  topHardest: Array<{ char: string; acc: number }>
  topRecentMastered: Array<{ char: string }>
}

export function PerformanceInsights({
  strongest,
  weakest,
  topHardest,
  topRecentMastered,
}: PerformanceInsightsProps) {
  if (
    topHardest.length === 0 &&
    topRecentMastered.length === 0 &&
    !strongest &&
    !weakest
  ) {
    return null
  }

  return (
    <div className="fc-profile-section">
      <div className="fc-profile-section-title">Performance Insights</div>

      <div className="fc-profile-insights-grid">
        {/* Strongest / weakest */}
        {(strongest || weakest) && (
          <div className="fc-profile-insight-card">
            {strongest && (
              <div className="fc-profile-insight-row">
                <span className="fc-profile-insight-icon">🏆</span>
                <div>
                  <div className="fc-profile-insight-label">
                    Strongest set
                  </div>
                  <div className="fc-profile-insight-val">
                    {strongest.name}
                    {strongest.stats.accuracy !== null && (
                      <span className="fc-profile-insight-sub">
                        {' '}
                        · {strongest.stats.accuracy}% accuracy
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
            {weakest && weakest.name !== strongest?.name && (
              <div className="fc-profile-insight-row">
                <span className="fc-profile-insight-icon">📈</span>
                <div>
                  <div className="fc-profile-insight-label">
                    Needs work
                  </div>
                  <div className="fc-profile-insight-val">
                    {weakest.name}
                    {weakest.stats.accuracy !== null && (
                      <span className="fc-profile-insight-sub">
                        {' '}
                        · {weakest.stats.accuracy}% accuracy
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Currently struggling with */}
        {topHardest.length > 0 && (
          <div className="fc-profile-insight-card">
            <div
              className="fc-profile-insight-label"
              style={{ marginBottom: 10 }}
            >
              Struggling with
            </div>
            <div className="fc-profile-char-grid">
              {topHardest.map(({ char, acc }) => (
                <div key={char} className="fc-profile-char-item">
                  <span className="fc-profile-char">{char}</span>
                  <span className="fc-profile-char-acc">
                    {Math.round(acc * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recently mastered */}
        {topRecentMastered.length > 0 && (
          <div className="fc-profile-insight-card">
            <div
              className="fc-profile-insight-label"
              style={{ marginBottom: 10 }}
            >
              Recently mastered
            </div>
            <div className="fc-profile-char-grid">
              {topRecentMastered.map(({ char }) => (
                <div
                  key={char}
                  className="fc-profile-char-item fc-profile-char-item--known"
                >
                  <span className="fc-profile-char">{char}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
