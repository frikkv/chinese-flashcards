import { useState, useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import { User, Trophy } from 'lucide-react'
import type { Word } from '#/data/vocabulary'
import type { Dialect } from '#/lib/dialect'
import { hsk1Words, hsk2Words, lang1511Units } from '#/data/vocabulary'
import { cantoneseBasicsWords } from '#/data/cantonese-vocabulary'
import type { ProgressCard } from '#/components/flashcard/WordSetDashboard'
import type {
  Settings,
  LastSession,
  SoundSettings,
  CustomWordSet,
  AllTimeStats,
} from '#/components/flashcard/types'
import { LeftSidebar } from '#/components/flashcard/wordset/LeftSidebar'
import { CenterSettings } from '#/components/flashcard/wordset/CenterSettings'
// RightSidebar removed for demo - backend logic preserved
import { CustomWordSetModal } from '#/components/flashcard/wordset/CustomWordSetModal'

interface WordSetPageProps {
  lastSession: LastSession | null
  allTimeStats: AllTimeStats
  settings: Settings
  cardProgress?: ProgressCard[]
  thisWeekSessions: number
  thisWeekXP: number
  lastWeekXP: number
  streak: number
  customWordSets: CustomWordSet[]
  isSignedIn: boolean
  authPending: boolean
  progressPending: boolean
  customWordSetsPending: boolean
  onContinue: (
    vocab: Word[],
    mode: 1 | 2 | 3,
    settings: Settings,
    session: LastSession | null,
  ) => void
  onStartSoundOnly: (
    vocab: Word[],
    soundSettings: SoundSettings,
    session?: LastSession,
  ) => void
  onStartToneQuiz: (
    vocab: Word[],
    sessionSize: 10 | 20 | 30,
    session?: LastSession,
  ) => void
  onSignIn?: () => void
}

export function WordSetPage({
  lastSession,
  allTimeStats,
  settings: initialSettings,
  cardProgress,
  thisWeekSessions,
  thisWeekXP,
  lastWeekXP,
  streak,
  customWordSets,
  isSignedIn,
  authPending,
  progressPending,
  customWordSetsPending,
  onContinue,
  onStartSoundOnly,
  onStartToneQuiz,
  onSignIn,
}: WordSetPageProps) {
  const [showCustomModal, setShowCustomModal] = useState(false)
  const [selectedWordSet, setSelectedWordSet] = useState<string | null>(null)
  const [tempStudyWords, setTempStudyWords] = useState<Word[] | null>(null)
  const [selectedUnits, setSelectedUnits] = useState<Set<number>>(new Set())
  const [selectedHSKLevels, setSelectedHSKLevels] = useState<Set<number>>(
    new Set(),
  )
  const [settings, setSettings] = useState<Settings>(initialSettings)
  const [dialectTab, setDialectTab] = useState<Dialect>(
    () =>
      (localStorage.getItem('preferred-dialect') as Dialect | null) ??
      'mandarin',
  )
  const [soundOnlyOpen, setSoundOnlyOpen] = useState(false)
  const [soundSettings, setSoundSettings] = useState<SoundSettings>({
    answerFormat: 'char',
    answerStyle: 'multiple-choice',
    sessionSize: 10,
  })
  const [toneQuizOpen, setToneQuizOpen] = useState(false)

  // Derive the active dialect from the selected word set
  const activeDialect: Dialect = useMemo(() => {
    if (selectedWordSet === 'cantonese_basics') return 'cantonese'
    if (selectedWordSet === 'temp') return dialectTab
    if (selectedWordSet?.startsWith('custom:')) {
      const id = selectedWordSet.slice(7)
      const set = customWordSets.find((s) => s.id === id)
      return set?.dialect === 'cantonese' ? 'cantonese' : 'mandarin'
    }
    if (selectedWordSet === 'last' && lastSession) return lastSession.dialect
    return 'mandarin'
  }, [selectedWordSet, customWordSets, lastSession])

  // Aggregate stats from DB card progress — used by sidebar fallback when no word set selected
  const dashStats = useMemo(() => {
    if (!cardProgress || cardProgress.length === 0) return null
    const studied = cardProgress.filter((c) => c.timesAttempted > 0).length
    if (studied === 0) return null
    const correct = cardProgress.reduce((s, c) => s + c.timesCorrect, 0)
    const reviews = cardProgress.reduce((s, c) => s + c.timesAttempted, 0)
    return { studied, correct, reviews }
  }, [cardProgress])

  // Vocabulary for the currently-selected word set (no alerts — used by sidebar progress card)
  const dashVocab = useMemo<Word[] | null>(() => {
    if (selectedWordSet === 'cantonese_basics') return cantoneseBasicsWords
    if (selectedWordSet === 'hsk') {
      if (selectedHSKLevels.size === 0) return null
      let v: Word[] = []
      if (selectedHSKLevels.has(1)) v = v.concat(hsk1Words)
      if (selectedHSKLevels.has(2)) v = v.concat(hsk2Words)
      return v
    }
    if (selectedWordSet === 'lang1511') {
      if (selectedUnits.size === 0) return null
      return lang1511Units
        .filter((u) => selectedUnits.has(u.unit))
        .flatMap((u) => u.words)
    }
    if (selectedWordSet?.startsWith('custom:')) {
      const id = selectedWordSet.slice(7)
      const words = customWordSets.find((s) => s.id === id)?.words
      return words && words.length > 0 ? (words as Word[]) : null
    }
    if (selectedWordSet === 'last' && lastSession) return lastSession.vocab
    return null
  }, [
    selectedWordSet,
    selectedHSKLevels,
    selectedUnits,
    customWordSets,
    lastSession,
  ])

  function buildSelectedVocab(): Word[] | null {
    if (selectedWordSet === 'cantonese_basics') return cantoneseBasicsWords
    if (selectedWordSet === 'hsk') {
      if (selectedHSKLevels.size === 0) {
        alert('Please select at least one HSK level.')
        return null
      }
      let v: Word[] = []
      if (selectedHSKLevels.has(1)) v = v.concat(hsk1Words)
      if (selectedHSKLevels.has(2)) v = v.concat(hsk2Words)
      return v
    }
    if (selectedWordSet === 'lang1511') {
      if (selectedUnits.size === 0) {
        alert('Please select at least one unit.')
        return null
      }
      return lang1511Units
        .filter((u) => selectedUnits.has(u.unit))
        .flatMap((u) => u.words)
    }
    if (selectedWordSet?.startsWith('custom:')) {
      const id = selectedWordSet.slice(7)
      const words = customWordSets.find((s) => s.id === id)?.words
      if (!words || words.length === 0) {
        alert('Word set not found.')
        return null
      }
      return words
    }
    alert('Please select a word set.')
    return null
  }

  function buildSessionDesc(v: Word[]): string {
    if (selectedWordSet === 'cantonese_basics')
      return `Cantonese Basics · ${v.length} words`
    if (selectedWordSet === 'hsk')
      return `HSK ${[...selectedHSKLevels].sort().join(' + ')} · ${v.length} words`
    if (selectedWordSet?.startsWith('custom:')) {
      const id = selectedWordSet.slice(7)
      const name = customWordSets.find((s) => s.id === id)?.name ?? 'Custom'
      return `${name} · ${v.length} words`
    }
    return `LANG 1511 · Units ${[...selectedUnits].sort((a, b) => a - b).join(', ')}`
  }

  function buildSessionBase(v: Word[]): LastSession {
    const isCustom = selectedWordSet?.startsWith('custom:')
    return {
      wordSetKey: isCustom ? 'custom' : (selectedWordSet ?? ''),
      hskLevels: new Set(selectedHSKLevels),
      units: new Set(selectedUnits),
      customSetId: isCustom ? selectedWordSet!.slice(7) : undefined,
      dialect: activeDialect,
      settings: { ...settings },
      vocab: v,
      desc: buildSessionDesc(v),
    }
  }

  function handleStartSoundOnly() {
    const v = buildSelectedVocab()
    if (!v) return
    const ss: SoundSettings = {
      answerFormat: soundSettings.answerFormat,
      answerStyle: settings.answerStyle,
      sessionSize: settings.sessionSize,
      stageCount: settings.defaultMode >= 2 ? 2 : 1,
    }
    const session: LastSession = { ...buildSessionBase(v), soundSettings: ss }
    onStartSoundOnly(v, ss, session)
  }

  function handleStartToneQuiz() {
    const v = buildSelectedVocab()
    if (!v) return
    const session: LastSession = {
      ...buildSessionBase(v),
      toneSessionSize: settings.sessionSize,
    }
    onStartToneQuiz(v, settings.sessionSize, session)
  }

  function handleGoNext() {
    if (selectedWordSet === 'last') {
      if (!lastSession) return
      if (lastSession.soundSettings) {
        onStartSoundOnly(
          lastSession.vocab,
          lastSession.soundSettings,
          lastSession,
        )
        return
      }
      if (lastSession.toneSessionSize !== undefined) {
        onStartToneQuiz(
          lastSession.vocab,
          lastSession.toneSessionSize,
          lastSession,
        )
        return
      }
      onContinue(
        lastSession.vocab,
        lastSession.settings.defaultMode,
        lastSession.settings,
        lastSession,
      )
      return
    }

    const vocab = buildSelectedVocab()
    if (!vocab) return

    const session = buildSessionBase(vocab)

    onContinue(vocab, settings.defaultMode, settings, session)
  }

  function handleStart() {
    if (soundOnlyOpen) handleStartSoundOnly()
    else if (toneQuizOpen) handleStartToneQuiz()
    else handleGoNext()
  }

  return (
    <div className="fc-app fc-app--wordset">
      <div className="fc-ws-topbar">
        <div className="fc-ws-brand-left">
          <div className="fc-ws-brand-title">学中文</div>
          <Link
            to="/leaderboard"
            className="fc-leaderboard-btn"
            aria-label="Leaderboard"
          >
            <Trophy size={16} strokeWidth={1.8} />
            <span>Leaderboard</span>
          </Link>
        </div>
        {onSignIn ? (
          <button className="fc-profile-nav-btn" onClick={onSignIn}>
            Sign in
          </button>
        ) : (
          <Link
            to="/profile"
            className="fc-profile-icon-btn"
            aria-label="Profile"
          >
            <User size={18} strokeWidth={1.8} />
          </Link>
        )}
      </div>
      <main className="fc-wordset-container">
        <div className="fc-ws-outer-row">
          <LeftSidebar
            dialectTab={dialectTab}
            onDialectTabChange={setDialectTab}
            selectedWordSet={selectedWordSet}
            onSelectWordSet={setSelectedWordSet}
            settings={settings}
            onSettingsChange={setSettings}
            toneQuizOpen={toneQuizOpen}
            onToneQuizOpenChange={setToneQuizOpen}
            authPending={authPending}
            isSignedIn={isSignedIn}
            progressPending={progressPending}
            customWordSetsPending={customWordSetsPending}
            customWordSets={customWordSets}
            lastSession={lastSession}
            onShowCustomModal={() => setShowCustomModal(true)}
          />

          <CenterSettings
            selectedWordSet={selectedWordSet}
            selectedHSKLevels={selectedHSKLevels}
            onSelectedHSKLevelsChange={setSelectedHSKLevels}
            selectedUnits={selectedUnits}
            onSelectedUnitsChange={setSelectedUnits}
            settings={settings}
            onSettingsChange={setSettings}
            soundOnlyOpen={soundOnlyOpen}
            onSoundOnlyOpenChange={setSoundOnlyOpen}
            soundSettings={soundSettings}
            onSoundSettingsChange={setSoundSettings}
            toneQuizOpen={toneQuizOpen}
            onToneQuizOpenChange={setToneQuizOpen}
            activeDialect={activeDialect}
            lastSession={lastSession}
            onStart={handleStart}
          />

          {/* RightSidebar removed for demo - backend logic preserved in parent */}
        </div>
      </main>

      <CustomWordSetModal
        show={showCustomModal}
        onClose={() => setShowCustomModal(false)}
        customWordSets={customWordSets}
        dialectTab={dialectTab}
        onSelectWordSet={(id) => setSelectedWordSet(`custom:${id}`)}
        onStudyOnce={(words) => {
          setTempStudyWords(words)
          setSelectedWordSet('temp')
        }}
      />
    </div>
  )
}
