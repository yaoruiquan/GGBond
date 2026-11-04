<template>
  <div class="space-y-5">
    <div v-if="!embedded">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ t('modelPlaza.title') }}</h1>
      <p class="mt-1 text-sm text-gray-500 dark:text-dark-400">{{ t('modelPlaza.description') }}</p>
    </div>

    <div
      v-if="descriptionHtml"
      class="border-y border-gray-200 py-3 text-sm text-gray-600 dark:border-dark-700 dark:text-dark-300"
      v-html="descriptionHtml"
    ></div>

    <div v-if="preview" class="flex items-center gap-2 border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
      <Icon name="infoCircle" size="xs" class="h-3.5 w-3.5 shrink-0" />
      {{ t('modelPlaza.mockPreview') }}
    </div>

    <p v-if="!isAuthenticated" class="flex items-center gap-1.5 text-xs text-gray-400 dark:text-dark-500">
      <Icon name="infoCircle" size="xs" class="h-3.5 w-3.5" />
      {{ t('modelPlaza.anonymousHint') }}
    </p>

    <div v-if="loading" class="flex min-h-[240px] items-center justify-center">
      <div class="h-8 w-8 animate-spin rounded-full border-2 border-primary-600/25 border-t-primary-600 dark:border-primary-400/25 dark:border-t-primary-400"></div>
    </div>
    <div v-else-if="error" class="border-y border-red-200 py-8 text-center text-sm text-red-600 dark:border-red-500/30 dark:text-red-300">
      {{ t('modelPlaza.loadFailed') }}
    </div>
    <template v-else>
      <div class="flex flex-col gap-3 border-y border-gray-200 py-3 dark:border-dark-700 sm:flex-row sm:items-center">
        <label class="relative min-w-0 flex-1 sm:max-w-sm">
          <Icon name="search" size="sm" class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            v-model="searchQuery"
            type="search"
            :placeholder="t('modelPlaza.filters.searchPlaceholder')"
            class="input rounded-md py-2 pl-9"
          />
        </label>
        <label class="flex items-center gap-2 text-sm text-gray-500 dark:text-dark-400">
          <span class="shrink-0">{{ t('modelPlaza.filters.platformLabel') }}</span>
          <select v-model="selectedPlatform" class="input min-w-0 rounded-md py-2 sm:w-44">
            <option value="all">{{ t('modelPlaza.filters.all') }}</option>
            <option v-for="platform in platforms" :key="platform" :value="platform">{{ platform }}</option>
          </select>
        </label>
        <label class="flex items-center gap-2 text-sm text-gray-500 dark:text-dark-400">
          <span class="shrink-0">{{ t('modelPlaza.filters.groupLabel') }}</span>
          <select v-model="selectedGroupId" class="input min-w-0 rounded-md py-2 sm:w-48">
            <option value="all">{{ t('modelPlaza.filters.all') }}</option>
            <option v-for="group in groups" :key="group.id" :value="String(group.id)">{{ group.name }}</option>
          </select>
        </label>
        <span class="text-xs tabular-nums text-gray-400 dark:text-dark-500 sm:ml-auto">
          {{ t('modelPlaza.resultCount', { count: filteredRows.length }) }}
        </span>
      </div>

      <div v-if="rows.length === 0" class="border-y border-dashed border-gray-300 py-12 text-center dark:border-dark-600">
        <p class="text-sm font-medium text-gray-700 dark:text-dark-200">{{ t('modelPlaza.empty') }}</p>
      </div>
      <div v-else-if="filteredRows.length === 0" class="border-y border-dashed border-gray-300 py-12 text-center text-sm text-gray-500 dark:border-dark-600 dark:text-dark-400">
        {{ t('modelPlaza.noSearchResult') }}
      </div>
      <div v-else class="overflow-x-auto border-y border-gray-200 dark:border-dark-700">
        <table class="w-full min-w-[920px] border-collapse text-left text-sm tabular-nums">
          <thead class="bg-gray-50 text-xs font-semibold text-gray-500 dark:bg-dark-900/50 dark:text-dark-400">
            <tr>
              <th class="px-4 py-3">{{ t('modelPlaza.table.model') }}</th>
              <th class="px-4 py-3">{{ t('modelPlaza.filters.groupLabel') }}</th>
              <th class="px-4 py-3">{{ t('modelPlaza.table.rate') }}</th>
              <th class="px-4 py-3">{{ t('modelPlaza.table.paidPrice') }}</th>
              <th class="px-4 py-3">{{ t('modelPlaza.table.officialReference') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in filteredRows" :key="row.key" class="border-t border-gray-100 dark:border-dark-800">
              <td class="px-4 py-3">
                <div class="flex items-center gap-2">
                  <PlatformIcon :platform="row.model.platform as GroupPlatform" size="sm" />
                  <span class="font-medium text-gray-900 dark:text-white">{{ row.model.name }}</span>
                </div>
                <div class="mt-1 pl-6 text-xs text-gray-400 dark:text-dark-500">{{ row.model.platform }}<span v-if="row.mode !== 'token'"> · {{ modeLabel(row.mode) }}</span></div>
              </td>
              <td class="px-4 py-3 text-gray-600 dark:text-dark-300">{{ row.group.name }}</td>
              <td class="px-4 py-3 font-mono text-gray-700 dark:text-dark-200">
                {{ formatRate(row.rate) }}
                <span v-if="row.mediaRate != null" class="ml-1 text-xs text-gray-400">{{ t('modelPlaza.table.independentRate', { rate: formatRate(row.mediaRate) }) }}</span>
              </td>
              <td class="px-4 py-3 font-mono font-medium text-gray-900 dark:text-white">
                <div v-for="price in row.ourPrices" :key="price" class="whitespace-nowrap text-xs leading-5">{{ price }}</div>
                <div v-if="row.mode === 'token'" class="mt-1 text-xs font-sans font-normal text-gray-400 dark:text-dark-500">{{ t('modelPlaza.table.unitPerMillion') }}</div>
                <div v-if="row.model.time_pricing?.periods.length" class="mt-1 text-xs font-sans font-normal text-amber-600 dark:text-amber-400">{{ t('modelPlaza.table.hasTimePricing') }}</div>
                <div v-if="row.group.peak_rate_enabled && row.group.peak_rate_multiplier !== 1" class="mt-1 text-xs font-sans font-normal text-amber-600 dark:text-amber-400">{{ t('modelPlaza.table.peakRate', { rate: formatRate(row.group.peak_rate_multiplier) }) }}</div>
              </td>
              <td class="px-4 py-3 font-mono text-gray-500 dark:text-dark-400">
                <div v-for="price in row.officialPrices" :key="price" class="whitespace-nowrap text-xs leading-5">{{ price }}</div>
                <div v-if="row.mode === 'token' && row.model.official_pricing" class="mt-1 text-xs font-sans">{{ t('modelPlaza.table.unitPerMillion') }}</div>
                <div v-if="row.officialUnavailable" class="mt-1 text-xs font-sans">{{ t('modelPlaza.table.referenceUnavailable') }}</div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import type { ModelPlazaGroup, ModelPlazaResponse, PlazaModel } from '@/api/modelPlaza'
import type { GroupPlatform } from '@/types'
import { formatScaled, resolveIntervalPrices } from '@/utils/pricing'
import { BILLING_MODE_IMAGE, BILLING_MODE_VIDEO } from '@/constants/channel'
import { useAuthStore } from '@/stores/auth'
import Icon from '@/components/icons/Icon.vue'
import PlatformIcon from '@/components/common/PlatformIcon.vue'

const props = defineProps<{
  response: ModelPlazaResponse | null
  loading: boolean
  error?: boolean
  embedded?: boolean
  preview?: boolean
}>()

const { t } = useI18n()
const authStore = useAuthStore()
const isAuthenticated = computed(() => authStore.isAuthenticated)
const selectedPlatform = ref('all')
const selectedGroupId = ref('all')
const searchQuery = ref('')
const PER_MILLION = 1_000_000

const descriptionHtml = computed(() => {
  const markdown = props.response?.description?.trim()
  return markdown ? DOMPurify.sanitize(marked.parse(markdown) as string) : ''
})
const groups = computed(() => props.response?.groups ?? [])
const platforms = computed(() => [...new Set(groups.value.map((group) => group.platform))].sort())

function effectiveRate(group: ModelPlazaGroup): number {
  return group.user_rate_multiplier ?? group.rate_multiplier
}

function modelMode(model: PlazaModel): string {
  return model.pricing?.billing_mode || 'token'
}

function formatRate(rate: number): string {
  return `${Number(rate.toPrecision(8))}x`
}

function modeLabel(mode: string): string {
  if (mode === BILLING_MODE_IMAGE) return t('modelPlaza.table.perImage')
  if (mode === BILLING_MODE_VIDEO) return t('modelPlaza.table.perVideo')
  return t('modelPlaza.table.perRequest')
}

function mediaRate(group: ModelPlazaGroup, mode: string): number | null {
  if (mode === BILLING_MODE_IMAGE && group.image_rate_independent) return Math.max(0, group.image_rate_multiplier)
  if (mode === BILLING_MODE_VIDEO && group.video_rate_independent) return Math.max(0, group.video_rate_multiplier)
  return null
}

function intervalLabel(interval: { tier_label?: string; min_tokens: number; max_tokens: number | null }, count: number): string {
  if (interval.tier_label) return interval.tier_label
  if (count <= 1) return ''
  const limit = interval.max_tokens
  if (limit == null) return `>${interval.min_tokens}`
  if (limit >= 1_000_000) return `≤${Number((limit / 1_000_000).toPrecision(4))}M`
  if (limit >= 1_000) return `≤${Number((limit / 1_000).toPrecision(4))}K`
  return `≤${limit}`
}

function priceLines(model: PlazaModel, mode: string, rate: number, official = false): string[] {
  if (official && mode !== 'token') return ['-']
  if (mode === 'token') {
    const base = official ? model.official_pricing : model.pricing
    if (!base) return ['-']
    const intervals = official
      ? (model.official_pricing?.intervals ?? [])
      : (model.pricing?.intervals ?? []).map((interval) => resolveIntervalPrices(interval, model.pricing!))
    const priceTiers = intervals.length ? intervals : [base]
    const factor = official ? 1 : rate
    return priceTiers.map((price, index) => {
      const label = intervals.length ? intervalLabel(intervals[index], priceTiers.length) : ''
      const input = formatScaled(price.input_price == null ? null : price.input_price * factor, PER_MILLION, 2)
      const output = formatScaled(price.output_price == null ? null : price.output_price * factor, PER_MILLION, 2)
      const cache = price.cache_write_price != null || price.cache_read_price != null
        ? ` · ${t('modelPlaza.table.cacheWriteShort')} ${formatScaled(price.cache_write_price == null ? null : price.cache_write_price * factor, PER_MILLION, 2)} / ${t('modelPlaza.table.cacheReadShort')} ${formatScaled(price.cache_read_price == null ? null : price.cache_read_price * factor, PER_MILLION, 2)}`
        : ''
      const tier = label || (priceTiers.length > 1 ? `#${index + 1}` : '')
      return `${tier ? `${tier} · ` : ''}${t('modelPlaza.table.input')} ${input} · ${t('modelPlaza.table.output')} ${output}${cache}`
    })
  }
  const pricing = model.pricing
  if (!pricing) return ['-']
  const intervals = pricing.intervals.filter((interval) => interval.per_request_price != null)
  const priceTiers = intervals.length ? intervals : [{ min_tokens: 0, max_tokens: null, per_request_price: pricing.per_request_price }]
  return priceTiers.map((interval) => {
    if (interval.per_request_price == null) return '-'
    const label = intervalLabel(interval, priceTiers.length)
    const unit = mode === BILLING_MODE_IMAGE
      ? t('modelPlaza.table.perUnitImage')
      : mode === BILLING_MODE_VIDEO
        ? t('modelPlaza.table.perUnitVideo')
        : t('modelPlaza.table.perUnitRequest')
    return `${label ? `${label} · ` : ''}${formatScaled(interval.per_request_price * rate, 1, 2)} ${unit}`
  })
}

const rows = computed(() => groups.value.flatMap((group) => group.models.map((model) => {
  const mode = modelMode(model)
  const rate = effectiveRate(group)
  const independent = mediaRate(group, mode)
  const actualRate = independent ?? rate
  return {
    key: `${group.id}:${model.platform}:${model.name}`,
    group,
    model,
    mode,
    rate,
    mediaRate: independent,
    ourPrices: priceLines(model, mode, actualRate),
    officialPrices: priceLines(model, mode, 1, true),
    officialUnavailable: mode !== 'token' || !model.official_pricing || model.official_pricing.input_price == null && model.official_pricing.output_price == null
  }
})))

const filteredRows = computed(() => rows.value.filter((row) => {
  const matchesPlatform = selectedPlatform.value === 'all' || row.model.platform === selectedPlatform.value
  const matchesGroup = selectedGroupId.value === 'all' || String(row.group.id) === selectedGroupId.value
  const query = searchQuery.value.trim().toLocaleLowerCase()
  const matchesSearch = !query || `${row.model.name} ${row.model.platform}`.toLocaleLowerCase().includes(query)
  return matchesPlatform && matchesGroup && matchesSearch
}))

watch(groups, () => {
  if (selectedPlatform.value !== 'all' && !platforms.value.includes(selectedPlatform.value)) selectedPlatform.value = 'all'
  if (selectedGroupId.value !== 'all' && !groups.value.some((group) => String(group.id) === selectedGroupId.value)) selectedGroupId.value = 'all'
})
</script>
