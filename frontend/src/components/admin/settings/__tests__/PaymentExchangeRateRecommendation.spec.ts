import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import PaymentExchangeRateRecommendation from '../PaymentExchangeRateRecommendation.vue'

const { getPaymentExchangeRate } = vi.hoisted(() => ({ getPaymentExchangeRate: vi.fn() }))
vi.mock('@/api/admin/settings', () => ({ getPaymentExchangeRate }))
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    locale: ref('zh-CN'),
    t: (key: string, params?: Record<string, unknown>) => `${key} ${Object.values(params ?? {}).join(' ')}`.trim()
  })
}))

const quote = {
  usd_to_cny: 7.2,
  balance_recharge_multiplier: 0.13888889,
  rate_date: '2026-11-09',
  fetched_at: '2026-11-10T10:00:00Z',
  source: 'Frankfurter / ECB',
  stale: false
}

describe('PaymentExchangeRateRecommendation', () => {
  beforeEach(() => getPaymentExchangeRate.mockReset().mockResolvedValue({ ...quote }))

  it('shows the dated reference and exact recommendation without applying it on load', async () => {
    const wrapper = mount(PaymentExchangeRateRecommendation, { props: { currentMultiplier: 1 } })
    await flushPromises()
    expect(wrapper.text()).toContain('7.2000')
    expect(wrapper.text()).toContain('0.13888889')
    expect(wrapper.text()).toContain('2026-11-09')
    expect(wrapper.text()).toContain('Frankfurter / ECB')
    expect(wrapper.emitted('apply')).toBeUndefined()

    await wrapper.get('[data-testid="exchange-rate-apply"]').trigger('click')
    expect(wrapper.emitted('apply')).toEqual([[0.13888889]])
    await wrapper.setProps({ currentMultiplier: 0.13888889 })
    expect(wrapper.get('[data-testid="exchange-rate-apply"]').attributes('disabled')).toBeDefined()
  })

  it('fills the display rate or both fields only after explicit clicks', async () => {
    const wrapper = mount(PaymentExchangeRateRecommendation, { props: { currentMultiplier: 1, currentDisplayRate: 0 } })
    await flushPromises()
    expect(wrapper.emitted('applyDisplay')).toBeUndefined()
    expect(wrapper.emitted('applyBoth')).toBeUndefined()
    await wrapper.get('[data-testid="exchange-rate-apply-display"]').trigger('click')
    expect(wrapper.emitted('applyDisplay')).toEqual([[7.2]])
    expect(wrapper.emitted('apply')).toBeUndefined()
    await wrapper.get('[data-testid="exchange-rate-apply-both"]').trigger('click')
    expect(wrapper.emitted('applyBoth')).toEqual([[quote]])
  })

  it('keeps display-rate filling available when payment currencies block the shared multiplier', async () => {
    const wrapper = mount(PaymentExchangeRateRecommendation, {
      props: { currentMultiplier: 1, multiplierUnavailableReason: 'USD channel uses the shared multiplier' }
    })
    await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toContain('USD channel')
    expect(wrapper.get('[data-testid="exchange-rate-apply"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="exchange-rate-apply-both"]').attributes('disabled')).toBeDefined()
    await wrapper.get('[data-testid="exchange-rate-apply-display"]').trigger('click')
    expect(wrapper.emitted('applyDisplay')).toEqual([[7.2]])
    expect(wrapper.emitted('apply')).toBeUndefined()
    expect(wrapper.emitted('applyBoth')).toBeUndefined()
  })

  it('keeps the existing multiplier on failure and supports retry', async () => {
    getPaymentExchangeRate.mockRejectedValueOnce(new Error('offline'))
    const wrapper = mount(PaymentExchangeRateRecommendation, { props: { currentMultiplier: 1 } })
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('exchangeRate.error')
    expect(wrapper.emitted('apply')).toBeUndefined()
    expect(wrapper.find('[data-testid="exchange-rate-apply"]').exists()).toBe(false)
    await wrapper.get('[data-testid="exchange-rate-refresh"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="exchange-rate-apply"]').attributes('disabled')).toBeUndefined()
  })

  it('labels cached outage data and prevents filling it as a fresh recommendation', async () => {
    getPaymentExchangeRate.mockResolvedValue({ ...quote, stale: true })
    const wrapper = mount(PaymentExchangeRateRecommendation, { props: { currentMultiplier: 1 } })
    await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toContain('exchangeRate.stale')
    expect(wrapper.get('[data-testid="exchange-rate-apply"]').attributes('disabled')).toBeDefined()
    expect(wrapper.emitted('apply')).toBeUndefined()
  })

  it('disables the previous recommendation when its refresh fails', async () => {
    const wrapper = mount(PaymentExchangeRateRecommendation, { props: { currentMultiplier: 1 } })
    await flushPromises()
    getPaymentExchangeRate.mockRejectedValueOnce(new Error('offline'))
    await wrapper.get('[data-testid="exchange-rate-refresh"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="exchange-rate-apply"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[role="alert"]').exists()).toBe(true)
    expect(wrapper.emitted('apply')).toBeUndefined()
  })
})
