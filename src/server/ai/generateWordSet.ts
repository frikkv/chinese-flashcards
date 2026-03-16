import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

interface Word {
  char: string
  pinyin: string
  english: string
}

// json_object mode requires an object wrapper — the array lives under "words".
const SYSTEM_PROMPT = `You are a Chinese language expert. Extract Chinese vocabulary from the provided text.

Return a JSON object with a single key "words" containing an array. Each element must have exactly:
- "char": the Chinese character(s)
- "pinyin": the pinyin with tone diacritics (e.g. "nǐ hǎo")
- "english": concise English meaning

Rules:
- Only include actual Chinese vocabulary words/phrases present in the text
- Maximum 60 words; prefer the most useful/frequent ones
- Deduplicate: no repeated characters
- Return ONLY a valid JSON object

Example: {"words":[{"char":"你好","pinyin":"nǐ hǎo","english":"hello"},{"char":"学习","pinyin":"xué xí","english":"to study"}]}`

export async function generateWordSet(text: string): Promise<Word[]> {
  const response = await openai.chat.completions.create(
    {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Extract Chinese vocabulary from this text:\n\n${text}` },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 2000,
    },
    { signal: AbortSignal.timeout(30_000) },
  )

  const content = response.choices[0]?.message.content ?? '{}'

  try {
    const parsed = JSON.parse(content) as { words?: unknown[] }
    const words = parsed.words ?? []
    return (words as Word[])
      .filter(
        (w) =>
          typeof w.char === 'string' &&
          typeof w.pinyin === 'string' &&
          typeof w.english === 'string',
      )
      .slice(0, 60)
  } catch {
    return []
  }
}
