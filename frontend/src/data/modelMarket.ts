import type { ModelPlazaGroup, PlazaModel } from '@/api/modelPlaza'
import { BILLING_MODE_IMAGE, BILLING_MODE_VIDEO } from '@/constants/channel'
import { resolveIntervalPrices } from '@/utils/pricing'

export type ModelMarketTier = {
  label: string
  inputPrice: number | null
  outputPrice: number | null
  requestPrice: number | null
  cacheReadPrice: number | null
  cacheWrite5mPrice: number | null
  cacheWrite1hPrice: number | null
}

export type ModelMarketTimePricing = NonNullable<PlazaModel['time_pricing']>

export type ModelMarketModel = {
  id: string
  name: string
  vendorId: string
  platform: string
  groupId: number
  groupName: string
  description: string
  billingMode: string
  multiplier: number
  multiplierKind: 'group' | 'image' | 'video'
  peakRateEnabled: boolean
  peakStart: string
  peakEnd: string
  peakRateMultiplier: number
  timePricing: ModelMarketTimePricing | null
  inputPrice: number | null
  outputPrice: number | null
  requestPrice: number | null
  cacheReadPrice: number | null
  cacheWrite5mPrice: number | null
  cacheWrite1hPrice: number | null
  priceTiers: ModelMarketTier[]
}

function multiplierInfo(group: ModelPlazaGroup, model: PlazaModel): Pick<ModelMarketModel, 'multiplier' | 'multiplierKind'> {
  const mode = model.pricing?.billing_mode
  if (mode === BILLING_MODE_IMAGE && group.image_rate_independent) return { multiplier: group.image_rate_multiplier, multiplierKind: 'image' }
  if (mode === BILLING_MODE_VIDEO && group.video_rate_independent) return { multiplier: group.video_rate_multiplier, multiplierKind: 'video' }
  return { multiplier: group.user_rate_multiplier ?? group.rate_multiplier, multiplierKind: 'group' }
}

function formatTokenCount(value: number): string {
  if (value >= 1_000_000) return `${Number((value / 1_000_000).toPrecision(4))}M`
  if (value >= 1_000) return `${Number((value / 1_000).toPrecision(4))}K`
  return String(value)
}

export function toModelMarketModels(groups: ModelPlazaGroup[]): ModelMarketModel[] {
  return groups.flatMap((group) => group.models.map((model) => {
    const { multiplier, multiplierKind } = multiplierInfo(group, model)
    const pricing = model.pricing
    const scale = (value: number | null | undefined) => value == null ? null : value * multiplier
    const priceTiers = (pricing?.intervals ?? []).map((interval) => {
      const resolved = resolveIntervalPrices(interval, pricing!)
      const range = resolved.tier_label || (resolved.max_tokens == null ? `>${formatTokenCount(resolved.min_tokens)}` : `≤${formatTokenCount(resolved.max_tokens)}`)
      return {
        label: range,
        inputPrice: scale(resolved.input_price),
        outputPrice: scale(resolved.output_price),
        requestPrice: scale(resolved.per_request_price),
        cacheReadPrice: scale(resolved.cache_read_price),
        cacheWrite5mPrice: scale(resolved.cache_write_price),
        cacheWrite1hPrice: scale(resolved.cache_write_1h_price)
      }
    })
    const base = priceTiers[0]

    return {
      id: `${group.id}:${model.platform}:${model.name}`,
      name: model.name,
      vendorId: model.platform,
      platform: model.platform,
      groupId: group.id,
      groupName: group.name,
      description: group.description,
      billingMode: pricing?.billing_mode ?? 'unknown',
      multiplier,
      multiplierKind,
      peakRateEnabled: group.peak_rate_enabled,
      peakStart: group.peak_start,
      peakEnd: group.peak_end,
      peakRateMultiplier: group.peak_rate_multiplier,
      timePricing: model.time_pricing ?? null,
      inputPrice: base?.inputPrice ?? scale(pricing?.input_price),
      outputPrice: base?.outputPrice ?? scale(pricing?.output_price),
      requestPrice: base?.requestPrice ?? scale(pricing?.per_request_price),
      cacheReadPrice: base?.cacheReadPrice ?? scale(pricing?.cache_read_price),
      cacheWrite5mPrice: base?.cacheWrite5mPrice ?? scale(pricing?.cache_write_price),
      cacheWrite1hPrice: base?.cacheWrite1hPrice ?? scale(pricing?.cache_write_1h_price),
      priceTiers
    }
  }))
}
