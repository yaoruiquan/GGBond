/**
 * 首页轨道展示的厂商列表。
 * `model` 是一个能被 ModelIcon 识别的示例模型名，只用来取图标。
 * 哪个厂商实际没接入，删掉对应的一行即可。
 */

export interface ShowcaseProvider {
  id: string
  name: string
  model: string
}

// 按展示优先级排序：靠前的放内圈，手机端只显示前几个
export const showcaseProviders: readonly ShowcaseProvider[] = [
  { id: 'claude', name: 'Claude', model: 'claude' },
  { id: 'openai', name: 'GPT', model: 'gpt' },
  { id: 'deepseek', name: 'DeepSeek', model: 'deepseek' },
  { id: 'gemini', name: 'Gemini', model: 'gemini' },
  { id: 'qwen', name: '通义千问', model: 'qwen' },
  { id: 'xai', name: 'Grok', model: 'grok' },
  { id: 'doubao', name: '豆包', model: 'doubao' },
  { id: 'moonshot', name: 'Kimi', model: 'kimi' },
  { id: 'zhipu', name: '智谱 GLM', model: 'glm' },
  { id: 'minimax', name: 'MiniMax', model: 'minimax' },
  { id: 'mistral', name: 'Mistral', model: 'mistral' },
  { id: 'meta', name: 'Llama', model: 'llama' },
  { id: 'wenxin', name: '文心', model: 'ernie' },
  { id: 'hunyuan', name: '混元', model: 'hunyuan' },
  { id: 'spark', name: '讯飞星火', model: 'spark' },
  { id: 'yi', name: '零一万物', model: 'yi-' },
  { id: 'cohere', name: 'Cohere', model: 'command' },
  { id: 'perplexity', name: 'Perplexity', model: 'perplexity' },
  { id: 'midjourney', name: 'Midjourney', model: 'midjourney' },
  { id: 'suno', name: 'Suno', model: 'suno' },
  { id: 'jina', name: 'Jina', model: 'jina' },
  { id: 'openrouter', name: 'OpenRouter', model: 'openrouter' },
  { id: 'ollama', name: 'Ollama', model: 'ollama' },
  { id: 'ai360', name: '360 智脑', model: '360' },
  { id: 'coze', name: 'Coze', model: 'coze' },
  { id: 'dify', name: 'Dify', model: 'dify' },
  { id: 'cloudflare', name: 'Cloudflare', model: '@cf/' }
]

// 两侧精选卡轮换展示的厂商；文案 key 在 i18n 的 home.featured.<id> 下
export const featuredProviderIds = ['claude', 'openai', 'deepseek'] as const

export type FeaturedProviderId = (typeof featuredProviderIds)[number]
