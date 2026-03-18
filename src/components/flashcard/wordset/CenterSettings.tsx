import { useEffect, useRef } from 'react'
import type { Dialect } from '#/lib/dialect'
import { lang1511Units } from '#/data/vocabulary'
import type { Settings, SoundSettings, SoundAnswerFormat, LastSession } from '#/components/flashcard/types'

interface CenterSettingsProps {
  selectedWordSet: string | null
  selectedHSKLevels: Set<number>
  onSelectedHSKLevelsChange: (levels: Set<number>) => void
  selectedUnits: Set<number>
  onSelectedUnitsChange: (units: Set<number>) => void
  settings: Settings
  onSettingsChange: (s: Settings) => void
  soundOnlyOpen: boolean
  onSoundOnlyOpenChange: (open: boolean) => void
  soundSettings: SoundSettings
  onSoundSettingsChange: (ss: SoundSettings) => void
  toneQuizOpen: boolean
  onToneQuizOpenChange: (open: boolean) => void
  activeDialect: Dialect
  lastSession: LastSession | null
  onStart: () => void
}

export function CenterSettings({
  selectedWordSet,
  selectedHSKLevels,
  onSelectedHSKLevelsChange,
  selectedUnits,
  onSelectedUnitsChange,
  settings,
  onSettingsChange,
  soundOnlyOpen,
  onSoundOnlyOpenChange,
  soundSettings,
  onSoundSettingsChange,
  toneQuizOpen,
  onToneQuizOpenChange,
  activeDialect,
  lastSession,
  onStart,
}: CenterSettingsProps) {
  // Drag-select state
  const mouseIsDownRef = useRef(false)
  const isDraggingRef = useRef(false)
  const dragAnchorIdxRef = useRef<number | null>(null)
  const dragActionRef = useRef<'select' | 'deselect'>('select')
  const dragTypeRef = useRef<'unit' | 'hsk' | null>(null)
  const preDragUnitsRef = useRef<Set<number>>(new Set())
  const preDragHSKRef = useRef<Set<number>>(new Set())

  useEffect(() => {
    const handleMouseUp = () => {
      if (mouseIsDownRef.current && !isDraggingRef.current) {
        // Pure click — toggle the single anchor item
        if (
          dragTypeRef.current === 'unit' &&
          dragAnchorIdxRef.current !== null
        ) {
          const anchorUnit = lang1511Units[dragAnchorIdxRef.current].unit
          onSelectedUnitsChange((() => {
            const next = new Set(preDragUnitsRef.current)
            if (dragActionRef.current === 'select') next.add(anchorUnit)
            else next.delete(anchorUnit)
            return next
          })())
        } else if (
          dragTypeRef.current === 'hsk' &&
          dragAnchorIdxRef.current !== null
        ) {
          const anchorLevel = [1, 2][dragAnchorIdxRef.current]
          onSelectedHSKLevelsChange((() => {
            const next = new Set(preDragHSKRef.current)
            if (dragActionRef.current === 'select') next.add(anchorLevel)
            else next.delete(anchorLevel)
            return next
          })())
        }
      }
      mouseIsDownRef.current = false
      isDraggingRef.current = false
      dragAnchorIdxRef.current = null
      dragTypeRef.current = null
    }
    document.addEventListener('mouseup', handleMouseUp)
    return () => document.removeEventListener('mouseup', handleMouseUp)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const startLabel =
    soundOnlyOpen ||
    (selectedWordSet === 'last' && lastSession?.soundSettings)
      ? 'Start Sound Only →'
      : toneQuizOpen ||
          (selectedWordSet === 'last' &&
            lastSession?.toneSessionSize !== undefined)
        ? 'Start Tone Quiz →'
        : selectedWordSet === 'last'
          ? 'Start →'
          : 'Start Studying →'

  return (
    <div className="fc-ws-right">
      <div className="fc-ws-right-scroll">
        {selectedWordSet ? (
          <>
            {/* Session Settings */}
            {selectedWordSet !== 'last' &&
              !selectedWordSet.startsWith('custom') &&
              selectedWordSet !== null && (
                <div className="fc-settings-wrap">
                  {/* HSK level picker */}
                  {selectedWordSet === 'hsk' && (
                    <div className="fc-settings-section">
                      <div className="fc-settings-label">HSK Level</div>
                      <div className="fc-picker-grid">
                        {[1, 2].map((level, idx) => (
                          <button
                            key={level}
                            className={`fc-unit-btn${selectedHSKLevels.has(level) ? ' selected' : ''}`}
                            onMouseDown={() => {
                              mouseIsDownRef.current = true
                              isDraggingRef.current = false
                              dragAnchorIdxRef.current = idx
                              dragTypeRef.current = 'hsk'
                              dragActionRef.current =
                                selectedHSKLevels.has(level)
                                  ? 'deselect'
                                  : 'select'
                              preDragHSKRef.current = new Set(
                                selectedHSKLevels,
                              )
                            }}
                            onMouseEnter={() => {
                              if (
                                !mouseIsDownRef.current ||
                                dragTypeRef.current !== 'hsk' ||
                                dragAnchorIdxRef.current === null
                              )
                                return
                              isDraggingRef.current = true
                              const hskLevels = [1, 2]
                              const [lo, hi] = [
                                Math.min(dragAnchorIdxRef.current, idx),
                                Math.max(dragAnchorIdxRef.current, idx),
                              ]
                              const next = new Set(
                                preDragHSKRef.current,
                              )
                              hskLevels
                                .slice(lo, hi + 1)
                                .forEach((l) => {
                                  if (
                                    dragActionRef.current === 'select'
                                  )
                                    next.add(l)
                                  else next.delete(l)
                                })
                              onSelectedHSKLevelsChange(next)
                            }}
                          >
                            HSK {level}{' '}
                            <span
                              style={{
                                fontSize: '0.75rem',
                                opacity: 0.6,
                              }}
                            >
                              (150)
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* LANG 1511 unit picker */}
                  {selectedWordSet === 'lang1511' && (
                    <div className="fc-settings-section">
                      <div className="fc-settings-label">Units</div>
                      <div
                        style={{
                          display: 'flex',
                          gap: 8,
                          marginBottom: 10,
                        }}
                      >
                        <button
                          className="fc-util-btn"
                          onClick={() =>
                            onSelectedUnitsChange(
                              new Set(lang1511Units.map((u) => u.unit)),
                            )
                          }
                        >
                          Select all
                        </button>
                        <button
                          className="fc-util-btn"
                          onClick={() => onSelectedUnitsChange(new Set())}
                        >
                          Clear
                        </button>
                      </div>
                      <div className="fc-picker-grid fc-picker-grid--units">
                        {lang1511Units.map((u, idx) => (
                          <button
                            key={u.unit}
                            className={`fc-unit-btn${selectedUnits.has(u.unit) ? ' selected' : ''}`}
                            onMouseDown={() => {
                              mouseIsDownRef.current = true
                              isDraggingRef.current = false
                              dragAnchorIdxRef.current = idx
                              dragTypeRef.current = 'unit'
                              dragActionRef.current = selectedUnits.has(
                                u.unit,
                              )
                                ? 'deselect'
                                : 'select'
                              preDragUnitsRef.current = new Set(
                                selectedUnits,
                              )
                            }}
                            onMouseEnter={() => {
                              if (
                                !mouseIsDownRef.current ||
                                dragTypeRef.current !== 'unit' ||
                                dragAnchorIdxRef.current === null
                              )
                                return
                              isDraggingRef.current = true
                              const [lo, hi] = [
                                Math.min(dragAnchorIdxRef.current, idx),
                                Math.max(dragAnchorIdxRef.current, idx),
                              ]
                              const next = new Set(
                                preDragUnitsRef.current,
                              )
                              lang1511Units
                                .slice(lo, hi + 1)
                                .forEach((unit) => {
                                  if (
                                    dragActionRef.current === 'select'
                                  )
                                    next.add(unit.unit)
                                  else next.delete(unit.unit)
                                })
                              onSelectedUnitsChange(next)
                            }}
                          >
                            Unit {u.unit}{' '}
                            <span
                              style={{
                                fontSize: '0.75rem',
                                opacity: 0.6,
                              }}
                            >
                              ({u.words.length})
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {(selectedWordSet === 'hsk' ||
                    selectedWordSet === 'lang1511') && (
                    <div className="fc-settings-divider" />
                  )}
                  <div
                    className="fc-settings-section"
                    style={
                      toneQuizOpen
                        ? { opacity: 0.35, pointerEvents: 'none' }
                        : undefined
                    }
                  >
                    <div className="fc-settings-label">Study Mode</div>
                    <div className="fc-settings-options">
                      {([1, 2, 3] as const)
                        .filter(
                          (m) =>
                            !(activeDialect === 'cantonese' && m === 3),
                        )
                        .map((m) => (
                          <button
                            key={m}
                            className={`fc-setting-opt${settings.defaultMode === m ? ' selected' : ''}`}
                            disabled={soundOnlyOpen && m === 3}
                            style={
                              soundOnlyOpen && m === 3
                                ? { opacity: 0.35 }
                                : undefined
                            }
                            onClick={() =>
                              onSettingsChange({
                                ...settings,
                                defaultMode: m,
                              })
                            }
                          >
                            {m} Card{m > 1 ? 's' : ''}
                          </button>
                        ))}
                    </div>
                    <p className="fc-settings-mode-hint">
                      {settings.defaultMode === 1 &&
                        activeDialect === 'cantonese' &&
                        'See character + jyutping, guess the English meaning.'}
                      {settings.defaultMode === 1 &&
                        activeDialect !== 'cantonese' &&
                        'See character + pinyin, guess the English meaning.'}
                      {settings.defaultMode === 2 &&
                        activeDialect === 'cantonese' &&
                        'Char + jyutping → English, then English → recall character.'}
                      {settings.defaultMode === 2 &&
                        activeDialect !== 'cantonese' &&
                        'Guess pinyin from character, then guess English.'}
                      {settings.defaultMode === 3 &&
                        'Full cycle: character → pinyin → English → recall character.'}
                    </p>
                  </div>
                  <div className="fc-settings-section">
                    <div className="fc-settings-label">
                      Answer Style
                    </div>
                    <div className="fc-settings-options">
                      {(
                        [
                          ['multiple-choice', 'Multiple Choice'],
                          ['type', 'Type Answer'],
                        ] as const
                      ).map(([val, label]) => (
                        <button
                          key={val}
                          className={`fc-setting-opt${settings.answerStyle === val ? ' selected' : ''}`}
                          onClick={() =>
                            onSettingsChange({
                              ...settings,
                              answerStyle: val,
                            })
                          }
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="fc-settings-section">
                    <div className="fc-settings-label">
                      Cards per Session
                    </div>
                    <div className="fc-settings-options">
                      {(
                        [
                          [10, '10'],
                          [20, '20'],
                          [30, 'All'],
                        ] as const
                      ).map(([val, label]) => (
                        <button
                          key={val}
                          className={`fc-setting-opt${settings.sessionSize === val ? ' selected' : ''}`}
                          onClick={() =>
                            onSettingsChange({
                              ...settings,
                              sessionSize: val,
                            })
                          }
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div
                    className="fc-settings-section"
                    style={
                      toneQuizOpen
                        ? { opacity: 0.35, pointerEvents: 'none' }
                        : undefined
                    }
                  >
                    <div className="fc-settings-label">
                      Sound Only Mode
                    </div>
                    <div className="fc-settings-options">
                      <button
                        className={`fc-setting-opt${!soundOnlyOpen ? ' selected' : ''}`}
                        onClick={() => onSoundOnlyOpenChange(false)}
                      >
                        Off
                      </button>
                      {(
                        [
                          ['char', 'Characters'],
                          [
                            'pinyin',
                            activeDialect === 'cantonese'
                              ? 'Jyutping'
                              : 'Pinyin',
                          ],
                          [
                            'both',
                            activeDialect === 'cantonese'
                              ? 'Char + Jyutping'
                              : 'Char + Pinyin',
                          ],
                          ...(activeDialect === 'cantonese'
                            ? ([['english', 'English']] as const)
                            : []),
                        ] as [string, string][]
                      ).map(([val, label]) => (
                        <button
                          key={val}
                          className={`fc-setting-opt${soundOnlyOpen && soundSettings.answerFormat === val ? ' selected' : ''}`}
                          onClick={() => {
                            onSoundOnlyOpenChange(true)
                            onToneQuizOpenChange(false)
                            onSoundSettingsChange({
                              ...soundSettings,
                              answerFormat: val as SoundAnswerFormat,
                            })
                            if (settings.defaultMode === 3)
                              onSettingsChange({
                                ...settings,
                                defaultMode: 1,
                              })
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {activeDialect !== 'cantonese' && (
                    <div
                      className="fc-settings-section"
                      style={
                        soundOnlyOpen
                          ? { opacity: 0.35, pointerEvents: 'none' }
                          : undefined
                      }
                    >
                      <div className="fc-settings-label">
                        Tone Quiz Mode
                      </div>
                      <div className="fc-settings-options">
                        <button
                          className={`fc-setting-opt${!toneQuizOpen ? ' selected' : ''}`}
                          onClick={() => onToneQuizOpenChange(false)}
                        >
                          Off
                        </button>
                        <button
                          className={`fc-setting-opt${toneQuizOpen ? ' selected' : ''}`}
                          onClick={() => {
                            onToneQuizOpenChange(true)
                            onSoundOnlyOpenChange(false)
                          }}
                        >
                          On
                        </button>
                      </div>
                      {toneQuizOpen && (
                        <p className="fc-settings-mode-hint">
                          See pinyin without tones + English, pick the
                          correct tones.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
          </>
        ) : (
          <div className="fc-ws-right-empty">
            ← Select a word set to get started
          </div>
        )}

        <button
          className="fc-start-btn"
          onClick={onStart}
        >
          {startLabel}
        </button>
      </div>
      {/* end fc-ws-right-scroll */}
    </div>
  )
}
