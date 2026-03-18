import type { Word } from '#/data/vocabulary'
import type { Dialect } from '#/lib/dialect'

export type Page = 'wordset' | 'study' | 'results' | 'sound' | 'tone'
export type AnswerStyle = 'multiple-choice' | 'type'

export interface Settings {
  answerStyle: AnswerStyle
  defaultMode: 1 | 2 | 3
  sessionSize: 10 | 20 | 30
}

export interface LastSession {
  wordSetKey: string
  hskLevels: Set<number>
  units: Set<number>
  customSetId?: string
  dialect: Dialect
  settings: Settings
  soundSettings?: SoundSettings
  toneSessionSize?: 10 | 20 | 30
  vocab: Word[]
  desc: string
}

export interface CustomWordSet {
  id: string
  name: string
  words: Word[]
  wordCount: number
  dialect: Dialect
  sourceFileName: string | null | undefined
  isFavorited: boolean
  createdAt: Date
}

export interface AllTimeStats {
  studied: number
  correct: number
  sessions: number
}

export type SoundAnswerFormat = 'char' | 'pinyin' | 'both' | 'english'

export interface SoundSettings {
  answerFormat: SoundAnswerFormat
  answerStyle: AnswerStyle
  sessionSize: 10 | 20 | 30
  stageCount?: 1 | 2
}
