// Illustrative catalogue entries bundled with the page; these are not live model,
// availability, context-limit, or billing data from the current gateway instance.
export type ModelMarketVendor = {
  id: string
  name: string
  platform: string
  description: string
}

export type ModelMarketModel = {
  id: string
  name: string
  vendorId: string
  platform: string
  description: string
  capabilities: string[]
  contextLength: string
  inputPrice: string
  outputPrice: string
  cacheReadPrice?: string
  cacheWrite5mPrice?: string
  cacheWrite1hPrice?: string
  badge?: string
}

export const modelMarketVendors: ModelMarketVendor[] = [
  { id: 'openai', name: 'OpenAI / GPT', platform: 'openai', description: '通用对话、推理与代码模型' },
  { id: 'anthropic', name: 'Anthropic / Claude', platform: 'anthropic', description: '长文本理解与复杂任务' },
  { id: 'google', name: 'Google / Gemini', platform: 'gemini', description: '多模态与长上下文模型' },
  { id: 'xai', name: 'xAI / Grok', platform: 'grok', description: '实时信息与开放式对话' },
  { id: 'deepseek', name: 'DeepSeek', platform: 'deepseek', description: '高性价比推理与代码' },
  { id: 'moonshot', name: 'Moonshot / Kimi', platform: 'kimi', description: '中文长文本与智能助手' }
]

export const modelMarketModels: ModelMarketModel[] = [
  {
    id: 'gpt-5.6',
    name: 'gpt-5.6',
    vendorId: 'openai',
    platform: 'openai',
    description: '面向复杂推理、代码生成和通用生产任务的旗舰模型。',
    capabilities: ['文本', '推理', '工具调用'],
    contextLength: '400K tokens',
    inputPrice: '$3.00',
    outputPrice: '$15.00',
    cacheReadPrice: '$0.30',
    badge: '旗舰推荐',
  },
  {
    id: 'gpt-5.6-mini',
    name: 'gpt-5.6-mini',
    vendorId: 'openai',
    platform: 'openai',
    description: '响应更快、成本更低，适合高频对话和批量任务。',
    capabilities: ['文本', '代码', '工具调用'],
    contextLength: '200K tokens',
    inputPrice: '$0.40',
    outputPrice: '$1.60',
    cacheReadPrice: '$0.04',
    badge: '高性价比',
  },
  {
    id: 'claude-sonnet-4.5',
    name: 'claude-sonnet-4.5',
    vendorId: 'anthropic',
    platform: 'anthropic',
    description: '平衡速度与质量，适合长文档、代码审查和知识工作。',
    capabilities: ['文本', '视觉', '长上下文'],
    contextLength: '200K tokens',
    inputPrice: '$3.00',
    outputPrice: '$15.00',
    cacheReadPrice: '$0.30',
    cacheWrite5mPrice: '$3.75',
    cacheWrite1hPrice: '$6.00',
    badge: '稳定首选',
  },
  {
    id: 'claude-opus-4.6',
    name: 'claude-opus-4.6',
    vendorId: 'anthropic',
    platform: 'anthropic',
    description: '面向深度分析、复杂代理和高难度代码任务。',
    capabilities: ['文本', '视觉', '深度推理'],
    contextLength: '200K tokens',
    inputPrice: '$5.00',
    outputPrice: '$25.00',
    cacheReadPrice: '$0.50',
    cacheWrite5mPrice: '$6.25',
    cacheWrite1hPrice: '$10.00',
    badge: '深度推理',
  },
  {
    id: 'gemini-3-pro',
    name: 'gemini-3-pro',
    vendorId: 'google',
    platform: 'gemini',
    description: '支持文本、图片和文件输入的多模态模型。',
    capabilities: ['文本', '视觉', '文件'],
    contextLength: '1M tokens',
    inputPrice: '$1.25',
    outputPrice: '$10.00',
    cacheReadPrice: '$0.31',
    badge: '超长上下文',
  },
  {
    id: 'grok-4',
    name: 'grok-4',
    vendorId: 'xai',
    platform: 'grok',
    description: '适合开放式问答、实时信息整理和快速头脑风暴。',
    capabilities: ['文本', '推理', '实时信息'],
    contextLength: '256K tokens',
    inputPrice: '$3.00',
    outputPrice: '$15.00',
    badge: '实时探索',
  },
  {
    id: 'deepseek-v3.2',
    name: 'deepseek-v3.2',
    vendorId: 'deepseek',
    platform: 'deepseek',
    description: '面向中文场景、代码生成和日常自动化的高性价比模型。',
    capabilities: ['文本', '代码', '中文'],
    contextLength: '128K tokens',
    inputPrice: '$0.27',
    outputPrice: '$1.10',
    cacheReadPrice: '$0.07',
    badge: '低价优选',
  },
  {
    id: 'kimi-k2.5',
    name: 'kimi-k2.5',
    vendorId: 'moonshot',
    platform: 'kimi',
    description: '中文长文本助手，适合资料整理、写作和问答。',
    capabilities: ['文本', '中文', '长上下文'],
    contextLength: '256K tokens',
    inputPrice: '$0.60',
    outputPrice: '$2.50',
    badge: '中文推荐',
  }
]
