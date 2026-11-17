<template>
  <article class="group relative flex min-h-[430px] flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-32px_rgba(15,23,42,0.45)] transition duration-300 hover:-translate-y-1 hover:border-emerald-300 hover:shadow-[0_24px_60px_-30px_rgba(16,110,91,0.28)] dark:border-dark-700 dark:bg-dark-900 dark:hover:border-emerald-500/60">
    <div class="absolute inset-x-6 top-0 h-0.5 rounded-b-full bg-amber-200 dark:bg-amber-500/70"></div>

    <div class="flex items-start justify-between gap-4 pt-1">
      <div class="flex items-center gap-2.5">
        <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-700 ring-1 ring-slate-200 dark:bg-dark-800 dark:text-dark-100 dark:ring-dark-700">
          <PlatformIcon :platform="model.platform as GroupPlatform" size="md" />
        </span>
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-dark-500">{{ vendorName }}</p>
          <p class="mt-0.5 text-xs text-slate-400 dark:text-dark-500">{{ t('modelMarket.sample') }}</p>
        </div>
      </div>
      <span class="pt-2 text-xs font-medium tracking-wide text-slate-400 dark:text-dark-500">TOKEN</span>
    </div>

    <div class="mt-7">
      <h2 class="break-words font-mono text-[1.75rem] font-semibold tracking-[-0.04em] text-slate-950 dark:text-white">{{ model.name }}</h2>
      <p class="mt-3 min-h-[48px] text-sm leading-6 text-slate-500 dark:text-dark-300">{{ model.description }}</p>
    </div>

    <div class="mt-5 flex min-h-14 flex-wrap content-start gap-2">
      <span v-if="model.badge" class="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:border-dark-700 dark:bg-dark-800 dark:text-dark-200">{{ model.badge }}</span>
      <span v-for="capability in model.capabilities" :key="capability" class="rounded-lg border border-emerald-100 bg-emerald-50/70 px-2.5 py-1.5 text-xs font-medium text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">{{ capability }}</span>
    </div>

    <div class="mt-6 grid grid-cols-2 gap-3">
      <div class="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-dark-700 dark:bg-dark-800/70">
        <p class="text-xs font-medium text-slate-500 dark:text-dark-400">{{ t('modelMarket.card.input') }} · {{ t('modelMarket.sample') }}</p>
        <p class="mt-2 font-mono text-2xl font-semibold tracking-tight text-emerald-700 dark:text-emerald-300">{{ model.inputPrice }}</p>
        <p class="mt-1 text-xs text-slate-400 dark:text-dark-500">{{ t('modelMarket.card.perMillion') }}</p>
      </div>
      <div class="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-dark-700 dark:bg-dark-800/70">
        <p class="text-xs font-medium text-slate-500 dark:text-dark-400">{{ t('modelMarket.card.output') }} · {{ t('modelMarket.sample') }}</p>
        <p class="mt-2 font-mono text-2xl font-semibold tracking-tight text-emerald-700 dark:text-emerald-300">{{ model.outputPrice }}</p>
        <p class="mt-1 text-xs text-slate-400 dark:text-dark-500">{{ t('modelMarket.card.perMillion') }}</p>
      </div>
    </div>

    <div class="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-sm dark:border-dark-700">
      <div>
        <span class="text-slate-400 dark:text-dark-500">{{ t('modelMarket.card.context') }}</span>
        <span class="ml-2 font-mono font-medium text-slate-700 dark:text-dark-100">{{ model.contextLength }}</span>
      </div>
    </div>

    <div class="my-5 grid grid-cols-3 divide-x divide-slate-200 text-xs dark:divide-dark-700">
      <div><p class="text-slate-400 dark:text-dark-500">{{ t('modelMarket.card.cacheWrite5m') }}</p><p class="mt-2 font-mono font-semibold">{{ model.cacheWrite5mPrice ?? '—' }}</p></div>
      <div class="pl-3"><p class="text-slate-400 dark:text-dark-500">{{ t('modelMarket.card.cacheWrite1h') }}</p><p class="mt-2 font-mono font-semibold">{{ model.cacheWrite1hPrice ?? '—' }}</p></div>
      <div class="pl-3"><p class="text-slate-400 dark:text-dark-500">{{ t('modelMarket.card.cache') }}</p><p class="mt-2 font-mono font-semibold">{{ model.cacheReadPrice ?? '—' }}</p></div>
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
import { useI18n } from 'vue-i18n'
import PlatformIcon from '@/components/common/PlatformIcon.vue'
import type { GroupPlatform } from '@/types'
import type { ModelMarketModel } from '@/data/modelMarket'

defineProps<{
  model: ModelMarketModel
  vendorName: string
}>()

defineEmits<{
  select: [model: ModelMarketModel]
}>()

const { t } = useI18n()
</script>
