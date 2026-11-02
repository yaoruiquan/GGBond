import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import BrandLockup from '../BrandLockup.vue'

describe('BrandLockup', () => {
  afterEach(() => vi.restoreAllMocks())

  it('uses GGbond branding by default', () => {
    const wrapper = mount(BrandLockup)
    expect(wrapper.text()).toContain('GGbond AI')
    expect(wrapper.get('img').attributes()).toMatchObject({ src: '/ggbond-logo.svg', alt: 'GGbond AI' })
  })

  it.each(['', 'javascript:alert(1)', 'data:text/html,hello'])('falls back for an empty or unsafe logo: %s', (logo) => {
    expect(mount(BrandLockup, { props: { logo } }).get('img').attributes('src')).toBe('/ggbond-logo.svg')
  })

  it.each(['/tenant.svg', 'https://example.com/tenant.png', 'data:image/png;base64,aGVsbG8='])('preserves a valid custom logo: %s', (logo) => {
    const wrapper = mount(BrandLockup, { props: { name: 'Tenant', logo, subtitle: 'Custom API', compact: true } })
    expect(wrapper.get('img').attributes()).toMatchObject({ src: logo, alt: 'Tenant' })
    expect(wrapper.text()).toContain('Custom API')
  })

  it('can hide its text label', () => {
    expect(mount(BrandLockup, { props: { showText: false } }).find('p').exists()).toBe(false)
  })
})
