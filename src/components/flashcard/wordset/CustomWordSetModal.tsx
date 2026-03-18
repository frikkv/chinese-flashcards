import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Undo2, X } from 'lucide-react'
import type { Word } from '#/data/vocabulary'
import type { Dialect } from '#/lib/dialect'
import { useTRPC } from '#/integrations/trpc/react'
import type { CustomWordSet } from '#/components/flashcard/types'

interface CustomWordSetModalProps {
  show: boolean
  onClose: () => void
  customWordSets: CustomWordSet[]
  dialectTab: Dialect
  onSelectWordSet: (setId: string) => void
  onStudyOnce: (words: Word[]) => void
}

export function CustomWordSetModal({
  show,
  onClose,
  customWordSets,
  dialectTab,
  onSelectWordSet,
  onStudyOnce,
}: CustomWordSetModalProps) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const generateMutation = useMutation(trpc.wordsets.generate.mutationOptions())
  const saveMutation = useMutation(trpc.wordsets.save.mutationOptions())
  const updateMutation = useMutation(trpc.wordsets.update.mutationOptions())
  const deleteMutation = useMutation(trpc.wordsets.delete.mutationOptions())
  const replaceWordsMutation = useMutation(
    trpc.wordsets.replaceWords.mutationOptions(),
  )
  const aiEditMutation = useMutation(trpc.wordsets.aiEdit.mutationOptions())
  const toggleFavoriteMutation = useMutation(
    trpc.wordsets.toggleFavorite.mutationOptions(),
  )

  const [createMode, setCreateMode] = useState<
    'upload' | 'paste' | 'describe' | 'edit' | null
  >(null)
  const [describePrompt, setDescribePrompt] = useState('')
  const [describeWordCount, setDescribeWordCount] = useState(0)
  const [editWords, setEditWords] = useState<Word[]>([])
  const [aiEditInstruction, setAiEditInstruction] = useState('')
  const [editWordsBeforeAi, setEditWordsBeforeAi] = useState<Word[] | null>(
    null,
  )
  const [addedChars, setAddedChars] = useState<Set<string>>(new Set())
  const [removedWords, setRemovedWords] = useState<Word[]>([])
  const [uploadFiles, setUploadFiles] = useState<File[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [uploadName, setUploadName] = useState('')
  const [previewWords, setPreviewWords] = useState<Word[] | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [selectedModalSetId, setSelectedModalSetId] = useState<string | null>(
    null,
  )
  const [editTargetSetId, setEditTargetSetId] = useState<string | null>(null)

  function handleClose() {
    onClose()
    setCreateMode(null)
    setPreviewWords(null)
    setUploadError(null)
    setEditTargetSetId(null)
    setUploadFiles([])
    setSelectedModalSetId(null)
  }

  async function handleGenerate() {
    setUploadError(null)
    setPreviewWords(null)
    try {
      let allWords: Word[] = []
      if (createMode === 'describe') {
        if (!describePrompt.trim()) return
        const result = (await generateMutation.mutateAsync({
          promptText: describePrompt.trim(),
          wordCount: describeWordCount || undefined,
          dialect: dialectTab,
        })) as { words: Word[] }
        allWords = result.words
      } else if (createMode === 'paste') {
        if (!pasteText.trim()) return
        const result = (await generateMutation.mutateAsync({ pasteText })) as {
          words: Word[]
        }
        allWords = result.words
      } else {
        if (uploadFiles.length === 0) return
        for (const file of uploadFiles) {
          const buffer = await file.arrayBuffer()
          const bytes = new Uint8Array(buffer)
          let binary = ''
          const chunkSize = 8192
          for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
          }
          const base64 = btoa(binary)
          const result = (await generateMutation.mutateAsync({
            fileName: file.name,
            fileBase64: base64,
          })) as { words: Word[] }
          const seen = new Set(allWords.map((w) => w.char))
          allWords = [
            ...allWords,
            ...result.words.filter((w) => !seen.has(w.char)),
          ]
        }
      }
      setPreviewWords(allWords)
      if (!uploadName) {
        if (createMode === 'describe') {
          setUploadName(describePrompt.trim().slice(0, 50))
        } else if (createMode === 'paste') {
          setUploadName('My Word Set')
        } else if (uploadFiles.length === 1) {
          setUploadName(uploadFiles[0]!.name.replace(/\.[^.]+$/, ''))
        } else {
          setUploadName('Combined Word Set')
        }
      }
    } catch (e: unknown) {
      setUploadError(e instanceof Error ? e.message : 'Generation failed.')
    }
  }

  async function handleSaveWordSet() {
    if (!previewWords || !uploadName.trim()) return
    setUploadError(null)
    try {
      if (editTargetSetId) {
        await updateMutation.mutateAsync({
          id: editTargetSetId,
          additionalWords: previewWords,
        })
        await queryClient.invalidateQueries({
          queryKey: trpc.wordsets.list.queryKey(),
        })
        setCreateMode(null)
        setUploadFiles([])
        setPasteText('')
        setDescribePrompt('')
        setDescribeWordCount(0)
        setUploadName('')
        setPreviewWords(null)
        setEditTargetSetId(null)
      } else {
        const { id } = (await saveMutation.mutateAsync({
          name: uploadName.trim(),
          words: previewWords,
          sourceFileName:
            createMode === 'upload' ? uploadFiles[0]?.name : undefined,
          dialect: dialectTab,
        })) as { id: string }
        await queryClient.invalidateQueries({
          queryKey: trpc.wordsets.list.queryKey(),
        })
        onSelectWordSet(id)
        handleClose()
      }
    } catch (e: unknown) {
      setUploadError(e instanceof Error ? e.message : 'Save failed.')
    }
  }

  async function handleDeleteCustomSet(id: string) {
    if (!confirm('Delete this word set?')) return
    await deleteMutation.mutateAsync({ id })
    await queryClient.invalidateQueries({
      queryKey: trpc.wordsets.list.queryKey(),
    })
    if (selectedModalSetId === id) setSelectedModalSetId(null)
  }

  async function handleToggleFavorite(id: string) {
    await toggleFavoriteMutation.mutateAsync({ id })
    await queryClient.invalidateQueries({
      queryKey: trpc.wordsets.list.queryKey(),
    })
  }

  function handleEditSet(id: string) {
    const set = customWordSets.find((s) => s.id === id)
    if (!set) return
    setEditTargetSetId(id)
    setUploadName(set.name)
    setEditWords([...set.words])
    setCreateMode('edit')
    setUploadError(null)
    setAiEditInstruction('')
    setEditWordsBeforeAi(null)
    setAddedChars(new Set())
    setRemovedWords([])
  }

  async function handleAiEdit() {
    if (!aiEditInstruction.trim() || editWords.length === 0) return
    setUploadError(null)
    try {
      const before = [...editWords]
      const result = (await aiEditMutation.mutateAsync({
        words: editWords,
        instruction: aiEditInstruction.trim(),
        dialect: dialectTab,
      })) as { words: Word[] }
      const newWords = result.words
      const beforeChars = new Set(before.map((w) => w.char))
      const afterChars = new Set(newWords.map((w) => w.char))
      setAddedChars(new Set([...afterChars].filter((c) => !beforeChars.has(c))))
      setRemovedWords(before.filter((w) => !afterChars.has(w.char)))
      setEditWordsBeforeAi(before)
      setEditWords(newWords)
      setAiEditInstruction('')
    } catch (e: unknown) {
      setUploadError(e instanceof Error ? e.message : 'AI edit failed.')
    }
  }

  function handleUndoAiEdit() {
    if (!editWordsBeforeAi) return
    setEditWords(editWordsBeforeAi)
    setEditWordsBeforeAi(null)
    setAddedChars(new Set())
    setRemovedWords([])
  }

  async function handleSaveEdit() {
    if (!editTargetSetId || editWords.length === 0) return
    setUploadError(null)
    try {
      await replaceWordsMutation.mutateAsync({
        id: editTargetSetId,
        words: editWords,
      })
      await queryClient.invalidateQueries({
        queryKey: trpc.wordsets.list.queryKey(),
      })
      setCreateMode(null)
      setEditWords([])
      setEditTargetSetId(null)
      setAiEditInstruction('')
      setUploadError(null)
    } catch (e: unknown) {
      setUploadError(e instanceof Error ? e.message : 'Save failed.')
    }
  }

  if (!show) return null

  return (
    <div
      className="fc-modal-overlay"
      onClick={handleClose}
    >
      <div className="fc-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="fc-modal-header">
          {createMode !== null && (
            <button
              className="fc-modal-back"
              onClick={() => {
                setCreateMode(null)
                setPreviewWords(null)
                setUploadError(null)
                setUploadFiles([])
                setPasteText('')
                setUploadName('')
                setEditTargetSetId(null)
                setSelectedModalSetId(null)
                setEditWords([])
                setAiEditInstruction('')
              }}
            >
              ← Back
            </button>
          )}
          <span className="fc-modal-title">
            {createMode === 'edit'
              ? 'Edit Word Set'
              : createMode !== null
                ? 'Create Word Set'
                : 'My Word Sets'}
          </span>
          <button
            className="fc-modal-close"
            onClick={handleClose}
          >
            ✕
          </button>
        </div>

        {/* LIST VIEW — scrollable cards, shared action bar, footer */}
        {createMode === null && (
          <>
            <div className="fc-modal-scroll-body">
              {customWordSets.filter(
                (s) => (s.dialect ?? 'mandarin') === dialectTab,
              ).length === 0 ? (
                <p className="fc-modal-empty">
                  No word sets yet. Create one below.
                </p>
              ) : (
                <div className="fc-modal-set-list">
                  {customWordSets
                    .filter((s) => (s.dialect ?? 'mandarin') === dialectTab)
                    .map((cs) => (
                      <button
                        key={cs.id}
                        className={`fc-modal-set-row${selectedModalSetId === cs.id ? ' selected' : ''}`}
                        onClick={() =>
                          setSelectedModalSetId(
                            selectedModalSetId === cs.id ? null : cs.id,
                          )
                        }
                      >
                        <span className="fc-modal-set-name">
                          {cs.isFavorited && (
                            <span className="fc-modal-set-star">★ </span>
                          )}
                          {cs.name}
                        </span>
                        <span className="fc-modal-set-meta">
                          {cs.wordCount} words
                        </span>
                      </button>
                    ))}
                </div>
              )}
            </div>

            {/* Bottom toolbar — 5 buttons always visible, right-aligned */}
            <div className="fc-modal-toolbar">
              <button
                className="fc-modal-action-study"
                disabled={!selectedModalSetId}
                onClick={() => {
                  if (!selectedModalSetId) return
                  onSelectWordSet(selectedModalSetId)
                  handleClose()
                }}
              >
                Study
              </button>
              <button
                className="fc-modal-action-edit"
                disabled={!selectedModalSetId}
                onClick={() => {
                  if (selectedModalSetId) handleEditSet(selectedModalSetId)
                }}
              >
                Edit
              </button>
              <button
                className={`fc-modal-action-fav${customWordSets.find((cs) => cs.id === selectedModalSetId)?.isFavorited ? ' active' : ''}`}
                disabled={!selectedModalSetId}
                onClick={() => {
                  if (selectedModalSetId)
                    void handleToggleFavorite(selectedModalSetId)
                }}
              >
                {customWordSets.find((cs) => cs.id === selectedModalSetId)
                  ?.isFavorited
                  ? 'Unfavorite'
                  : 'Favorite'}
              </button>
              <button
                className="fc-modal-action-delete"
                disabled={!selectedModalSetId}
                onClick={() => {
                  if (selectedModalSetId)
                    void handleDeleteCustomSet(selectedModalSetId)
                }}
              >
                Delete
              </button>
              <button
                className="fc-modal-action-new"
                onClick={() => {
                  setCreateMode('upload')
                  setSelectedModalSetId(null)
                }}
              >
                New+
              </button>
            </div>
          </>
        )}

        {/* EDIT VIEW */}
        {createMode === 'edit' && (
          <div className="fc-modal-body">
            <div className="fc-edit-word-list">
              {editWords.map((w, i) => (
                <div
                  key={i}
                  className={`fc-edit-word-row${addedChars.has(w.char) ? ' fc-edit-word-added' : ''}`}
                >
                  <span className="fc-upload-preview-char">{w.char}</span>
                  <span className="fc-upload-preview-pinyin">
                    {dialectTab === 'cantonese' ? w.jyutping : w.pinyin}
                  </span>
                  <span className="fc-upload-preview-english">
                    {w.english}
                  </span>
                  {addedChars.has(w.char) ? (
                    <button
                      className="fc-edit-word-undo"
                      title="Undo addition"
                      onClick={() => {
                        setEditWords((prev) =>
                          prev.filter((_, j) => j !== i),
                        )
                        setAddedChars((prev) => {
                          const next = new Set(prev)
                          next.delete(w.char)
                          return next
                        })
                      }}
                    >
                      <Undo2 size={14} />
                    </button>
                  ) : (
                    <button
                      className="fc-edit-word-remove"
                      onClick={() =>
                        setEditWords((prev) =>
                          prev.filter((_, j) => j !== i),
                        )
                      }
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
              {removedWords.map((w, i) => (
                <div
                  key={`removed-${i}`}
                  className="fc-edit-word-row fc-edit-word-removed"
                >
                  <span className="fc-upload-preview-char">{w.char}</span>
                  <span className="fc-upload-preview-pinyin">
                    {dialectTab === 'cantonese' ? w.jyutping : w.pinyin}
                  </span>
                  <span className="fc-upload-preview-english">
                    {w.english}
                  </span>
                  <button
                    className="fc-edit-word-undo"
                    title="Undo removal"
                    onClick={() => {
                      setEditWords((prev) => [...prev, w])
                      setRemovedWords((prev) =>
                        prev.filter((_, j) => j !== i),
                      )
                    }}
                  >
                    <Undo2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <div className="fc-edit-word-count-row">
              <span className="fc-edit-word-count">
                {editWords.length} word{editWords.length !== 1 ? 's' : ''}
                {addedChars.size > 0 && (
                  <span className="fc-edit-diff-summary">
                    {' '}
                    (+{addedChars.size} added, -{removedWords.length}{' '}
                    removed)
                  </span>
                )}
              </span>
              {editWordsBeforeAi && (
                <button
                  className="fc-edit-undo-btn"
                  onClick={handleUndoAiEdit}
                >
                  Undo
                </button>
              )}
            </div>

            <div className="fc-ai-edit-section">
              <label className="fc-upload-label">
                Describe changes
                <textarea
                  className="fc-upload-paste-input"
                  placeholder="e.g. remove all food-related words, add more time expressions, replace formal words with casual ones..."
                  value={aiEditInstruction}
                  onChange={(e) => setAiEditInstruction(e.target.value)}
                  rows={2}
                  maxLength={500}
                />
              </label>
              <button
                className="fc-upload-generate-btn"
                disabled={
                  aiEditMutation.isPending || !aiEditInstruction.trim()
                }
                onClick={() => void handleAiEdit()}
              >
                {aiEditMutation.isPending
                  ? 'Applying changes…'
                  : 'Apply with AI →'}
              </button>
            </div>

            {uploadError && (
              <p className="fc-upload-error">{uploadError}</p>
            )}

            <button
              className="fc-upload-save-btn"
              disabled={
                editWords.length === 0 || replaceWordsMutation.isPending
              }
              onClick={() => void handleSaveEdit()}
            >
              {replaceWordsMutation.isPending
                ? 'Saving…'
                : 'Save Changes →'}
            </button>
          </div>
        )}

        {/* CREATE VIEW */}
        {createMode !== null && createMode !== 'edit' && (
          <div className="fc-modal-body">
            {/* Input mode toggle */}
            <div className="fc-modal-mode-tabs">
              <button
                className={`fc-modal-tab${createMode === 'upload' ? ' active' : ''}`}
                onClick={() => {
                  setCreateMode('upload')
                  setPreviewWords(null)
                  setUploadError(null)
                }}
              >
                Upload Document
              </button>
              <button
                className={`fc-modal-tab${createMode === 'paste' ? ' active' : ''}`}
                onClick={() => {
                  setCreateMode('paste')
                  setPreviewWords(null)
                  setUploadError(null)
                }}
              >
                Paste Text
              </button>
              <button
                className={`fc-modal-tab${createMode === 'describe' ? ' active' : ''}`}
                onClick={() => {
                  setCreateMode('describe')
                  setPreviewWords(null)
                  setUploadError(null)
                }}
              >
                AI Generate
              </button>
            </div>

            {/* Upload / drag-and-drop input */}
            {createMode === 'upload' && !previewWords && (
              <div
                className={`fc-upload-dropzone${isDragOver ? ' drag-over' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault()
                  setIsDragOver(true)
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setIsDragOver(false)
                  const files = Array.from(e.dataTransfer.files).filter(
                    (f) => /\.(txt|pdf|docx)$/i.test(f.name),
                  )
                  if (files.length > 0) {
                    setUploadFiles(files)
                    setPreviewWords(null)
                    setUploadError(null)
                    if (!uploadName && files.length === 1)
                      setUploadName(files[0]!.name.replace(/\.[^.]+$/, ''))
                  }
                }}
              >
                <label className="fc-upload-label">
                  <span className="fc-upload-drop-hint">
                    {isDragOver
                      ? 'Drop files here'
                      : 'Click to browse or drag & drop'}
                  </span>
                  <span className="fc-upload-file-types">
                    .txt · .pdf · .docx — multiple files OK
                  </span>
                  <input
                    type="file"
                    accept=".txt,.pdf,.docx"
                    multiple
                    className="fc-upload-file-input"
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? [])
                      setUploadFiles(files)
                      setPreviewWords(null)
                      setUploadError(null)
                      if (files.length === 1 && !uploadName)
                        setUploadName(
                          files[0]!.name.replace(/\.[^.]+$/, ''),
                        )
                    }}
                  />
                </label>
                {uploadFiles.length > 0 && (
                  <div className="fc-upload-file-list">
                    {uploadFiles.map((f, i) => (
                      <span key={i} className="fc-upload-file-chip">
                        {f.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Paste input */}
            {createMode === 'paste' && !previewWords && (
              <label className="fc-upload-label">
                Paste your text
                <textarea
                  className="fc-upload-paste-input"
                  placeholder="Paste Chinese text, a vocabulary list, lesson notes, etc."
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  rows={7}
                  maxLength={20000}
                />
                <span className="fc-upload-paste-count">
                  {pasteText.length} / 20,000 chars
                </span>
              </label>
            )}

            {/* Describe / AI generate input */}
            {createMode === 'describe' && !previewWords && (
              <div className="fc-describe-input">
                <label className="fc-upload-label">
                  Describe what you want to learn
                  <textarea
                    className="fc-upload-paste-input"
                    placeholder="e.g. food vocabulary, business Chinese, travel phrases for ordering at restaurants..."
                    value={describePrompt}
                    onChange={(e) => setDescribePrompt(e.target.value)}
                    rows={3}
                    maxLength={500}
                  />
                  <span className="fc-upload-paste-count">
                    {describePrompt.length} / 500 chars
                  </span>
                </label>
                <label className="fc-describe-count-label">
                  Number of words
                  <select
                    className="fc-describe-count-select"
                    value={describeWordCount}
                    onChange={(e) =>
                      setDescribeWordCount(Number(e.target.value))
                    }
                  >
                    <option value={0}>Auto</option>
                    {[10, 20, 30, 40, 50, 60].map((n) => (
                      <option key={n} value={n}>
                        {n} words
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            {/* Extract / generate button */}
            {!previewWords && (
              <button
                className="fc-upload-generate-btn"
                disabled={
                  generateMutation.isPending ||
                  (createMode === 'describe'
                    ? !describePrompt.trim()
                    : createMode === 'upload'
                      ? uploadFiles.length === 0
                      : !pasteText.trim())
                }
                onClick={() => void handleGenerate()}
              >
                {generateMutation.isPending
                  ? createMode === 'describe'
                    ? 'Generating vocabulary…'
                    : 'Extracting vocabulary…'
                  : createMode === 'describe'
                    ? 'Generate Vocabulary →'
                    : 'Extract Vocabulary →'}
              </button>
            )}

            {uploadError && (
              <p className="fc-upload-error">{uploadError}</p>
            )}

            {/* Preview + save */}
            {previewWords && (
              <>
                <div className="fc-upload-preview-header">
                  <span>{previewWords.length} words extracted</span>
                  <button
                    className="fc-modal-redo"
                    onClick={() => {
                      setPreviewWords(null)
                      setUploadError(null)
                    }}
                  >
                    Try again
                  </button>
                </div>
                <div className="fc-upload-preview-list">
                  {previewWords.map((w, i) => (
                    <div key={i} className="fc-upload-preview-row">
                      <span className="fc-upload-preview-char">
                        {w.char}
                      </span>
                      <span className="fc-upload-preview-pinyin">
                        {w.pinyin}
                      </span>
                      <span className="fc-upload-preview-english">
                        {w.english}
                      </span>
                    </div>
                  ))}
                </div>
                {!editTargetSetId && (
                  <label className="fc-upload-label">
                    Name this word set
                    <input
                      type="text"
                      className="fc-upload-name-input"
                      placeholder="e.g. Chapter 3 vocabulary"
                      value={uploadName}
                      onChange={(e) => setUploadName(e.target.value)}
                      maxLength={100}
                    />
                  </label>
                )}
                <div className="fc-upload-btn-row">
                  {!editTargetSetId && (
                    <button
                      className="fc-upload-study-once-btn"
                      onClick={() => {
                        onStudyOnce(previewWords)
                        handleClose()
                        setCreateMode(null)
                        setUploadFiles([])
                        setPasteText('')
                        setDescribePrompt('')
                        setDescribeWordCount(0)
                        setUploadName('')
                        setPreviewWords(null)
                      }}
                    >
                      Study Once →
                    </button>
                  )}
                  <button
                    className="fc-upload-save-btn"
                    disabled={
                      (!editTargetSetId && !uploadName.trim()) ||
                      saveMutation.isPending ||
                      updateMutation.isPending
                    }
                    onClick={() => void handleSaveWordSet()}
                  >
                    {saveMutation.isPending || updateMutation.isPending
                      ? 'Saving…'
                      : editTargetSetId
                        ? 'Add Words to Set →'
                        : 'Save & Start Studying →'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
