<template>
  <div class="min-h-screen bg-[#f5f8f7] text-slate-900 dark:bg-dark-950 dark:text-white">
    <ModelMarketNavBar />

    <main class="mx-auto max-w-[1440px] px-5 pb-16 pt-10 sm:px-8 lg:pt-14">
      <section class="py-2 sm:py-4">
        <div class="relative z-10 max-w-3xl">
          <p class="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-300">{{ t('modelMarket.eyebrow') }}</p>
          <h1 class="mt-3 text-4xl font-semibold text-slate-950 sm:text-5xl dark:text-white">{{ t('modelMarket.title') }}</h1>
          <p class="mt-4 max-w-2xl text-base leading-7 text-slate-500 sm:text-lg dark:text-dark-300">{{ t('modelMarket.description') }}</p>
        </div>
      </section>

      <section class="mt-7 space-y-4" :aria-label="t('modelMarket.filters.title')">
        <div class="rounded-lg border border-slate-200 bg-white px-4 py-4 shadow-sm dark:border-dark-700 dark:bg-dark-900 sm:px-5">
          <div class="flex items-start gap-4">
            <span class="w-12 shrink-0 pt-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-dark-500">{{ t('modelMarket.filters.vendor') }}</span>
            <div class="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
              <button
                v-for="vendor in vendorOptions"
                :key="vendor.id"
                type="button"
                class="inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition"
                :class="selectedVendor === vendor.id ? 'bg-slate-950 text-white shadow-sm dark:bg-white dark:text-slate-950' : 'bg-slate-50 text-slate-600 hover:bg-slate-100 dark:bg-dark-800 dark:text-dark-200 dark:hover:bg-dark-700'"
                :aria-pressed="selectedVendor === vendor.id"
                @click="selectVendor(vendor.id)"
              >
                <PlatformIcon :platform="vendor.platform as GroupPlatform" size="sm" />
                {{ vendor.name }}
              </button>
            </div>
          </div>
        </div>

        <div class="rounded-lg border border-slate-200 bg-white px-4 py-4 shadow-sm dark:border-dark-700 dark:bg-dark-900 sm:px-5">
          <div class="flex items-start gap-4">
            <span class="w-12 shrink-0 pt-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-dark-500">{{ t('modelMarket.filters.model') }}</span>
            <div class="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
              <button
                v-for="model in modelOptions"
                :key="model.id"
                type="button"
                class="shrink-0 rounded-xl px-3.5 py-2.5 text-sm font-medium transition"
                :class="selectedModel === model.id ? 'bg-emerald-700 text-white shadow-sm dark:bg-emerald-500 dark:text-slate-950' : 'bg-emerald-50/70 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-950/60'"
                :aria-pressed="selectedModel === model.id"
                @click="selectedModel = model.id"
              >
                {{ model.name }}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section class="mt-8 flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center sm:justify-between dark:border-dark-700">
        <div>
          <p class="text-sm font-medium text-slate-700 dark:text-dark-100">{{ t('modelMarket.resultCount', { count: filteredModels.length }) }}</p>
          <p class="mt-1 text-xs text-slate-400 dark:text-dark-500">{{ t('modelMarket.dataNote') }}</p>
        </div>
        <div class="flex flex-col gap-3 sm:flex-row">
          <label class="relative block sm:w-64">
            <span class="sr-only">{{ t('modelMarket.filters.search') }}</span>
            <input v-model="searchQuery" type="search" :placeholder="t('modelMarket.filters.searchPlaceholder')" class="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:placeholder:text-dark-500 dark:focus:border-emerald-500 dark:focus:ring-emerald-950/40" />
          </label>
          <label class="block sm:w-44">
            <span class="sr-only">{{ t('modelMarket.filters.sort') }}</span>
            <select v-model="sortMode" class="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 dark:border-dark-700 dark:bg-dark-900 dark:text-dark-100 dark:focus:border-emerald-500 dark:focus:ring-emerald-950/40">
              <option value="recommended">{{ t('modelMarket.filters.recommended') }}</option>
              <option value="inputPrice">{{ t('modelMarket.filters.inputPrice') }}</option>
              <option value="name">{{ t('modelMarket.filters.nameSort') }}</option>
            </select>
          </label>
        </div>
      </section>

      <section v-if="loading" class="mt-7 py-16 text-center text-sm text-slate-500 dark:text-dark-300" data-testid="model-market-loading">{{ t('modelMarket.loading') }}</section>
      <section v-else-if="loadFailed" class="mt-7 rounded-xl border border-rose-200 bg-white px-6 py-12 text-center text-sm text-rose-700 dark:border-rose-900 dark:bg-dark-900 dark:text-rose-300" data-testid="model-market-error">{{ t('modelMarket.loadError') }}</section>
      <section v-else-if="filteredModels.length" class="mt-7 grid gap-5 md:grid-cols-2 xl:grid-cols-3" data-testid="model-market-grid">
        <ModelMarketCard v-for="model in filteredModels" :key="model.id" :model="model" :vendor-name="vendorName(model.vendorId)" @select="selectedDetail = $event" />
      </section>
      <section v-else class="mt-7 rounded-lg border border-dashed border-slate-300 bg-white px-6 py-16 text-center dark:border-dark-700 dark:bg-dark-900">
        <p class="text-base font-semibold text-slate-700 dark:text-dark-100">{{ models.length ? t('modelMarket.empty') : t('modelMarket.noModels') }}</p>
        <p class="mt-2 text-sm text-slate-400 dark:text-dark-500">{{ models.length ? t('modelMarket.emptyHint') : t('modelMarket.noModelsHint') }}</p>
      </section>
    </main>

    <BaseDialog :show="selectedDetail !== null" :title="selectedDetail?.name ?? ''" close-on-click-outside @close="selectedDetail = null">
      <div v-if="selectedDetail">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">{{ vendorName(selectedDetail.vendorId) }}</p>
            <h2 class="mt-2 font-mono text-2xl font-semibold text-slate-950 dark:text-white">{{ selectedDetail.name }}</h2>
            <p class="mt-2 text-sm text-slate-500 dark:text-dark-300">{{ selectedDetail.groupName }}</p>
          </div>
        </div>
        <p class="mt-5 leading-7 text-slate-600 dark:text-dark-200">{{ selectedDetail.description }}</p>
        <div class="mt-5 flex items-center justify-between rounded-lg border-2 border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-700 dark:bg-amber-950/30">
          <span class="text-sm font-semibold text-amber-900 dark:text-amber-200">{{ t(`modelMarket.card.multiplierKind.${selectedDetail.multiplierKind}`) }}</span>
          <strong class="font-mono text-xl font-bold text-amber-900 dark:text-amber-200">×{{ formatMultiplier(selectedDetail.multiplier) }}</strong>
        </div>
        <div v-if="(selectedDetail.billingMode === 'token' && selectedDetail.peakRateEnabled && selectedDetail.peakRateMultiplier !== 1) || selectedDetail.timePricing?.periods.length" class="mt-2 space-y-1 text-xs font-medium text-amber-800 dark:text-amber-300">
          <p v-if="selectedDetail.billingMode === 'token' && selectedDetail.peakRateEnabled && selectedDetail.peakRateMultiplier !== 1">
            {{ t('modelMarket.card.peakMultiplier', { rate: formatMultiplier(selectedDetail.peakRateMultiplier), combined: formatMultiplier(selectedDetail.multiplier * selectedDetail.peakRateMultiplier), start: selectedDetail.peakStart, end: selectedDetail.peakEnd }) }}
          </p>
          <p v-for="period in selectedDetail.timePricing?.periods ?? []" :key="`${period.start_time}-${period.end_time}`">
            {{ t('modelMarket.card.timeMultiplier', { days: selectedDetail.timePricing?.weekdays_only ? t('modelMarket.card.weekdays') : t('modelMarket.card.everyDay'), timezone: selectedDetail.timePricing?.timezone, start: period.start_time, end: period.end_time, rate: formatMultiplier(period.multiplier), combined: formatMultiplier(selectedDetail.multiplier * period.multiplier) }) }}
          </p>
        </div>
        <div class="mt-6 overflow-hidden rounded-lg border border-slate-200 dark:border-dark-700">
          <p class="bg-slate-50 px-4 py-3 text-xs text-slate-500 dark:bg-dark-800 dark:text-dark-300">{{ t('modelMarket.priceBasis') }}</p>
          <dl class="divide-y divide-slate-100 px-4 text-sm dark:divide-dark-700">
            <template v-if="selectedDetail.priceTiers.length > 1">
              <div v-for="tier in selectedDetail.priceTiers" :key="tier.label" class="py-3">
                <dt class="font-medium">{{ tier.label }}</dt>
                <dd class="mt-1 font-mono text-xs leading-6">
                  <template v-if="selectedDetail.billingMode === 'token'">{{ t('modelMarket.card.input') }} {{ formatPrice(tier.inputPrice, true) }} · {{ t('modelMarket.card.output') }} {{ formatPrice(tier.outputPrice, true) }}</template>
                  <template v-else>{{ t('modelMarket.card.perRequest') }} {{ formatPrice(tier.requestPrice, false) }}</template>
                  <span v-if="tier.cacheWrite5mPrice != null"> · {{ t('modelMarket.card.cacheWrite5m') }} {{ formatPrice(tier.cacheWrite5mPrice, true) }}</span>
                  <span v-if="tier.cacheWrite1hPrice != null"> · {{ t('modelMarket.card.cacheWrite1h') }} {{ formatPrice(tier.cacheWrite1hPrice, true) }}</span>
                  <span v-if="tier.cacheReadPrice != null"> · {{ t('modelMarket.card.cache') }} {{ formatPrice(tier.cacheReadPrice, true) }}</span>
                </dd>
              </div>
            </template>
            <div v-if="selectedDetail.billingMode === 'token' && selectedDetail.priceTiers.length <= 1" class="flex justify-between py-3"><dt>{{ t('modelMarket.card.input') }}</dt><dd class="font-mono">{{ formatPrice(selectedDetail.inputPrice, true) }}</dd></div>
            <div v-if="selectedDetail.billingMode === 'token' && selectedDetail.priceTiers.length <= 1" class="flex justify-between py-3"><dt>{{ t('modelMarket.card.output') }}</dt><dd class="font-mono">{{ formatPrice(selectedDetail.outputPrice, true) }}</dd></div>
            <div v-if="selectedDetail.billingMode !== 'token' && selectedDetail.priceTiers.length <= 1" class="flex justify-between py-3"><dt>{{ t('modelMarket.card.perRequest') }}</dt><dd class="font-mono">{{ formatPrice(selectedDetail.requestPrice, false) }}</dd></div>
            <div v-if="selectedDetail.billingMode === 'token' && selectedDetail.priceTiers.length <= 1" class="flex justify-between py-3"><dt>{{ t('modelMarket.card.cacheWrite5m') }}</dt><dd class="font-mono">{{ formatPrice(selectedDetail.cacheWrite5mPrice, true) }}</dd></div>
            <div v-if="selectedDetail.billingMode === 'token' && selectedDetail.priceTiers.length <= 1" class="flex justify-between py-3"><dt>{{ t('modelMarket.card.cacheWrite1h') }}</dt><dd class="font-mono">{{ formatPrice(selectedDetail.cacheWrite1hPrice, true) }}</dd></div>
            <div v-if="selectedDetail.billingMode === 'token' && selectedDetail.priceTiers.length <= 1" class="flex justify-between py-3"><dt>{{ t('modelMarket.card.cache') }}</dt><dd class="font-mono">{{ formatPrice(selectedDetail.cacheReadPrice, true) }}</dd></div>
          </dl>
        </div>
        <p class="mt-6 text-xs leading-6 text-slate-500 dark:text-dark-400">{{ t('modelMarket.multiplierNote') }}</p>
      </div>
    </BaseDialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import PlatformIcon from '@/components/common/PlatformIcon.vue'
