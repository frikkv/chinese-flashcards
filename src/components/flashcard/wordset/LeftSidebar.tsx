import type { Dialect } from '#/lib/dialect'
import { cantoneseBasicsWords } from '#/data/cantonese-vocabulary'
import { Skeleton } from '#/components/Skeleton'
import type { Settings, LastSession, CustomWordSet } from '#/components/flashcard/types'

interface LeftSidebarProps {
  dialectTab: Dialect
  onDialectTabChange: (d: Dialect) => void
  selectedWordSet: string | null
  onSelectWordSet: (ws: string | null) => void
  settings: Settings
  onSettingsChange: (s: Settings) => void
  toneQuizOpen: boolean
  onToneQuizOpenChange: (open: boolean) => void
  authPending: boolean
  isSignedIn: boolean
  progressPending: boolean
  customWordSetsPending: boolean
  customWordSets: CustomWordSet[]
  lastSession: LastSession | null
  onShowCustomModal: () => void
}

export function LeftSidebar({
  dialectTab,
  onDialectTabChange,
  selectedWordSet,
  onSelectWordSet,
  settings,
  onSettingsChange,
  toneQuizOpen,
  onToneQuizOpenChange,
  authPending,
  isSignedIn,
  progressPending,
  customWordSetsPending,
  customWordSets,
  lastSession,
  onShowCustomModal,
}: LeftSidebarProps) {
  return (
    <div className="fc-ws-left">
      <div className="fc-dialect-tabs">
        <button
          className={`fc-dialect-tab${dialectTab === 'mandarin' ? ' active' : ''}`}
          onClick={() => {
            onDialectTabChange('mandarin')
            localStorage.setItem('preferred-dialect', 'mandarin')
            onSelectWordSet(null)
          }}
        >
          <span className="fc-dialect-tab-flag">🇨🇳</span> Mandarin
        </button>
        <button
          className={`fc-dialect-tab${dialectTab === 'cantonese' ? ' active' : ''}`}
          onClick={() => {
            onDialectTabChange('cantonese')
            localStorage.setItem('preferred-dialect', 'cantonese')
            onSelectWordSet(null)
            if (settings.defaultMode === 3)
              onSettingsChange({ ...settings, defaultMode: 1 })
            onToneQuizOpenChange(false)
          }}
        >
          <span className="fc-dialect-tab-flag">🇭🇰</span> Cantonese
        </button>
      </div>
      <div className="fc-ws-list">
        {authPending || (isSignedIn && customWordSetsPending) ? (
          <div
            className="fc-ws-btn"
            aria-hidden="true"
            style={{ pointerEvents: 'none', cursor: 'default' }}
          >
            <Skeleton width={36} height={32} style={{ borderRadius: 6 }} />
            <Skeleton height={14} width="44%" />
            <Skeleton height={11} width="28%" />
            <Skeleton height={11} width="66%" />
          </div>
        ) : isSignedIn ? (
          <button
            className={`fc-ws-btn${selectedWordSet?.startsWith('custom:') ? ' selected' : ''}`}
            onClick={onShowCustomModal}
          >
            <span className="fc-ws-char">自定</span>
            <span className="fc-ws-label">My Word Sets</span>
            <span className="fc-ws-count">
              {customWordSets.filter(
                (s) => (s.dialect ?? 'mandarin') === dialectTab,
              ).length === 0
                ? 'No sets yet'
                : `${customWordSets.filter((s) => (s.dialect ?? 'mandarin') === dialectTab).length} set${customWordSets.filter((s) => (s.dialect ?? 'mandarin') === dialectTab).length !== 1 ? 's' : ''}`}
            </span>
            <span className="fc-ws-desc">
              {selectedWordSet?.startsWith('custom:')
                ? (customWordSets.find(
                    (s) => s.id === selectedWordSet.slice(7),
                  )?.name ?? 'Custom set selected')
                : 'Upload a document or paste text'}
            </span>
          </button>
        ) : null}

        {authPending || (isSignedIn && progressPending) ? (
          <div
            className="fc-ws-btn"
            aria-hidden="true"
            style={{ pointerEvents: 'none', cursor: 'default' }}
          >
            <Skeleton width={36} height={32} style={{ borderRadius: 6 }} />
            <Skeleton height={14} width="48%" />
            <Skeleton height={11} width="68%" />
            <Skeleton height={11} width="82%" />
          </div>
        ) : lastSession && lastSession.dialect === dialectTab ? (
          <button
            className={`fc-ws-btn${selectedWordSet === 'last' ? ' selected' : ''}`}
            onClick={() =>
              onSelectWordSet(
                selectedWordSet === 'last' ? null : 'last',
              )
            }
          >
            <span className="fc-ws-char">上次</span>
            <span className="fc-ws-label">Last Session</span>
            <span className="fc-ws-count">{lastSession.desc}</span>
            <span className="fc-ws-desc">
              Continue where you left off
            </span>
          </button>
        ) : null}

        {dialectTab === 'mandarin' && (
          <>
            <button
              className={`fc-ws-btn${selectedWordSet === 'lang1511' ? ' selected' : ''}`}
              onClick={() =>
                onSelectWordSet(
                  selectedWordSet === 'lang1511' ? null : 'lang1511',
                )
              }
            >
              <span className="fc-ws-char">课程</span>
              <span className="fc-ws-label">LANG 1511</span>
              <span className="fc-ws-count">10 units · 123 words</span>
              <span className="fc-ws-desc">
                University course vocabulary
              </span>
            </button>
            <button
              className={`fc-ws-btn${selectedWordSet === 'hsk' ? ' selected' : ''}`}
              onClick={() =>
                onSelectWordSet(
                  selectedWordSet === 'hsk' ? null : 'hsk',
                )
              }
            >
              <span className="fc-ws-char">汉语</span>
              <span className="fc-ws-label">HSK</span>
              <span className="fc-ws-count">2 levels · 300 words</span>
              <span className="fc-ws-desc">
                Official HSK vocabulary
              </span>
            </button>
          </>
        )}
        {dialectTab === 'cantonese' && (
          <button
            className={`fc-ws-btn${selectedWordSet === 'cantonese_basics' ? ' selected' : ''}`}
            onClick={() =>
              onSelectWordSet(
                selectedWordSet === 'cantonese_basics'
                  ? null
                  : 'cantonese_basics',
              )
            }
          >
            <span className="fc-ws-char">粵語</span>
            <span className="fc-ws-label">Cantonese Basics</span>
            <span className="fc-ws-count">
              {cantoneseBasicsWords.length} words
            </span>
            <span className="fc-ws-desc">
              Common Cantonese words &amp; phrases
            </span>
          </button>
        )}
      </div>
      {/* end fc-ws-list */}
    </div>
  )
}
