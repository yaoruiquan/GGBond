<template>
  <article class="group relative flex min-h-[390px] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-32px_rgba(15,23,42,0.45)] transition duration-300 hover:-translate-y-1 hover:border-emerald-300 hover:shadow-[0_24px_60px_-30px_rgba(16,110,91,0.28)] dark:border-dark-700 dark:bg-dark-900 dark:hover:border-emerald-500/60">
    <div class="absolute inset-x-6 top-0 h-0.5 rounded-b-full bg-amber-200 dark:bg-amber-500/70"></div>

    <div class="flex items-start justify-between gap-4 pt-1">
      <div class="flex items-center gap-2.5">
        <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-700 ring-1 ring-slate-200 dark:bg-dark-800 dark:text-dark-100 dark:ring-dark-700">
          <PlatformIcon :platform="model.platform as GroupPlatform" size="md" />
        </span>
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-dark-500">{{ vendorName }}</p>
          <p class="mt-0.5 text-xs text-slate-400 dark:text-dark-500">{{ model.groupName }}</p>
        </div>
      </div>
      <span class="pt-2 text-xs font-medium tracking-wide text-slate-400 dark:text-dark-500">{{ billingModeLabel }}</span>
    </div>

    <div class="mt-7">
      <h2 class="break-words font-mono text-[1.75rem] font-semibold text-slate-950 dark:text-white">{{ model.name }}</h2>
      <p class="mt-3 min-h-[48px] text-sm leading-6 text-slate-500 dark:text-dark-300">{{ model.description || t('modelMarket.noDescription') }}</p>
    </div>

    <div class="mt-5 flex items-center justify-between rounded-lg border-2 border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-700 dark:bg-amber-950/30">
      <span class="text-sm font-semibold text-amber-900 dark:text-amber-200">{{ t(`modelMarket.card.multiplierKind.${model.multiplierKind}`) }}</span>
      <strong class="font-mono text-xl font-bold text-amber-900 dark:text-amber-200">×{{ formatMultiplier(model.multiplier) }}</strong>
    </div>
    <div v-if="(model.billingMode === 'token' && model.peakRateEnabled && model.peakRateMultiplier !== 1) || model.timePricing?.periods.length" class="mt-2 space-y-1 text-xs font-medium text-amber-800 dark:text-amber-300">
      <p v-if="model.billingMode === 'token' && model.peakRateEnabled && model.peakRateMultiplier !== 1">
        {{ t('modelMarket.card.peakMultiplier', { rate: formatMultiplier(model.peakRateMultiplier), combined: formatMultiplier(model.multiplier * model.peakRateMultiplier), start: model.peakStart, end: model.peakEnd }) }}
      </p>
      <p v-for="period in model.timePricing?.periods ?? []" :key="`${period.start_time}-${period.end_time}`">
        {{ t('modelMarket.card.timeMultiplier', { days: model.timePricing?.weekdays_only ? t('modelMarket.card.weekdays') : t('modelMarket.card.everyDay'), timezone: model.timePricing?.timezone, start: period.start_time, end: period.end_time, rate: formatMultiplier(period.multiplier), combined: formatMultiplier(model.multiplier * period.multiplier) }) }}
      </p>
    </div>
    <p v-if="model.priceTiers.length > 1" class="mt-2 text-xs font-medium text-amber-800 dark:text-amber-300">
      {{ t('modelMarket.card.tierPricing') }}
    </p>

    <div v-if="model.billingMode === 'token'" class="mt-5 grid grid-cols-2 divide-x divide-slate-200 dark:divide-dark-700">
      <div class="px-3 py-1">
        <p class="text-xs font-medium text-slate-500 dark:text-dark-400">{{ t('modelMarket.card.input') }}</p>
        <p class="mt-2 font-mono text-lg font-semibold tracking-tight text-emerald-700 dark:text-emerald-300">{{ formatPrice(model.inputPrice, true) }}</p>
        <p class="mt-1 text-xs text-slate-400 dark:text-dark-500">{{ t('modelMarket.card.perMillion') }}</p>
      </div>
      <div class="px-3 py-1">
        <p class="text-xs font-medium text-slate-500 dark:text-dark-400">{{ t('modelMarket.card.output') }}</p>
        <p class="mt-2 font-mono text-lg font-semibold tracking-tight text-emerald-700 dark:text-emerald-300">{{ formatPrice(model.outputPrice, true) }}</p>
        <p class="mt-1 text-xs text-slate-400 dark:text-dark-500">{{ t('modelMarket.card.perMillion') }}</p>
      </div>
    </div>

    <div v-else-if="model.billingMode !== 'unknown'" class="mt-5 border-t border-slate-200 pt-4 dark:border-dark-700">
      <p class="text-xs font-medium text-slate-500 dark:text-dark-400">{{ t('modelMarket.card.perRequest') }}</p>
      <p class="mt-2 font-mono text-xl font-semibold text-emerald-700 dark:text-emerald-300">{{ formatPrice(model.requestPrice, false) }}</p>
      <p class="mt-1 text-xs text-slate-400 dark:text-dark-500">{{ requestUnit }}</p>
    </div>

    <p v-else class="mt-5 border-t border-slate-200 pt-4 text-sm text-slate-500 dark:border-dark-700 dark:text-dark-300">{{ t('modelMarket.quoteUnavailable') }}</p>

    <div v-if="model.billingMode === 'token' && (model.cacheWrite5mPrice != null || model.cacheWrite1hPrice != null || model.cacheReadPrice != null)" class="my-5 grid grid-cols-3 divide-x divide-slate-200 text-xs dark:divide-dark-700">
      <div><p class="text-slate-400 dark:text-dark-500">{{ t('modelMarket.card.cacheWrite5m') }}</p><p class="mt-2 font-mono font-semibold">{{ formatPrice(model.cacheWrite5mPrice, true) }}</p></div>
      <div class="pl-3"><p class="text-slate-400 dark:text-dark-500">{{ t('modelMarket.card.cacheWrite1h') }}</p><p class="mt-2 font-mono font-semibold">{{ formatPrice(model.cacheWrite1hPrice, true) }}</p></div>
      <div class="pl-3"><p class="text-slate-400 dark:text-dark-500">{{ t('modelMarket.card.cache') }}</p><p class="mt-2 font-mono font-semibold">{{ formatPrice(model.cacheReadPrice, true) }}</p></div>
    </div>

    <div class="my-4 border-t border-slate-100 pt-3 text-sm dark:border-dark-700">
      <span class="text-slate-400 dark:text-dark-500">{{ t('modelMarket.card.group') }}</span>
      <span class="ml-2 font-medium text-slate-700 dark:text-dark-100">{{ model.groupName }}</span>
    </div>

    <button
      type="button"
      class="mt-auto inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-emerald-700 transition hover:border-emerald-400 hover:bg-emerald-50 dark:border-dark-700 dark:text-emerald-300 dark:hover:border-emerald-500/60 dark:hover:bg-emerald-950/30"
      @click="$emit('select', model)"
    >
      {{ t('modelMarket.card.viewDetails') }}
      <span aria-hidden="true">↗</span>
    </button>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import PlatformIcon from '@/components/common/PlatformIcon.vue'
import type { GroupPlatform } from '@/types'
import type { ModelMarketModel } from '@/data/modelMarket'

const props = defineProps<{
  model: ModelMarketModel
  vendorName: string
}>()

defineEmits<{
  select: [model: ModelMarketModel]
}>()

const { t } = useI18n()
const billingModeLabel = computed(() => t(`modelMarket.card.mode.${props.model.billingMode}`))
const requestUnit = computed(() => props.model.billingMode === 'image'
  ? t('modelMarket.card.perImageUnit')
  : props.model.billingMode === 'video'
    ? t('modelMarket.card.perSecondUnit')
    : t('modelMarket.card.perRequestUnit'))

function formatPrice(value: number | null, perMillion: boolean) {
  if (value == null) return t('modelMarket.priceUnavailable')
  const amount = perMillion ? value * 1_000_000 : value
  return `USD ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`
}

function formatMultiplier(value: number) { return Number(value.toPrecision(8)).toString() }
</script>
