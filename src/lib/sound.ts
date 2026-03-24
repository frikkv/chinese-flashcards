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
  // Resume if suspended (browser autoplay policy)
  if (audioCtx.state === 'suspended') {
    void audioCtx.resume()
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
 * Correct answer: short bright rising tone (C5 → E5, 150ms)
 */
export function playCorrect() {
  if (!isSoundEnabled()) return
  const ctx = getCtx()
  if (!ctx) return

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)

  const vol = getVolume()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(523, ctx.currentTime) // C5
  osc.frequency.linearRampToValueAtTime(659, ctx.currentTime + 0.1) // → E5

  gain.gain.setValueAtTime(0.18 * vol, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15)

  osc.start(ctx.currentTime)
  osc.stop(ctx.currentTime + 0.15)
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
  osc.type = 'sine'
  osc.frequency.setValueAtTime(330, ctx.currentTime) // E4
  osc.frequency.linearRampToValueAtTime(262, ctx.currentTime + 0.12) // → C4

  gain.gain.setValueAtTime(0.1 * vol, ctx.currentTime) // quieter than correct
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18)

  osc.start(ctx.currentTime)
  osc.stop(ctx.currentTime + 0.18)
}
