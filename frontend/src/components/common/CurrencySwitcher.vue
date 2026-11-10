<template>
  <label class="inline-flex shrink-0 items-center" :title="hint">
    <span class="sr-only">{{ t('common.billingCurrency.label') }}</span>
    <select :value="currency" class="max-w-28 rounded-lg border border-gray-200 bg-transparent px-1.5 py-1.5 text-xs text-gray-700 dark:border-dark-600 dark:text-gray-200 sm:text-sm" :aria-label="t('common.billingCurrency.label')" @change="setCurrency(($event.target as HTMLSelectElement).value as BillingCurrency)">
      <option value="CNY" :disabled="!canUseCNY">{{ t('common.billingCurrency.cny') }}</option>
      <option value="USD">{{ t('common.billingCurrency.usd') }}</option>
    </select>
    <span v-if="conversionUnavailable" class="ml-1 text-amber-600" role="status" :aria-label="hint">ⓘ</span>
  </label>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useBillingCurrency } from '@/composables/useBillingCurrency'
import type { BillingCurrency } from '@/utils/billingCurrency'
const { t } = useI18n()
const { currency, rate, canUseCNY, conversionUnavailable, setCurrency } = useBillingCurrency()
const hint = computed(() => canUseCNY.value ? t('common.billingCurrency.hint', { rate: rate.value }) : t('common.billingCurrency.unavailable'))
</script>
