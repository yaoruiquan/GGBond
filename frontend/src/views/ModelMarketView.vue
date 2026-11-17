<template>
  <div class="min-h-screen bg-[#f5f8f7] text-slate-900 dark:bg-dark-950 dark:text-white">
    <ModelMarketNavBar />

    <main class="mx-auto max-w-[1440px] px-5 pb-16 pt-10 sm:px-8 lg:pt-14">
      <section class="py-2 sm:py-4">
        <div class="relative z-10 max-w-3xl">
          <p class="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-300">{{ t('modelMarket.eyebrow') }}</p>
          <h1 class="mt-3 text-4xl font-semibold tracking-[-0.05em] text-slate-950 sm:text-5xl dark:text-white">{{ t('modelMarket.title') }}</h1>
          <p class="mt-4 max-w-2xl text-base leading-7 text-slate-500 sm:text-lg dark:text-dark-300">{{ t('modelMarket.description') }}</p>
        </div>
      </section>

      <section class="mt-7 space-y-4" :aria-label="t('modelMarket.filters.title')">
        <div class="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm dark:border-dark-700 dark:bg-dark-900 sm:px-5">
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

        <div class="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm dark:border-dark-700 dark:bg-dark-900 sm:px-5">
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
              <option value="context">{{ t('modelMarket.filters.contextSort') }}</option>
            </select>
          </label>
        </div>
      </section>

      <section v-if="filteredModels.length" class="mt-7 grid gap-5 md:grid-cols-2 xl:grid-cols-3" data-testid="model-market-grid">
        <ModelMarketCard v-for="model in filteredModels" :key="model.id" :model="model" :vendor-name="vendorName(model.vendorId)" @select="selectedDetail = $event" />
      </section>
      <section v-else class="mt-7 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center dark:border-dark-700 dark:bg-dark-900">
        <p class="text-base font-semibold text-slate-700 dark:text-dark-100">{{ t('modelMarket.empty') }}</p>
        <p class="mt-2 text-sm text-slate-400 dark:text-dark-500">{{ t('modelMarket.emptyHint') }}</p>
      </section>
    </main>

    <BaseDialog :show="selectedDetail !== null" :title="selectedDetail?.name ?? ''" close-on-click-outside @close="selectedDetail = null">
      <div v-if="selectedDetail">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">{{ vendorName(selectedDetail.vendorId) }}</p>
            <h2 class="mt-2 font-mono text-2xl font-semibold text-slate-950 dark:text-white">{{ selectedDetail.name }}</h2>
          </div>
        </div>
        <p class="mt-5 leading-7 text-slate-600 dark:text-dark-200">{{ selectedDetail.description }}</p>
        <div class="mt-6 grid grid-cols-2 gap-3">
          <div class="rounded-2xl bg-slate-50 p-4 dark:bg-dark-800"><p class="text-xs text-slate-400 dark:text-dark-500">{{ t('modelMarket.card.context') }}</p><p class="mt-2 font-mono font-semibold text-slate-900 dark:text-white">{{ selectedDetail.contextLength }}</p></div>
          <div class="rounded-2xl bg-slate-50 p-4 dark:bg-dark-800"><p class="text-xs text-slate-400 dark:text-dark-500">{{ t('modelMarket.card.cache') }}</p><p class="mt-2 font-mono font-semibold text-slate-900 dark:text-white">{{ selectedDetail.cacheReadPrice || '—' }}</p></div>
        </div>
        <div class="mt-6 flex flex-wrap gap-2"><span v-for="capability in selectedDetail.capabilities" :key="capability" class="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">{{ capability }}</span></div>
        <div class="mt-6 overflow-hidden rounded-2xl border border-slate-200 dark:border-dark-700">
          <p class="bg-slate-50 px-4 py-3 text-xs text-slate-500 dark:bg-dark-800 dark:text-dark-300">{{ t('modelMarket.sample') }} · USD {{ t('modelMarket.card.perMillion') }}</p>
          <dl class="divide-y divide-slate-100 px-4 text-sm dark:divide-dark-700">
            <div class="flex justify-between py-3"><dt>{{ t('modelMarket.card.input') }}</dt><dd class="font-mono">{{ selectedDetail.inputPrice }}</dd></div>
            <div class="flex justify-between py-3"><dt>{{ t('modelMarket.card.output') }}</dt><dd class="font-mono">{{ selectedDetail.outputPrice }}</dd></div>
            <div class="flex justify-between py-3"><dt>{{ t('modelMarket.card.cacheWrite5m') }}</dt><dd class="font-mono">{{ selectedDetail.cacheWrite5mPrice ?? '—' }}</dd></div>
            <div class="flex justify-between py-3"><dt>{{ t('modelMarket.card.cacheWrite1h') }}</dt><dd class="font-mono">{{ selectedDetail.cacheWrite1hPrice ?? '—' }}</dd></div>
            <div class="flex justify-between py-3"><dt>{{ t('modelMarket.card.cache') }}</dt><dd class="font-mono">{{ selectedDetail.cacheReadPrice ?? '—' }}</dd></div>
          </dl>
        </div>
        <p class="mt-6 text-xs leading-6 text-slate-500 dark:text-dark-400">{{ t('modelMarket.dataNote') }}</p>
      </div>
    </BaseDialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import PlatformIcon from '@/components/common/PlatformIcon.vue'
