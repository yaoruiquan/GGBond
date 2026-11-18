import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ModelMarketView from '../ModelMarketView.vue'
import ModelMarketCard from '@/components/modelMarket/ModelMarketCard.vue'
import { getModelMarket, type ModelPlazaResponse } from '@/api/modelPlaza'
import { toModelMarketModels } from '@/data/modelMarket'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string, values?: Record<string, unknown>) => `${key}${values ? ` ${Object.values(values).join(' ')}` : ''}` }) }))
vi.mock('@/stores/app', () => ({ useAppStore: () => ({ cachedPublicSettings: null, fetchPublicSettings: vi.fn() }) }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ isAuthenticated: false, isAdmin: false }) }))
vi.mock('@/api/modelPlaza', () => ({ getModelMarket: vi.fn() }))

const liveGroups = [
  {
    id: 1, name: 'GPT 官方组', description: '真实分组说明', platform: 'openai', subscription_type: 'standard', rate_multiplier: 1.5, user_rate_multiplier: 2,
    peak_rate_enabled: true, peak_start: '18:00', peak_end: '22:00', peak_rate_multiplier: 1.25, is_exclusive: false,
    image_rate_independent: false, image_rate_multiplier: 1, video_rate_independent: false, video_rate_multiplier: 1,
    long_context_pricing_enabled: false,
    models: [{ name: 'gpt-live', platform: 'openai', pricing: { billing_mode: 'token', input_price: 0.000002, output_price: 0.00001, cache_write_price: null, cache_read_price: null, image_input_price: null, image_output_price: null, per_request_price: null, intervals: [] }, official_pricing: null, time_pricing: { timezone: 'Asia/Shanghai', weekdays_only: true, periods: [{ start_time: '09:00', end_time: '10:00', multiplier: 1.5 }] } }]
  },
  {
    id: 3, name: 'GPT 优惠组', description: '', platform: 'openai', subscription_type: 'standard', rate_multiplier: 0.75,
    peak_rate_enabled: false, peak_start: '', peak_end: '', peak_rate_multiplier: 1, is_exclusive: false,
    image_rate_independent: false, image_rate_multiplier: 1, video_rate_independent: false, video_rate_multiplier: 1,
    long_context_pricing_enabled: false,
    models: [{ name: 'gpt-live', platform: 'openai', pricing: { billing_mode: 'token', input_price: 0.000002, output_price: 0.00001, cache_write_price: null, cache_read_price: null, image_input_price: null, image_output_price: null, per_request_price: null, intervals: [] }, official_pricing: null }]
  },
  {
    id: 2, name: 'Claude 特惠组', description: '', platform: 'anthropic', subscription_type: 'standard', rate_multiplier: 0.8,
    peak_rate_enabled: false, peak_start: '', peak_end: '', peak_rate_multiplier: 1, is_exclusive: false,
    image_rate_independent: false, image_rate_multiplier: 1, video_rate_independent: false, video_rate_multiplier: 1,
    long_context_pricing_enabled: false,
    models: [{ name: 'claude-live', platform: 'anthropic', pricing: { billing_mode: 'token', input_price: null, output_price: null, cache_write_price: null, cache_read_price: null, image_input_price: null, image_output_price: null, per_request_price: null, intervals: [] }, official_pricing: null }]
  }
] as unknown as ModelPlazaResponse['groups']

const wrappers: ReturnType<typeof mount>[] = []
function mountMarket() {
  const wrapper = mount(ModelMarketView, {
    global: { stubs: { ModelMarketNavBar: true, PlatformIcon: true, teleport: true } },
  })
  wrappers.push(wrapper)
  return flushPromises().then(() => wrapper)
}

function button(wrapper: ReturnType<typeof mount>, text: string) {
  const match = wrapper.findAll('button').find((item) => item.text() === text)
  if (!match) throw new Error(`Button not found: ${text}`)
  return match
}

afterEach(() => { wrappers.splice(0).forEach((wrapper) => wrapper.unmount()) })
beforeEach(() => vi.mocked(getModelMarket).mockResolvedValue({ description: '', groups: liveGroups }))

