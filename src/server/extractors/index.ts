// Hard cap on characters sent to the AI. At ~4 chars/token this is ~1000 tokens
// of input — predictable cost regardless of document size.
const MAX_AI_INPUT_CHARS = 4000

/**
 * Extract raw text from a file buffer. Deterministic — no AI involved.
 */
async function extractRawText(
  fileName: string,
  buffer: Buffer,
): Promise<string> {
  const ext = fileName.split('.').pop()?.toLowerCase()

  if (ext === 'txt') {
    return buffer.toString('utf-8')
  }

  if (ext === 'pdf') {
    // Dynamic import so pdfjs-dist (which references browser-only DOMMatrix)
    // is only loaded on demand and not at module initialisation time.
    const { PDFParse } = await import('pdf-parse')
    const parser = new PDFParse({ data: buffer })
    const result = await parser.getText()
    return result.text
  }

  if (ext === 'docx') {
    const { default: mammoth } = await import('mammoth')
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  }

  throw new Error(
    `Unsupported file type: .${ext ?? '?'}. Please upload a .txt, .pdf, or .docx file.`,
  )
}

/** Count Chinese characters (CJK Unified Ideographs block) in a string. */
function countChinese(s: string): number {
  return (s.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) ?? []).length
}

/**
 * Clean and select the most useful subset of extracted text for vocabulary
 * generation. Returns a compact string capped at MAX_AI_INPUT_CHARS.
 *
 * Strategy:
 * 1. Normalize whitespace — collapse runs of spaces/tabs, trim each line.
 * 2. Drop junk lines — very short lines, page numbers, separator lines.
 * 3. Deduplicate — skip lines seen before (handles repeated headers/footers).
 * 4. Score paragraphs by Chinese character density (chars / total chars).
 * 5. Prefer high-density paragraphs; fill the budget top-to-bottom within
 *    the ranked order, then append lower-density paragraphs until full.
 */
export function preprocessText(raw: string): string {
  // ── Step 1: normalize whitespace ────────────────────────────────
  const lines = raw.split(/\r?\n/).map((l) => l.replace(/[ \t]+/g, ' ').trim())

  // ── Step 2 & 3: filter junk + deduplicate ───────────────────────
  const seen = new Set<string>()
  const cleanLines: string[] = []
  for (const line of lines) {
    if (line.length < 3) continue // too short (blank, single char, page #)
    if (/^[-=_*·•…]+$/.test(line)) continue // separator line
    if (/^\d+$/.test(line)) continue // pure page number
    if (seen.has(line)) continue // duplicate (header/footer)
    seen.add(line)
    cleanLines.push(line)
  }

  if (cleanLines.length === 0) return raw.slice(0, MAX_AI_INPUT_CHARS)

  // ── Step 4: group into paragraphs and score by Chinese density ──
  // A "paragraph" is a run of non-empty lines separated by blank lines,
  // or simply each non-empty line if there are no blank separators.
  const paragraphs: string[] = []
  let current: string[] = []
  for (const line of cleanLines) {
    if (line === '') {
      if (current.length > 0) {
        paragraphs.push(current.join(' '))
        current = []
      }
    } else {
      current.push(line)
    }
  }
  if (current.length > 0) paragraphs.push(current.join(' '))

  // If there's only one big blob (no blank-line separators), fall back to
  // individual lines as paragraphs so scoring still works.
  const units = paragraphs.length > 1 ? paragraphs : cleanLines

  type Scored = { text: string; density: number }
  const scored: Scored[] = units.map((t) => ({
    text: t,
    density: t.length > 0 ? countChinese(t) / t.length : 0,
  }))

  // ── Step 5: fill budget with highest-density paragraphs first ───
  scored.sort((a, b) => b.density - a.density)

  const selected: string[] = []
  let budget = MAX_AI_INPUT_CHARS

  for (const { text } of scored) {
    if (budget <= 0) break
    const chunk = text.slice(0, budget)
    selected.push(chunk)
    budget -= chunk.length
  }

  // Re-join in original order for coherent context
  // (sort selected back by their original index)
  const selectedSet = new Set(selected)
  const ordered = units.filter((u) => selectedSet.has(u))

  return ordered.join('\n\n')
}

/**
 * Extract and preprocess text from an uploaded file.
 * The returned string is ready to send directly to the AI — cleaned,
 * deduplicated, Chinese-dense, and capped at MAX_AI_INPUT_CHARS.
 */
export async function extractText(
  fileName: string,
  buffer: Buffer,
): Promise<string> {
  const raw = await extractRawText(fileName, buffer)
  return preprocessText(raw)
}
