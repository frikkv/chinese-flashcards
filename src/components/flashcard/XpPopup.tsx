import { useState, useEffect, useRef } from 'react'

/**
 * Small floating "+N XP" popup that animates upward and fades out.
 * Pass a new `triggerKey` (e.g. timestamp) each time you want it to fire.
 * `amount` controls the displayed XP value.
 * Renders nothing when idle — no layout impact.
 */
export function XpPopup({ triggerKey, amount = 1 }: { triggerKey: number; amount?: number }) {
  const [visible, setVisible] = useState(false)
  const [display, setDisplay] = useState(1)
  const [key, setKey] = useState(0)
  const lastFiredRef = useRef(0)

  useEffect(() => {
    if (triggerKey === 0 || triggerKey === lastFiredRef.current) return
    lastFiredRef.current = triggerKey
    setKey(triggerKey)
    setDisplay(amount)
    setVisible(true)
    const timer = setTimeout(() => setVisible(false), 1800)
    return () => clearTimeout(timer)
  }, [triggerKey, amount])

  if (!visible) return null

  return (
    <span key={key} className={`fc-xp-popup${display > 1 ? ' fc-xp-popup--combo' : ''}`}>
      +{display} XP
    </span>
  )
}