describe('independent model market', () => {
  it('renders only models supplied by live groups and scopes model filters to vendor', async () => {
    const wrapper = await mountMarket()
    expect(wrapper.findAllComponents(ModelMarketCard)).toHaveLength(3)
    expect(wrapper.text()).toContain('GPT 官方组')
    expect(wrapper.text()).toContain('claude-live')
    await button(wrapper, 'Anthropic').trigger('click')
    expect(wrapper.findAllComponents(ModelMarketCard)).toHaveLength(1)
    expect(wrapper.findAll('button').some((item) => item.text() === 'gpt-live')).toBe(false)
    await button(wrapper, 'OpenAI').trigger('click')
    expect(wrapper.findAllComponents(ModelMarketCard)).toHaveLength(2)
    await button(wrapper, 'gpt-live').trigger('click')
    expect(wrapper.findAllComponents(ModelMarketCard)).toHaveLength(2)
  })

  it('keeps a group visible when it does not have a concrete model list', async () => {
    vi.mocked(getModelMarket).mockResolvedValueOnce({
      description: '',
      groups: [...liveGroups, { ...liveGroups[2], id: 4, name: 'Gemini 接入组', platform: 'gemini', models: [] }]
    })
    const wrapper = await mountMarket()
    expect(wrapper.findAllComponents(ModelMarketCard)).toHaveLength(3)
    expect(wrapper.text()).toContain('Gemini 接入组')
    await button(wrapper, 'Gemini').trigger('click')
    expect(wrapper.findAllComponents(ModelMarketCard)).toHaveLength(0)
    expect(wrapper.text()).toContain('Gemini 接入组')
    expect(wrapper.text()).toContain('×0.8')
  })

  it('searches actual group/model names and sorts numeric live prices', async () => {
    const wrapper = await mountMarket()
    const search = wrapper.get('input[type="search"]')
    await search.setValue('  真实分组说明  ')
    expect(wrapper.findAllComponents(ModelMarketCard)).toHaveLength(1)
    await search.setValue('does-not-exist')
    expect(wrapper.find('[data-testid="model-market-grid"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('modelMarket.empty')
    await search.setValue('')
    await wrapper.get('select').setValue('inputPrice')
    expect(wrapper.findAllComponents(ModelMarketCard)[0].props('model').id).toBe('3:openai:gpt-live')
  })

  it('shows the effective group multiplier and actual price in details', async () => {
    const wrapper = await mountMarket()
    const firstModel = wrapper.findAllComponents(ModelMarketCard).find((card) => card.props('model').groupId === 1)!
    expect(firstModel.text()).toContain('×2')
    expect(firstModel.text()).toContain('1.25 2.5 18:00 22:00')
    expect(firstModel.text()).toContain('Asia/Shanghai 09:00 10:00 1.5 3')
    expect(firstModel.text()).toContain('USD 4')
    await firstModel.get('button').trigger('click')
    expect(wrapper.get('[role="dialog"]').text()).toContain('×2')
    expect(wrapper.get('[role="dialog"]').text()).toContain('真实分组说明')
  })

  it('opens model details and closes them with Escape', async () => {
    const wrapper = await mountMarket()
    const firstCard = wrapper.findAllComponents(ModelMarketCard)[0]
    const modelName = firstCard.props('model').name
    await firstCard.get('button').trigger('click')
    expect(wrapper.get('[role="dialog"]').text()).toContain(modelName)
    expect(document.body.classList.contains('modal-open')).toBe(true)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(document.body.classList.contains('modal-open')).toBe(false)
  })

  it('shows request failures without falling back to invented catalogue data', async () => {
    vi.mocked(getModelMarket).mockRejectedValueOnce(new Error('offline'))
    const wrapper = await mountMarket()
    expect(wrapper.find('[data-testid="model-market-error"]').exists()).toBe(true)
    expect(wrapper.findAllComponents(ModelMarketCard)).toHaveLength(0)
  })

  it('uses an independent image rate instead of the group rate', () => {
    const group = {
      ...liveGroups[0], image_rate_independent: true, image_rate_multiplier: 0.4,
      models: [{ name: 'image-live', platform: 'openai', pricing: { billing_mode: 'image', input_price: null, output_price: null, cache_write_price: null, cache_read_price: null, image_input_price: null, image_output_price: null, per_request_price: 0.5, intervals: [] }, official_pricing: null }]
    }
    const [model] = toModelMarketModels([group])
    expect(model.multiplier).toBe(0.4)
    expect(model.multiplierKind).toBe('image')
    expect(model.requestPrice).toBe(0.2)
  })

  it('labels video pricing by second in cards and details', async () => {
    const group = {
      ...liveGroups[0],
      peak_rate_enabled: false,
      models: [{ name: 'video-live', platform: 'openai', pricing: { billing_mode: 'video', input_price: null, output_price: null, cache_write_price: null, cache_read_price: null, image_input_price: null, image_output_price: null, per_request_price: 0.02, intervals: [] }, official_pricing: null }]
    }
    vi.mocked(getModelMarket).mockResolvedValueOnce({ description: '', groups: [group] as unknown as ModelPlazaResponse['groups'] })
    const wrapper = await mountMarket()
    expect(wrapper.findAllComponents(ModelMarketCard)[0].text()).toContain('modelMarket.card.perSecondUnit')
    await wrapper.findComponent(ModelMarketCard).get('button').trigger('click')
    expect(wrapper.get('[role="dialog"]').text()).toContain('modelMarket.card.perSecondUnit')
  })
})
