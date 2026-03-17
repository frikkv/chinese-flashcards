export function StageDots({
  stageCount,
  currentStage,
}: {
  stageCount: number
  currentStage: number
}) {
  return (
    <div className="fc-stage-dots">
      {stageCount > 1
        ? Array.from({ length: stageCount }, (_, i) => i + 1).map((i) => (
            <div
              key={i}
              className={`fc-stage-dot${i === currentStage ? ' active' : i < currentStage ? ' done' : ''}`}
            />
          ))
        : null}
    </div>
  )
}
