import { describe, expect, it } from 'vitest'
import en from '../locales/en'
import zh from '../locales/zh'
import enLanding from '../locales/en/landing'
import zhLanding from '../locales/zh/landing'
import { featuredProviderIds } from '@/views/home/showcaseModels'

describe.each([
  ['en', en, enLanding], ['zh', zh, zhLanding],
] as const)('%s brand locale', (_locale, messages, landing) => {
  it('keeps existing landing keys while adding brand copy', () => {
    expect(messages.home.features).toEqual(landing.home.features)
    expect(messages.home.heroTitleLead.trim()).not.toBe('')
    expect(messages.home.heroTitleTail.trim()).not.toBe('')
    expect(messages.ggbond.apiGuide.title).toContain('GGbond AI')
    expect(messages.ggbond.plans.title).toContain('GGbond AI')
  })

  it('contains dynamic featured-provider messages for every rotating card', () => {
    for (const id of featuredProviderIds) {
      expect(messages.home.featured[id].category.trim()).not.toBe('')
      expect(messages.home.featured[id].description.trim()).not.toBe('')
    }
  })
})
