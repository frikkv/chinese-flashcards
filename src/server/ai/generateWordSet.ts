import OpenAI from 'openai'
import type { Dialect } from '#/lib/dialect'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

interface Word {
  char: string
  pinyin: string
  english: string
  jyutping?: string
}

const MANDARIN_SYSTEM_PROMPT = `You are a Chinese language expert. Extract Chinese vocabulary from the provided text.

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

const CANTONESE_SYSTEM_PROMPT = `You are a Cantonese language expert. Extract Cantonese vocabulary from the provided text.

Return a JSON object with a single key "words" containing an array. Each element must have exactly:
- "char": the Chinese character(s) (use traditional characters preferred in Cantonese)
- "jyutping": the Jyutping romanization with tone numbers (e.g. "nei5 hou2")
- "english": concise English meaning

Rules:
- Only include actual Chinese/Cantonese vocabulary words/phrases present in the text
- Use Jyutping romanization with tone numbers 1-6
- Maximum 60 words; prefer the most useful/frequent ones
- Deduplicate: no repeated characters
- Return ONLY a valid JSON object

Example: {"words":[{"char":"你好","jyutping":"nei5 hou2","english":"hello"},{"char":"飲茶","jyutping":"jam2 caa4","english":"yum cha"}]}`

const MANDARIN_GENERATE_PROMPT = `You are a Chinese language expert. Generate Chinese (Mandarin) vocabulary for the topic or description the user provides.

Return a JSON object with a single key "words" containing an array. Each element must have exactly:
- "char": the Chinese character(s)
- "pinyin": the pinyin with tone diacritics (e.g. "nǐ hǎo")
- "english": concise English meaning

Rules:
- Generate useful, real vocabulary that matches the user's description
- Order by usefulness/frequency (most common first)
- Deduplicate: no repeated characters
- Return ONLY a valid JSON object

Example: {"words":[{"char":"你好","pinyin":"nǐ hǎo","english":"hello"},{"char":"学习","pinyin":"xué xí","english":"to study"}]}`

const CANTONESE_GENERATE_PROMPT = `You are a Cantonese language expert. Generate Cantonese vocabulary for the topic or description the user provides.

Return a JSON object with a single key "words" containing an array. Each element must have exactly:
- "char": the Chinese character(s) (use traditional characters preferred in Cantonese)
- "jyutping": the Jyutping romanization with tone numbers (e.g. "nei5 hou2")
- "english": concise English meaning

Rules:
- Generate useful, real Cantonese vocabulary that matches the user's description
- Use Jyutping romanization with tone numbers 1-6
- Order by usefulness/frequency (most common first)
- Deduplicate: no repeated characters
- Return ONLY a valid JSON object

Example: {"words":[{"char":"你好","jyutping":"nei5 hou2","english":"hello"},{"char":"飲茶","jyutping":"jam2 caa4","english":"yum cha"}]}`

function parseWordResponse(
  content: string,
  isCantonese: boolean,
  maxWords: number,
): Word[] {
  try {
    const parsed = JSON.parse(content) as { words?: unknown[] }
    const words = parsed.words ?? []
    return (words as Record<string, unknown>[])
      .map((w) => {
        if (typeof w.char !== 'string' || typeof w.english !== 'string')
          return null
        if (isCantonese) {
          if (typeof w.jyutping !== 'string') return null
          return {
            char: w.char,
            pinyin: '',
            english: w.english,
            jyutping: w.jyutping,
          }
        }
        if (typeof w.pinyin !== 'string') return null
        return { char: w.char, pinyin: w.pinyin, english: w.english }
      })
      .filter((w): w is Word => w !== null)
      .filter((w, i, arr) => arr.findIndex((x) => x.char === w.char) === i)
      .slice(0, maxWords)
  } catch {
    return []
  }
}

export async function generateWordSetFromPrompt(
  prompt: string,
  wordCount?: number,
  dialect: Dialect = 'mandarin',
): Promise<Word[]> {
  const isCantonese = dialect === 'cantonese'
  const systemPrompt = isCantonese
    ? CANTONESE_GENERATE_PROMPT
    : MANDARIN_GENERATE_PROMPT

  const countInstruction = wordCount
    ? `Generate approximately ${wordCount}`
    : 'Generate a comprehensive list of'

  const response = await openai.chat.completions.create(
    {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `${countInstruction} ${isCantonese ? 'Cantonese' : 'Chinese'} vocabulary words/phrases for: ${prompt}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 4000,
    },
    { signal: AbortSignal.timeout(30_000) },
  )

  const content = response.choices[0]?.message.content ?? '{}'
  return parseWordResponse(content, isCantonese, wordCount ?? 60)
}

