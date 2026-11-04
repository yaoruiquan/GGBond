import type { ModelPlazaGroup, ModelPlazaResponse, PlazaModel } from './modelPlaza'

type PricingInterval = NonNullable<PlazaModel['pricing']>['intervals'][number]

function tokenPricing(input: number, output: number, intervals: PricingInterval[] = []) {
  return {
    billing_mode: 'token' as const,
    input_price: input,
    output_price: output,
    cache_write_price: null,
    cache_read_price: null,
    image_input_price: null,
    image_output_price: null,
    per_request_price: null,
    intervals
  }
}

function officialTokenPricing(input: number, output: number, intervals: PricingInterval[] = []) {
  return {
    input_price: input,
    output_price: output,
    cache_write_price: null,
    cache_read_price: null,
    intervals
  }
}

const mockGroups: ModelPlazaGroup[] = [
  {
    id: 101,
    name: '公开低价组',
    description: '适合日常对话与代码任务',
    platform: 'openai',
    subscription_type: 'standard',
    rate_multiplier: 0.35,
    user_rate_multiplier: 0.2,
    peak_rate_enabled: true,
    peak_start: '18:00',
    peak_end: '23:00',
    peak_rate_multiplier: 1.15,
    is_exclusive: false,
    image_rate_independent: false,
    image_rate_multiplier: 1,
    video_rate_independent: false,
    video_rate_multiplier: 1,
    long_context_pricing_enabled: true,
    models: [
      {
        name: 'gpt-5.6',
        platform: 'openai',
        pricing: tokenPricing(3e-6, 15e-6),
        official_pricing: officialTokenPricing(3e-6, 15e-6),
        time_pricing: {
          timezone: 'Asia/Shanghai',
          periods: [{ start_time: '00:00:00', end_time: '08:00:00', multiplier: 0.9 }]
        }
      },
      {
        name: 'gpt-5.6-mini',
        platform: 'openai',
        pricing: tokenPricing(0.4e-6, 1.6e-6),
        official_pricing: officialTokenPricing(0.4e-6, 1.6e-6)
      }
    ]
  },
  {
    id: 102,
    name: 'Claude 长上下文',
    description: '长文档与复杂推理示例',
    platform: 'anthropic',
    subscription_type: 'subscription',
    rate_multiplier: 0.65,
    peak_rate_enabled: false,
    peak_start: '',
    peak_end: '',
    peak_rate_multiplier: 1,
    is_exclusive: true,
    image_rate_independent: false,
    image_rate_multiplier: 1,
    video_rate_independent: false,
    video_rate_multiplier: 1,
    long_context_pricing_enabled: true,
    models: [
      {
        name: 'claude-sonnet-4.5',
        platform: 'anthropic',
        pricing: tokenPricing(3e-6, 15e-6, [
          {
            min_tokens: 0,
            max_tokens: 200_000,
            tier_label: '≤200K',
            input_price: 3e-6,
            output_price: 15e-6,
            cache_write_price: 3.75e-6,
            cache_read_price: 0.3e-6,
            per_request_price: null
          },
          {
            min_tokens: 200_000,
            max_tokens: null,
            tier_label: '>200K',
            input_price: 6e-6,
            output_price: 22.5e-6,
            cache_write_price: 7.5e-6,
            cache_read_price: 0.6e-6,
            per_request_price: null
          }
        ]),
        official_pricing: officialTokenPricing(3e-6, 15e-6, [
          {
            min_tokens: 0,
            max_tokens: 200_000,
            tier_label: '≤200K',
            input_price: 3e-6,
            output_price: 15e-6,
            cache_write_price: 3.75e-6,
            cache_read_price: 0.3e-6,
            per_request_price: null
          },
          {
            min_tokens: 200_000,
            max_tokens: null,
            tier_label: '>200K',
            input_price: 6e-6,
            output_price: 22.5e-6,
            cache_write_price: 7.5e-6,
            cache_read_price: 0.6e-6,
            per_request_price: null
          }
        ])
      }
    ]
  },
  {
    id: 103,
    name: '多模态体验组',
    description: '图片与视频价格示例',
    platform: 'gemini',
    subscription_type: 'standard',
    rate_multiplier: 0.8,
    peak_rate_enabled: false,
    peak_start: '',
    peak_end: '',
    peak_rate_multiplier: 1,
    is_exclusive: false,
    image_rate_independent: true,
    image_rate_multiplier: 0.55,
    video_rate_independent: true,
    video_rate_multiplier: 0.7,
    long_context_pricing_enabled: true,
    models: [
      {
        name: 'gemini-3-pro-image-preview',
        platform: 'gemini',
        pricing: {
          billing_mode: 'image',
          input_price: null,
          output_price: null,
          cache_write_price: null,
          cache_read_price: null,
          image_input_price: null,
          image_output_price: null,
          per_request_price: 0.134,
          intervals: []
        },
        official_pricing: null
      },
      {
        name: 'grok-imagine-video',
        platform: 'grok',
        pricing: {
          billing_mode: 'video',
          input_price: null,
          output_price: null,
          cache_write_price: null,
          cache_read_price: null,
          image_input_price: null,
          image_output_price: null,
          per_request_price: 0.08,
          intervals: []
        },
        official_pricing: null
      }
    ]
  }
]

export function createMockModelPlaza(): ModelPlazaResponse {
  return {
    description: '演示数据：用于查看模型市场布局、倍率和多种计费模式。实际页面仍以当前接口返回的已接入模型为准。',
    groups: mockGroups
  }
}
