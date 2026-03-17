export function NextButton({
  visible,
  onClick,
}: {
  visible: boolean
  onClick: () => void
}) {
  return (
    <div className="fc-study-next-area">
      <button
        className={`fc-next-btn${visible ? ' visible' : ''}`}
        onClick={onClick}
      >
        Next →
      </button>
      {visible && <div className="fc-enter-hint">press Enter ↵</div>}
    </div>
  )
}
