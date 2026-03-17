let _currentAudio: HTMLAudioElement | null = null

// Fallback: Web Speech API for any word without a cached MP3
let _zhVoice: SpeechSynthesisVoice | null = null

function loadZhVoice() {
  const voices = window.speechSynthesis.getVoices()
  _zhVoice =
    voices.find((v) => v.lang === 'zh-CN') ??
    voices.find((v) => v.lang === 'zh-TW') ??
    voices.find((v) => v.lang.startsWith('zh')) ??
    null
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  window.speechSynthesis.addEventListener('voiceschanged', loadZhVoice)
  loadZhVoice()
}

function speakFallback(hanzi: string) {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  setTimeout(() => {
    const chars = [...hanzi]
    const text =
      chars.length > 1
        ? chars.join('\u2009') + '\u2009，。'
        : hanzi + '，。'
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'zh-CN'
    utterance.rate = 0.65
    if (_zhVoice) utterance.voice = _zhVoice
    window.speechSynthesis.speak(utterance)
  }, 80)
}

export function speakHanzi(hanzi: string) {
  if (!hanzi) return

  // Stop any currently playing audio
  if (_currentAudio) {
    _currentAudio.pause()
    _currentAudio.currentTime = 0
    _currentAudio = null
  }
  window.speechSynthesis?.cancel()

  const src = '/audio/' + encodeURIComponent(hanzi) + '.mp3'
  const audio = new Audio(src)
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
