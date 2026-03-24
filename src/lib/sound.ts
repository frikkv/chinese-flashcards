/**
 * Sound effects utility.
 *
 * Uses Web Audio API to synthesize short tones — no external files needed.
 * Respects the global "soundEnabled" setting from localStorage.
 * All sounds are <200ms, non-blocking, and prevent overlapping.
 */

let audioCtx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!audioCtx) {
    try {
      audioCtx = new AudioContext()
    } catch {
      return null
    }
  }
  // Resume if suspended (browser autoplay policy).
  // This is called from user gesture handlers so resume succeeds immediately.
  if (audioCtx.state === 'suspended') {
    audioCtx.resume()
  }
  return audioCtx
}

function isSoundEnabled(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem('soundEnabled') !== 'false'
}

function getVolume(): number {
  if (typeof window === 'undefined') return 0.5
  const val = parseInt(localStorage.getItem('soundVolume') ?? '50')
  return Math.max(0, Math.min(100, val)) / 100
}

/**
 * Correct answer: quick two-note rising ding (~120ms).
 * First note (G5) plays briefly, then a higher note (C6) rings out —
 * the classic "ding-ding" confirmation sound, light and airy.
 */
export function playCorrect() {
  if (!isSoundEnabled()) return
  const ctx = getCtx()
  if (!ctx) return
  const t = ctx.currentTime
  const vol = getVolume()
  if (vol <= 0) return

  // Note 1: G5 (784 Hz) — short tap
  const osc1 = ctx.createOscillator()
  const g1 = ctx.createGain()
  osc1.connect(g1)
  g1.connect(ctx.destination)
  osc1.type = 'triangle'
  osc1.frequency.value = 784
  g1.gain.setValueAtTime(Math.max(0.12 * vol, 0.002), t)
  g1.gain.exponentialRampToValueAtTime(0.001, t + 0.06)
  osc1.start(t)
  osc1.stop(t + 0.06)

  // Note 2: C6 (1047 Hz) — rings slightly longer
  const osc2 = ctx.createOscillator()
  const g2 = ctx.createGain()
  osc2.connect(g2)
  g2.connect(ctx.destination)
  osc2.type = 'triangle'
  osc2.frequency.value = 1047
  g2.gain.setValueAtTime(Math.max(0.1 * vol, 0.002), t + 0.04)
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.12)
  osc2.start(t + 0.04)
  osc2.stop(t + 0.12)
}

/**
 * Wrong answer: soft low descending tone (E4 → C4, 180ms, quieter)
 */
export function playWrong() {
  if (!isSoundEnabled()) return
  const ctx = getCtx()
  if (!ctx) return

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)

  const vol = getVolume()
  if (vol <= 0) return
  osc.type = 'sine'
  osc.frequency.setValueAtTime(330, ctx.currentTime) // E4
  osc.frequency.linearRampToValueAtTime(262, ctx.currentTime + 0.12) // → C4

  gain.gain.setValueAtTime(Math.max(0.1 * vol, 0.002), ctx.currentTime) // quieter than correct
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18)

  osc.start(ctx.currentTime)
  osc.stop(ctx.currentTime + 0.18)
}
