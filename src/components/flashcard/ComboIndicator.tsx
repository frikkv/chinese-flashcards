/**
 * Small persistent combo indicator shown during study when combo is active (≥3).
 * Shows "Combo active" at 3, then "Combo x2", "x3", etc.
 * Renders nothing when combo < 3.
 */
export function ComboIndicator({ combo }: { combo: number }) {
  if (combo < 3) return null

  const multiplier = combo >= 4 ? combo - 2 : null

  return (
    <div className="fc-combo-indicator">
      <span className="fc-combo-icon">⚡</span>
      <span className="fc-combo-text">
        {multiplier ? `Combo x${multiplier}` : 'Combo active'}
      </span>
    </div>
  )
}
