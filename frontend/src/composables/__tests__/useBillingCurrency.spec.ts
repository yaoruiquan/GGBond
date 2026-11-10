import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

// Reload the preference module to simulate a fresh browser document.
async function load() { return (await import('../useBillingCurrency')).useBillingCurrency() }
beforeEach(() => {
  vi.resetModules()
  setActivePinia(createPinia())
  localStorage.clear()
  window.__APP_CONFIG__ = undefined
})

describe('shared billing preference', () => {
  it('uses injected CNY settings on first render and persists a USD preference', async () => {
    window.__APP_CONFIG__ = { billing_default_display_currency: 'CNY', billing_usd_to_cny_rate: 7.2 } as never
    const first = await load()
    expect(first.currency.value).toBe('CNY')
    expect(first.formatMoney(10)).toBe('¥72.00')
    const second = await load()
    first.setCurrency('USD')
    expect(second.currency.value).toBe('USD')
    vi.resetModules()
    expect((await load()).currency.value).toBe('USD')
  })
  it('responds to saved settings and safely falls back without a rate', async () => {
    const billing = await load()
    expect(billing.currency.value).toBe('USD')
    expect(billing.conversionUnavailable.value).toBe(true)
    const { setBillingDisplaySettings } = await import('../useBillingCurrency')
    setBillingDisplaySettings({ billing_usd_to_cny_rate: 7.2 } as never)
    expect(billing.currency.value).toBe('CNY')
    expect(billing.formatMoney(0.1)).toBe('¥0.72')
  })
  it('ignores corrupt storage and tolerates storage failures', async () => {
    localStorage.setItem('ggbond:billing-display-currency', 'bad')
    window.__APP_CONFIG__ = { billing_usd_to_cny_rate: 7.2 } as never
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw Error('blocked') })
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('blocked') })
    const billing = await load()
    expect(billing.currency.value).toBe('CNY')
    expect(() => billing.setCurrency('USD')).not.toThrow()
    expect(billing.currency.value).toBe('USD')
    get.mockRestore(); set.mockRestore()
  })
})
