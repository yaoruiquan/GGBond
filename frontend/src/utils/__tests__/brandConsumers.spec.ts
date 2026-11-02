import { describe, expect, it } from 'vitest'

const sources = import.meta.glob('../../**/*.{vue,ts}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

describe('default brand consumers', () => {
  it('uses the branded fallback in the sidebar without replacing custom logos', () => {
    const sidebar = sources['../../components/layout/AppSidebar.vue']
    expect(sidebar).toContain(':src="siteLogo || DEFAULT_SITE_LOGO"')
    expect(sidebar).not.toContain("'/logo.svg'")
  })

  it('does not leave legacy name or logo defaults in public consumers', () => {
    const consumers = ['views/public/LegalDocumentView.vue', 'views/KeyUsageView.vue', 'components/modelPlaza/PlazaNavBar.vue', 'views/auth/RegisterView.vue', 'views/auth/EmailVerifyView.vue']
    for (const consumer of consumers) {
      expect(sources[`../../${consumer}`]).not.toContain("'/logo.svg'")
      expect(sources[`../../${consumer}`]).not.toContain("'Sub2API'")
    }
  })

  it('always initializes the document title, including a customized legacy name', () => {
    const main = sources['../../main.ts']
    expect(main).not.toContain("appStore.siteName !== 'Sub2API'")
    expect(main).toContain('appStore.siteName || DEFAULT_SITE_NAME')
  })
})
