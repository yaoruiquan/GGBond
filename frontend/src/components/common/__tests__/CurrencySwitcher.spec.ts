import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import CurrencySwitcher from '../CurrencySwitcher.vue'
import { setBillingDisplaySettings, useBillingCurrency } from '@/composables/useBillingCurrency'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
const Sample = defineComponent({
  components: { CurrencySwitcher },
  setup() { return useBillingCurrency() },
  template: '<CurrencySwitcher /><output>{{ formatMoney(10) }}</output>',
})
beforeEach(() => {
  setBillingDisplaySettings({ billing_usd_to_cny_rate: 7.2, billing_default_display_currency: 'CNY' } as never)
  useBillingCurrency().setCurrency('CNY')
})

describe('currency switcher', () => {
  it('updates other amounts immediately and stores the preference without network requests', async () => {
    const fetch = vi.spyOn(window, 'fetch')
    const wrapper = mount(Sample)
    expect(wrapper.get('output').text()).toBe('¥72.00')
    await wrapper.get('select').setValue('USD')
    expect(wrapper.get('output').text()).toBe('$10.00')
    expect(localStorage.getItem('ggbond:billing-display-currency')).toBe('USD')
    expect(fetch).not.toHaveBeenCalled()
    wrapper.unmount()
    fetch.mockRestore()
  })
  it('explains fallback and disables CNY when no saved rate is available', () => {
    setBillingDisplaySettings({ billing_usd_to_cny_rate: 0 } as never)
    const wrapper = mount(Sample)
    expect(wrapper.get('output').text()).toBe('$10.00')
    expect(wrapper.get('option[value="CNY"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[role="status"]').attributes('aria-label')).toContain('unavailable')
    wrapper.unmount()
  })
})
