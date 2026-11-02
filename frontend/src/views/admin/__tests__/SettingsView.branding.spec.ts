import { describe, expect, it } from 'vitest'
import { DEFAULT_SITE_NAME } from '@/constants/branding'
import enSettings from '@/i18n/locales/en/admin/settings'
import zhSettings from '@/i18n/locales/zh/admin/settings'

describe('admin settings branding defaults', () => {
  it.each([['en', enSettings], ['zh', zhSettings]] as const)('%s uses GGbond site and sender placeholders', (_locale, messages) => {
    expect(messages.settings.site.siteNamePlaceholder).toBe(DEFAULT_SITE_NAME)
    expect(messages.settings.smtp.fromNamePlaceholder).toBe(DEFAULT_SITE_NAME)
  })
})
