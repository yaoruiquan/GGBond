import { describe, expect, it } from 'vitest'
import { convertBillingAmount, formatBillingAmount, resolveBillingCurrency } from '../billingCurrency'

describe('billing currency (canonical USD)', () => {
  it('converts exactly once without changing source values', () => {
    const usd = 10
    expect(convertBillingAmount(usd, 'CNY', 7.2)).toBe(72)
    expect(formatBillingAmount(0.1, 'CNY', 7.2)).toBe('¥0.72')
    expect(formatBillingAmount(usd, 'USD', 7.2)).toBe('$10.00')
    expect(usd).toBe(10)
  })
  it('falls back to correctly labeled USD when rates are missing or invalid', () => {
    for (const rate of [0, -1, undefined, NaN, Infinity, '7.2']) {
      expect(resolveBillingCurrency('CNY', rate)).toBe('USD')
      expect(formatBillingAmount(10, 'CNY', rate)).toBe('$10.00')
    }
  })
  it('handles negative, zero, missing and tiny nonzero values', () => {
    expect(formatBillingAmount(-10, 'CNY', 7.2)).toBe('-¥72.00')
    expect(formatBillingAmount(null, 'CNY', 7.2)).toBe('¥0.00')
    expect(formatBillingAmount(NaN, 'USD', 0)).toBe('$0.00')
    expect(formatBillingAmount(0.000000001, 'USD', 0, 6)).toBe('<$0.000001')
    expect(formatBillingAmount(0.00012345, 'USD', 0, 8)).toBe('$0.00012345')
  })
})
