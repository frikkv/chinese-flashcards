import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { eq } from 'drizzle-orm'
import { hsk1Words, hsk2Words, lang1511Units } from '../src/data/vocabulary.ts'
import { generateDistractors } from '../src/server/ai/generateDistractors.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../.env.local') })

// Dynamic imports AFTER dotenv so DATABASE_URL is set at db module load time
const { db } = await import('../src/db/index.ts')
const { distractorSets } = await import('../src/db/schema.ts')

const allVocab = [
  ...hsk1Words,
  ...hsk2Words,
  ...lang1511Units.flatMap((u) => u.words),
]

async function main() {
  console.log(`Total vocab: ${allVocab.length} words`)
  let generated = 0
  let skipped = 0

  for (const word of allVocab) {
    const existing = await db
      .select({ id: distractorSets.id })
      .from(distractorSets)
      .where(eq(distractorSets.vocabKey, word.char))
      .limit(1)

    if (existing.length > 0) {
      skipped++
      continue
    }

    const { distractors, source } = await generateDistractors(word, allVocab)
    await db.insert(distractorSets).values({
      id: crypto.randomUUID(),
      vocabKey: word.char,
      correctAnswer: word.english,
      distractorsJson: JSON.stringify(distractors),
      source,
      createdAt: new Date(),
    })

    generated++
    console.log(`[${generated}] ${word.char} → [${distractors.join(', ')}] [${source}]`)

    // Rate limit: ~5 req/s to stay well under GPT-4o-mini limits
    await new Promise((resolve) => setTimeout(resolve, 200))
  }

  console.log(`\nDone. Generated: ${generated}, Skipped (cached): ${skipped}`)
}

main().catch(console.error).finally(() => process.exit(0))
