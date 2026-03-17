import type { Word } from '../data/vocabulary'

export type Dialect = 'mandarin' | 'cantonese'

export function getRomanization(word: Word, dialect: Dialect): string {
  if (dialect === 'cantonese') return word.jyutping ?? ''
  return word.pinyin
}

export function getRomanizationLabel(dialect: Dialect): string {
  return dialect === 'cantonese' ? 'Jyutping' : 'Pinyin'
}