import type { GroupPlatform } from '@/types'
import ModelMarketNavBar from '@/components/modelMarket/ModelMarketNavBar.vue'
import ModelMarketCard from '@/components/modelMarket/ModelMarketCard.vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import { getModelMarket, type ModelPlazaResponse } from '@/api/modelPlaza'
import { toModelMarketModels, type ModelMarketModel } from '@/data/modelMarket'
import { platformLabel } from '@/utils/platformColors'

const { t } = useI18n()
const selectedVendor = ref('all')
const selectedModel = ref('all')
const searchQuery = ref('')
const sortMode = ref<'recommended' | 'inputPrice' | 'name'>('recommended')
const selectedDetail = ref<ModelMarketModel | null>(null)
const response = ref<ModelPlazaResponse | null>(null)
const loading = ref(true)
const loadFailed = ref(false)
const models = computed(() => toModelMarketModels(response.value?.groups ?? []))

const vendorOptions = computed(() => [{ id: 'all', name: t('modelMarket.filters.allVendors'), platform: 'composite' }, ...[...new Set(models.value.map((model) => model.vendorId))].sort().map((platform) => ({ id: platform, name: platformLabel(platform), platform }))])
const modelOptions = computed(() => [
  { id: 'all', name: t('modelMarket.filters.allModels') },
  ...models.value
    .filter((model) => selectedVendor.value === 'all' || model.vendorId === selectedVendor.value)
    .reduce<ModelMarketModel[]>((unique, model) => unique.some((item) => item.id === `${model.platform}:${model.name}`) ? unique : [...unique, { ...model, id: `${model.platform}:${model.name}` }], [])
    .map((model) => ({ id: model.id, name: model.name }))
])

