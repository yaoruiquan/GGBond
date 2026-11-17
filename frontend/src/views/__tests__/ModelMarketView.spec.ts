import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ModelMarketView from '../ModelMarketView.vue'
import ModelMarketCard from '@/components/modelMarket/ModelMarketCard.vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@/stores/app', () => ({ useAppStore: () => ({ cachedPublicSettings: null, fetchPublicSettings: vi.fn() }) }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ isAuthenticated: false, isAdmin: false }) }))

const wrappers: ReturnType<typeof mount>[] = []
function mountMarket() {
  const wrapper = mount(ModelMarketView, {
    global: { stubs: { ModelMarketNavBar: true, PlatformIcon: true, teleport: true } },
  })
  wrappers.push(wrapper)
  return wrapper
}

function button(wrapper: ReturnType<typeof mount>, text: string) {
  const match = wrapper.findAll('button').find((item) => item.text() === text)
  if (!match) throw new Error(`Button not found: ${text}`)
  return match
}

afterEach(() => { wrappers.splice(0).forEach((wrapper) => wrapper.unmount()) })

describe('independent model market', () => {
  it('shows built-in cards and resets the selected model when changing vendor', async () => {
    const wrapper = mountMarket()
    expect(wrapper.findAllComponents(ModelMarketCard)).toHaveLength(8)
    await button(wrapper, 'Anthropic / Claude').trigger('click')
    expect(wrapper.findAllComponents(ModelMarketCard)).toHaveLength(2)
    expect(wrapper.findAll('button').some((item) => item.text() === 'gpt-5.6')).toBe(false)
    await button(wrapper, 'claude-opus-4.6').trigger('click')
    expect(wrapper.findAllComponents(ModelMarketCard)).toHaveLength(1)
    await button(wrapper, 'OpenAI / GPT').trigger('click')
    expect(wrapper.findAllComponents(ModelMarketCard)).toHaveLength(2)
    expect(wrapper.findAllComponents(ModelMarketCard).map((card) => card.props('model').vendorId)).toEqual(['openai', 'openai'])
  })

  it('searches vendor names, shows an empty result, and sorts numeric prices', async () => {
    const wrapper = mountMarket()
    const search = wrapper.get('input[type="search"]')
    await search.setValue('  ANTHROPIC  ')
    expect(wrapper.findAllComponents(ModelMarketCard)).toHaveLength(2)
    await search.setValue('does-not-exist')
    expect(wrapper.find('[data-testid="model-market-grid"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('modelMarket.empty')
    await search.setValue('')
    await wrapper.get('select').setValue('inputPrice')
    expect(wrapper.findAllComponents(ModelMarketCard)[0].props('model').id).toBe('deepseek-v3.2')
    await wrapper.get('select').setValue('context')
    expect(wrapper.findAllComponents(ModelMarketCard)[0].props('model').id).toBe('gemini-3-pro')
  })

  it('opens model details and closes them with Escape', async () => {
    const wrapper = mountMarket()
    await wrapper.findAllComponents(ModelMarketCard)[0].get('button').trigger('click')
    expect(wrapper.get('[role="dialog"]').text()).toContain('gpt-5.6')
    expect(document.body.classList.contains('modal-open')).toBe(true)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(document.body.classList.contains('modal-open')).toBe(false)
  })
})
