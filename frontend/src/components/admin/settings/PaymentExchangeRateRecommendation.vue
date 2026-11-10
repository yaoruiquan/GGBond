<template>
  <div class="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-dark-600 dark:bg-dark-800" data-testid="payment-exchange-rate">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ t('admin.settings.payment.exchangeRate.title') }}</p>
        <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ t('admin.settings.payment.exchangeRate.hint') }}</p>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" :disabled="loading" data-testid="exchange-rate-refresh" @click="loadRate">
        {{ t(loading ? 'common.loading' : 'admin.settings.payment.exchangeRate.refresh') }}
      </button>
    </div>
    <p v-if="error" role="alert" class="mt-3 text-sm text-red-600 dark:text-red-400">{{ error }}</p>
    <div v-if="quote" class="mt-3 space-y-2 text-sm">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="space-y-1 tabular-nums text-gray-700 dark:text-gray-200">
          <p>{{ t('admin.settings.payment.exchangeRate.reference', { cny: quote.usd_to_cny.toFixed(4) }) }}</p>
          <p class="font-medium text-primary-600 dark:text-primary-400">{{ t('admin.settings.payment.exchangeRate.recommended', { usd: quote.balance_recharge_multiplier.toFixed(8) }) }}</p>
        </div>
        <button type="button" class="btn btn-primary btn-sm" :disabled="cannotApply || alreadyApplied || !!multiplierUnavailableReason" data-testid="exchange-rate-apply" @click="emit('apply', quote.balance_recharge_multiplier)">
          {{ t(alreadyApplied ? 'admin.settings.payment.exchangeRate.applied' : 'admin.settings.payment.exchangeRate.apply') }}
        </button>
      </div>
      <div class="flex flex-wrap gap-2">
        <button type="button" class="btn btn-secondary btn-sm" :disabled="cannotApply" data-testid="exchange-rate-apply-display" @click="emit('applyDisplay', quote.usd_to_cny)">{{ t('admin.settings.payment.exchangeRate.applyDisplay') }}</button>
        <button type="button" class="btn btn-primary btn-sm" :disabled="cannotApply || !!multiplierUnavailableReason" data-testid="exchange-rate-apply-both" @click="emit('applyBoth', quote)">{{ t('admin.settings.payment.exchangeRate.applyBoth') }}</button>
      </div>
      <p v-if="multiplierUnavailableReason" role="status" class="text-xs text-amber-700 dark:text-amber-300">{{ multiplierUnavailableReason }}</p>
      <p class="text-xs text-gray-500 dark:text-gray-400">{{ t('admin.settings.payment.exchangeRate.source', { source: quote.source, date: quote.rate_date, fetched: fetchedAt }) }}</p>
      <p class="text-xs text-gray-600 dark:text-gray-300">{{ t('admin.settings.payment.exchangeRate.preview', { usd: (100 * currentMultiplier).toFixed(8), cny: (100 * currentMultiplier * (currentDisplayRate || 0)).toFixed(2) }) }}</p>
      <p class="text-xs text-amber-700 dark:text-amber-300">{{ t('admin.settings.payment.exchangeRate.priceImpact') }}</p>
      <p v-if="quote.stale" role="status" class="text-xs text-amber-700 dark:text-amber-300">{{ t('admin.settings.payment.exchangeRate.stale') }}</p>
      <p class="text-xs text-gray-500 dark:text-gray-400">{{ t('admin.settings.payment.exchangeRate.saveHint') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { getPaymentExchangeRate, type PaymentExchangeRate } from '@/api/admin/settings'

const props = defineProps<{ currentMultiplier: number; currentDisplayRate?: number; multiplierUnavailableReason?: string }>()
const emit = defineEmits<{ apply: [multiplier: number]; applyDisplay: [rate: number]; applyBoth: [quote: PaymentExchangeRate] }>()
const { t, locale } = useI18n()
const quote = ref<PaymentExchangeRate | null>(null)
let disposed = false
onBeforeUnmount(() => { disposed = true })
const loading = ref(false)
const cannotApply = computed(() => loading.value || !quote.value || quote.value.stale || !!error.value)
const error = ref('')
const alreadyApplied = computed(() => quote.value != null && Math.abs(props.currentMultiplier - quote.value.balance_recharge_multiplier) < 0.000000005)
const fetchedAt = computed(() => quote.value ? new Date(quote.value.fetched_at).toLocaleString(locale.value) : '')

async function loadRate() {
  if (loading.value) return
  loading.value = true
  error.value = ''
  try {
    const result = await getPaymentExchangeRate()
    if (!disposed) quote.value = result
  } catch {
    if (!disposed) error.value = t('admin.settings.payment.exchangeRate.error')
  } finally {
    loading.value = false
  }
}

onMounted(loadRate)
</script>
