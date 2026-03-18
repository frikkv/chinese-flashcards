import type { MasteryStats } from '#/lib/mastery'

export function WordSetRow({ name, stats }: { name: string; stats: MasteryStats }) {
  const knownPct =
    stats.total > 0 ? Math.round((stats.known / stats.total) * 100) : 0
  return (
    <div className="fc-profile-wordset-row">
      <div className="fc-profile-wordset-name">{name}</div>
      <div className="fc-profile-wordset-bar-wrap">
        <div className="fc-profile-wordset-bar">
          <div
            className="fc-profile-wordset-bar-fill"
            style={{ width: `${knownPct}%` }}
          />
        </div>
        <span className="fc-profile-wordset-pct">{knownPct}%</span>
      </div>
      <div className="fc-profile-wordset-chips">
        <span className="fc-profile-chip fc-profile-chip--new">
          {stats.new} new
        </span>
        <span className="fc-profile-chip fc-profile-chip--learning">
          {stats.learning} learning
        </span>
        <span className="fc-profile-chip fc-profile-chip--known">
          {stats.known} known
        </span>
        {stats.accuracy !== null && (
          <span className="fc-profile-chip fc-profile-chip--acc">
            {stats.accuracy}% acc
          </span>
        )}
      </div>
    </div>
  )
}