import type { GroupPlatform } from '@/types'
import ModelMarketNavBar from '@/components/modelMarket/ModelMarketNavBar.vue'
import ModelMarketCard from '@/components/modelMarket/ModelMarketCard.vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import { modelMarketModels, modelMarketVendors, type ModelMarketModel } from '@/data/modelMarket'

const { t } = useI18n()
const selectedVendor = ref('all')
const selectedModel = ref('all')
const searchQuery = ref('')
const sortMode = ref<'recommended' | 'inputPrice' | 'context'>('recommended')
const selectedDetail = ref<ModelMarketModel | null>(null)

const vendorOptions = computed(() => [{ id: 'all', name: t('modelMarket.filters.allVendors'), platform: 'composite', description: '' }, ...modelMarketVendors])
const modelOptions = computed(() => [
  { id: 'all', name: t('modelMarket.filters.allModels') },
  ...modelMarketModels.filter((model) => selectedVendor.value === 'all' || model.vendorId === selectedVendor.value)
])

const filteredModels = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase()
  const models = modelMarketModels.filter((model) => {
    const vendorMatch = selectedVendor.value === 'all' || model.vendorId === selectedVendor.value
    const modelMatch = selectedModel.value === 'all' || model.id === selectedModel.value
    const queryMatch = !query || `${model.name} ${vendorName(model.vendorId)} ${model.description} ${model.capabilities.join(' ')}`.toLocaleLowerCase().includes(query)
    return vendorMatch && modelMatch && queryMatch
  })

  return [...models].sort((a, b) => {
    if (sortMode.value === 'inputPrice') return Number.parseFloat(a.inputPrice.slice(1)) - Number.parseFloat(b.inputPrice.slice(1))
    if (sortMode.value === 'context') return contextValue(b.contextLength) - contextValue(a.contextLength)
    return modelMarketModels.indexOf(a) - modelMarketModels.indexOf(b)
  })
})

function selectVendor(vendorId: string) {
  selectedVendor.value = vendorId
  selectedModel.value = 'all'
}

function vendorName(vendorId: string) {
  return modelMarketVendors.find((vendor) => vendor.id === vendorId)?.name || vendorId
}

function contextValue(value: string) {
  const amount = Number.parseFloat(value)
  if (value.includes('M')) return amount * 1_000_000
  if (value.includes('K')) return amount * 1_000
  return amount
}
</script>
