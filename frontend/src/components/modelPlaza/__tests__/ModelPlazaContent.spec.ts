import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ModelPlazaContent from '../ModelPlazaContent.vue'
import type { ModelPlazaResponse, PlazaModel } from '@/api/modelPlaza'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (!params) return key
      return `${key}:${Object.values(params).join(',')}`
    }
  })
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ isAuthenticated: true })
}))

function model(name: string, input = 3e-6, output = 1.5e-5): PlazaModel {
  return {
    name,
    platform: 'openai',
    pricing: {
      billing_mode: 'token',
      input_price: input,
      output_price: output,
      cache_write_price: null,
      cache_read_price: null,
      image_input_price: null,
      image_output_price: null,
      per_request_price: null,
      intervals: []
    },
    official_pricing: {
      input_price: input,
      output_price: output,
      cache_write_price: null,
      cache_read_price: null
    }
  }
}

function response(): ModelPlazaResponse {
  return {
    description: '',
    groups: [
      {
        id: 1,
        name: '标准组',
        description: '',
        platform: 'openai',
        subscription_type: 'standard',
        rate_multiplier: 0.5,
        user_rate_multiplier: 0.2,
        peak_rate_enabled: false,
        peak_start: '',
        peak_end: '',
        peak_rate_multiplier: 1,
        is_exclusive: false,
        image_rate_independent: false,
        image_rate_multiplier: 1,
        video_rate_independent: false,
        video_rate_multiplier: 1,
        long_context_pricing_enabled: true,
        models: [model('gpt-5.6')]
      },
      {
        id: 2,
        name: '订阅组',
        description: '',
        platform: 'openai',
        subscription_type: 'subscription',
        rate_multiplier: 1,
        peak_rate_enabled: false,
        peak_start: '',
        peak_end: '',
        peak_rate_multiplier: 1,
        is_exclusive: false,
        image_rate_independent: false,
        image_rate_multiplier: 1,
        video_rate_independent: false,
        video_rate_multiplier: 1,
        long_context_pricing_enabled: true,
        models: [model('gpt-5.6'), model('claude-sonnet')]
      }
    ]
  }
}

function mountMarket(data: ModelPlazaResponse | null) {
  return mount(ModelPlazaContent, {
    props: { response: data, loading: false },
    global: { stubs: { Icon: true, PlatformIcon: true } }
  })
}

describe('ModelPlazaContent model market', () => {
  it('keeps duplicate model rows when groups have different rates and applies a user rate', () => {
    const wrapper = mountMarket(response())
    expect(wrapper.findAll('tbody tr')).toHaveLength(3)
    expect(wrapper.text()).toContain('0.2x modelPlaza.table.input $0.60 · modelPlaza.table.output $3.00')
    expect(wrapper.text()).toContain('1x modelPlaza.table.input $3.00 · modelPlaza.table.output $15.00')
    expect(wrapper.text()).toContain('modelPlaza.resultCount:3')
  })

  it('filters by model search and group', async () => {
    const wrapper = mountMarket(response())
    const search = wrapper.find('input[type="search"]')
    await search.setValue('claude')
    expect(wrapper.findAll('tbody tr')).toHaveLength(1)
    expect(wrapper.text()).toContain('claude-sonnet')

    await search.setValue('')
    await wrapper.findAll('select')[2].setValue('1')
    expect(wrapper.findAll('tbody tr')).toHaveLength(1)
    expect(wrapper.text()).toContain('标准组')
  })

  it('shows the connected-model empty state without inventing rows', () => {
    const wrapper = mountMarket({ description: '', groups: [] })
    expect(wrapper.find('tbody').exists()).toBe(false)
    expect(wrapper.text()).toContain('modelPlaza.empty')
  })
})