const MANDARIN_EDIT_PROMPT = `You are a Chinese language expert. You will receive a JSON list of Chinese vocabulary words and an instruction describing how to modify the list.

Apply the instruction to the word list. You may add, remove, or modify words as described. Return a JSON object with a single key "words" containing the modified array. Each element must have exactly:
- "char": the Chinese character(s)
- "pinyin": the pinyin with tone diacritics (e.g. "nǐ hǎo")
- "english": concise English meaning

Rules:
- Follow the user's instruction precisely
- Keep existing words unchanged unless the instruction says to modify or remove them
- For new words, use correct pinyin with tone diacritics
- Deduplicate: no repeated characters
- Maximum 200 words total
- Return ONLY a valid JSON object`

const CANTONESE_EDIT_PROMPT = `You are a Cantonese language expert. You will receive a JSON list of Cantonese vocabulary words and an instruction describing how to modify the list.

Apply the instruction to the word list. You may add, remove, or modify words as described. Return a JSON object with a single key "words" containing the modified array. Each element must have exactly:
- "char": the Chinese character(s) (use traditional characters preferred in Cantonese)
- "jyutping": the Jyutping romanization with tone numbers (e.g. "nei5 hou2")
- "english": concise English meaning

Rules:
- Follow the user's instruction precisely
- Keep existing words unchanged unless the instruction says to modify or remove them
- Use Jyutping romanization with tone numbers 1-6
- Deduplicate: no repeated characters
- Maximum 200 words total
- Return ONLY a valid JSON object`

export async function editWordSetWithAI(
  words: Word[],
  instruction: string,
  dialect: Dialect = 'mandarin',
): Promise<Word[]> {
  const isCantonese = dialect === 'cantonese'
  const systemPrompt = isCantonese
    ? CANTONESE_EDIT_PROMPT
    : MANDARIN_EDIT_PROMPT

  const wordsJson = JSON.stringify(
    words.map((w) =>
      isCantonese
        ? { char: w.char, jyutping: w.jyutping, english: w.english }
        : { char: w.char, pinyin: w.pinyin, english: w.english },
    ),
  )

  const response = await openai.chat.completions.create(
    {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Current word list:\n${wordsJson}\n\nInstruction: ${instruction}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 8000,
    },
    { signal: AbortSignal.timeout(45_000) },
  )

  const content = response.choices[0]?.message.content ?? '{}'
  return parseWordResponse(content, isCantonese, 200)
}

export async function generateWordSet(
  text: string,
  dialect: Dialect = 'mandarin',
): Promise<Word[]> {
  const isCantonese = dialect === 'cantonese'
  const systemPrompt = isCantonese
    ? CANTONESE_SYSTEM_PROMPT
    : MANDARIN_SYSTEM_PROMPT

  const response = await openai.chat.completions.create(
    {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Extract ${isCantonese ? 'Cantonese' : 'Chinese'} vocabulary from this text:\n\n${text}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 2000,
    },
    { signal: AbortSignal.timeout(30_000) },
  )

  const content = response.choices[0]?.message.content ?? '{}'
  return parseWordResponse(content, isCantonese, 60)
}
