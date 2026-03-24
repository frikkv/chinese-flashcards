import type { Dialect } from './dialect'

let _currentAudio: HTMLAudioElement | null = null

function getSpeechVolume(): number {
  if (typeof window === 'undefined') return 0.35
  const val = parseInt(localStorage.getItem('speechVolume') ?? '50')
  return (Math.max(0, Math.min(100, val)) / 100) * 0.7 // cap at 70% of system max
}

// Fallback: Web Speech API for any word without a cached MP3
let _zhVoice: SpeechSynthesisVoice | null = null
let _zhHKVoice: SpeechSynthesisVoice | null = null

function loadZhVoice() {
  const voices = window.speechSynthesis.getVoices()
  _zhVoice =
    voices.find((v) => v.lang === 'zh-CN') ??
    voices.find((v) => v.lang === 'zh-TW') ??
    voices.find((v) => v.lang.startsWith('zh')) ??
    null
  _zhHKVoice =
    voices.find((v) => v.lang === 'zh-HK') ??
    voices.find((v) => v.lang === 'yue-HK') ??
    voices.find((v) => v.lang === 'yue') ??
    _zhVoice
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  window.speechSynthesis.addEventListener('voiceschanged', loadZhVoice)
  loadZhVoice()
}

function speakFallback(hanzi: string, locale: 'zh-CN' | 'zh-HK' = 'zh-CN') {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  setTimeout(() => {
    const chars = [...hanzi]
    const text =
      chars.length > 1 ? chars.join('\u2009') + '\u2009，。' : hanzi + '，。'
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = locale
    utterance.rate = 0.65
    utterance.volume = getSpeechVolume()
    const voice = locale === 'zh-HK' ? _zhHKVoice : _zhVoice
    if (voice) utterance.voice = voice
    window.speechSynthesis.speak(utterance)
  }, 80)
}

export function speakHanzi(hanzi: string, dialect: Dialect = 'mandarin') {
  if (!hanzi) return

  // Stop any currently playing audio
  if (_currentAudio) {
    _currentAudio.pause()
    _currentAudio.currentTime = 0
    _currentAudio = null
  }
  window.speechSynthesis?.cancel()

  // Cantonese: skip MP3 lookup, go straight to Web Speech API with zh-HK
  if (dialect === 'cantonese') {
    speakFallback(hanzi, 'zh-HK')
    return
  }

  const src = '/audio/' + encodeURIComponent(hanzi) + '.mp3'
  const audio = new Audio(src)
  audio.volume = getSpeechVolume()
  _currentAudio = audio

  function play() {
    if (_currentAudio !== audio) return // superseded by a newer call
    audio.play().catch(() => speakFallback(hanzi))
  }

  if (audio.readyState >= 3) {
    play()
  } else {
    audio.addEventListener('canplaythrough', play, { once: true })
    audio.addEventListener('error', () => speakFallback(hanzi), { once: true })
  }
}
