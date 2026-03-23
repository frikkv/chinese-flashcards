import { db } from '#/db'
import { aiUsageEvents } from '#/db/schema'

// GPT-4o-mini pricing (per token)
const PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.00000015, output: 0.0000006 },
}
const DEFAULT_PRICING = { input: 0.00000015, output: 0.0000006 }

/**
 * Log a metered AI usage event. Fire-and-forget — never blocks the main request.
 *
 * Call after every successful AI operation. If token counts are unavailable
 * (e.g. the SDK didn't return them), pass null — the request is still logged
 * with feature name, model, and timestamp for volume tracking.
 */
export function logAiUsage(opts: {
  userId?: string | null
  featureName: string
  model: string
  inputTokens?: number | null
  outputTokens?: number | null
  metadata?: Record<string, unknown> | null
}) {
  const pricing = PRICING[opts.model] ?? DEFAULT_PRICING
  const inputTokens = opts.inputTokens ?? null
  const outputTokens = opts.outputTokens ?? null

  let estimatedCostUsd: string | null = null
  if (inputTokens != null && outputTokens != null) {
    const cost = inputTokens * pricing.input + outputTokens * pricing.output
    estimatedCostUsd = cost.toFixed(6)
  }

  void db
    .insert(aiUsageEvents)
    .values({
      id: crypto.randomUUID(),
      userId: opts.userId ?? null,
      featureName: opts.featureName,
      model: opts.model,
      inputTokens,
      outputTokens,
      estimatedCostUsd,
      metadata: opts.metadata ?? null,
      createdAt: new Date(),
    })
    .catch((err) => {
      console.error('[ai-usage] Failed to log:', opts.featureName, err)
    })
}
