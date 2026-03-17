export function Skeleton({
  width,
  height,
  circle = false,
  className = '',
  style,
}: {
  width?: number | string
  height?: number | string
  circle?: boolean
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div
      className={['fc-skeleton', circle && 'fc-skeleton--circle', className]
        .filter(Boolean)
        .join(' ')}
      style={{ width, height, ...style }}
      aria-hidden="true"
    />
  )
}
