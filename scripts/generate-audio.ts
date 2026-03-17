import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { existsSync, writeFileSync, mkdirSync } from 'fs'
import OpenAI from 'openai'
import { hsk1Words, hsk2Words, lang1511Units } from '../src/data/vocabulary.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../.env.local') })

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const audioDir = resolve(__dirname, '../public/audio')
mkdirSync(audioDir, { recursive: true })

// Deduplicate by char — same character may appear in multiple sets
const seen = new Set<string>()
const allWords = [
  ...hsk1Words,
  ...hsk2Words,
  ...lang1511Units.flatMap((u) => u.words),
].filter((w) => {
  if (seen.has(w.char)) return false
  seen.add(w.char)
  return true
})

async function main() {
  console.log(`Generating audio for ${allWords.length} unique words…\n`)
  let generated = 0
  let skipped = 0

  for (const word of allWords) {
    const filename = encodeURIComponent(word.char) + '.mp3'
    const filepath = resolve(audioDir, filename)

    if (existsSync(filepath)) {
      skipped++
      continue
    }

    try {
      const response = await openai.audio.speech.create({
        model: 'tts-1',
        voice: 'shimmer',
        input: word.char,
        response_format: 'mp3',
        speed: 0.85,
      })

      const buffer = Buffer.from(await response.arrayBuffer())
      writeFileSync(filepath, buffer)
      generated++
      console.log(`[${generated}] ${word.char} (${word.pinyin}) → ${filename}`)
    } catch (err) {
      console.error(`  ✗ Failed for ${word.char}:`, err)
    }

    // ~3 req/s — well within OpenAI TTS limits
    await new Promise((r) => setTimeout(r, 320))
  }

  console.log(`\nDone. Generated: ${generated}, Skipped (cached): ${skipped}`)
}

main()
  .catch(console.error)
  .finally(() => process.exit(0))
