import { computed, ref, shallowRef } from 'vue'
import { formatScaled } from '@/utils/pricing'
import type { PublicSettings } from '@/types'
import { convertBillingAmount, formatBillingAmount, isBillingRateValid, resolveBillingCurrency, type BillingCurrency } from '@/utils/billingCurrency'

export const BILLING_CURRENCY_STORAGE_KEY = 'ggbond:billing-display-currency'
const preference = ref<BillingCurrency | null>(null)
let initialized = false
const savedSettings = shallowRef<Pick<PublicSettings, 'billing_usd_to_cny_rate' | 'billing_default_display_currency'> | null>(null)

// Publish only settings confirmed by the public API or server injection.
export function setBillingDisplaySettings(settings: PublicSettings) {
  savedSettings.value = {
    billing_default_display_currency: settings.billing_default_display_currency,
    billing_usd_to_cny_rate: settings.billing_usd_to_cny_rate,
  }
}

function loadPreference() {
  if (initialized) return
  initialized = true
  try {
    const stored = localStorage.getItem(BILLING_CURRENCY_STORAGE_KEY)
    if (stored === 'CNY' || stored === 'USD') preference.value = stored
  } catch { /* Private browsing may disallow storage; the memory preference still works. */ }
}

export function useBillingCurrency() {
  loadPreference()
  const settings = computed(() => savedSettings.value ?? (typeof window !== 'undefined' ? window.__APP_CONFIG__ : undefined))
  const rate = computed(() => settings.value?.billing_usd_to_cny_rate ?? 0)
  const canUseCNY = computed(() => isBillingRateValid(rate.value))
  const requestedCurrency = computed(() => preference.value ?? (settings.value?.billing_default_display_currency === 'USD' ? 'USD' : 'CNY'))
  const currency = computed(() => resolveBillingCurrency(requestedCurrency.value, rate.value))
  const symbol = computed(() => currency.value === 'CNY' ? '¥' : '$')
  const conversionUnavailable = computed(() => requestedCurrency.value === 'CNY' && !canUseCNY.value)
  function setCurrency(value: BillingCurrency) {
    preference.value = value
    try { localStorage.setItem(BILLING_CURRENCY_STORAGE_KEY, value) } catch { /* Keep the in-memory preference. */ }
  }
  const formatMoney = (usd: number | null | undefined, digits = 2) => formatBillingAmount(usd, currency.value, rate.value, digits)
  const toDisplayAmount = (usd: number | null | undefined) => convertBillingAmount(usd, currency.value, rate.value)
  const formatPrice = (usd: number | null | undefined, scale = 1, minFractionDigits = 0) => usd == null ? '-' : formatScaled(toDisplayAmount(usd), scale, minFractionDigits).replace(/^\$/, symbol.value)
  return { formatPrice, currency, requestedCurrency, rate, symbol, canUseCNY, conversionUnavailable, setCurrency, formatMoney, toDisplayAmount }
}