const filteredModels = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase()
  const visibleModels = models.value.filter((model) => {
    const vendorMatch = selectedVendor.value === 'all' || model.vendorId === selectedVendor.value
    const modelMatch = selectedModel.value === 'all' || `${model.platform}:${model.name}` === selectedModel.value
    const queryMatch = !query || `${model.name} ${vendorName(model.vendorId)} ${model.description} ${model.groupName}`.toLocaleLowerCase().includes(query)
    return vendorMatch && modelMatch && queryMatch
  })

  return [...visibleModels].sort((a, b) => {
    if (sortMode.value === 'inputPrice') return (a.inputPrice ?? Number.POSITIVE_INFINITY) - (b.inputPrice ?? Number.POSITIVE_INFINITY)
    if (sortMode.value === 'name') return a.name.localeCompare(b.name)
    return a.vendorId.localeCompare(b.vendorId) || a.name.localeCompare(b.name) || a.groupName.localeCompare(b.groupName)
  })
})

function selectVendor(vendorId: string) {
  selectedVendor.value = vendorId
  selectedModel.value = 'all'
}

function vendorName(vendorId: string) {
  return platformLabel(vendorId) || vendorId
}

function formatPrice(value: number | null, perMillion: boolean) {
  if (value == null) return t('modelMarket.priceUnavailable')
  const amount = perMillion ? value * 1_000_000 : value
  return `USD ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`
}

function formatMultiplier(value: number) { return Number(value.toPrecision(8)).toString() }

onMounted(async () => {
  try {
    response.value = await getModelMarket()
  } catch {
    loadFailed.value = true
  } finally {
    loading.value = false
  }
})
</script>
