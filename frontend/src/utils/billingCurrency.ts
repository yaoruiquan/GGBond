export type BillingCurrency = 'CNY' | 'USD'

export function isBillingRateValid(rate: unknown): rate is number {
  return typeof rate === 'number' && Number.isFinite(rate) && rate > 0
}

export function resolveBillingCurrency(currency: unknown, rate: unknown): BillingCurrency {
  return currency === 'CNY' && isBillingRateValid(rate) ? 'CNY' : 'USD'
}

// Inputs are canonical USD. Billing multipliers must already have been applied.
export function convertBillingAmount(usd: number | null | undefined, currency: BillingCurrency, rate: unknown): number {
  const amount = typeof usd === 'number' && Number.isFinite(usd) ? usd : 0
  const converted = currency === 'CNY' && isBillingRateValid(rate) ? amount * rate : amount
  return Number.isFinite(converted) ? converted : 0
}

export function formatBillingAmount(usd: number | null | undefined, currency: BillingCurrency, rate: unknown, digits = 2): string {
  const effective = resolveBillingCurrency(currency, rate)
  const amount = convertBillingAmount(usd, effective, rate)
  const precision = Math.min(12, Math.max(0, Math.trunc(digits)))
  const symbol = effective === 'CNY' ? '¥' : '$'
  // Preserve visible evidence of tiny nonzero usage rather than showing a false zero.
  if (amount !== 0 && Math.abs(amount) < 0.5 * 10 ** -precision) {
    return `${amount < 0 ? '-' : ''}<${symbol}${(10 ** -precision).toFixed(precision)}`
  }
  return `${amount < 0 ? '-' : ''}${symbol}${Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: precision, maximumFractionDigits: precision, useGrouping: false })}`
}
