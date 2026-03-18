export function StatCard({
  num,
  label,
  sub,
  color,
  featured,
  tone,
  wide,
}: {
  num: string | number
  label: string
  sub?: string
  color?: string
  featured?: boolean
  tone?: 'success' | 'warning' | 'streak' | 'blue'
  wide?: boolean
}) {
  const cls = [
    'fc-profile-stat',
    featured && 'fc-profile-stat--featured',
    tone && `fc-profile-stat--${tone}`,
    wide && 'fc-profile-stat--wide',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <div className={cls}>
      <div
        className="fc-profile-stat-num"
        style={color ? { color } : undefined}
      >
        {num}
      </div>
      <div className="fc-profile-stat-label">{label}</div>
      {sub && <div className="fc-profile-stat-sub">{sub}</div>}
    </div>
  )
}
