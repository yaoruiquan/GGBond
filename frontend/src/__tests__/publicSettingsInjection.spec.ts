import { afterEach, describe, expect, it, vi } from 'vitest'
import { injectPublicSettings } from '../../vite.config.ts'

// Exercise HTML injection without starting Vite's Node-only build/checker services in jsdom.
vi.mock('vite', () => ({ defineConfig: (config: unknown) => config, loadEnv: vi.fn() }))
vi.mock('@vitejs/plugin-vue', () => ({ default: vi.fn() }))
vi.mock('vite-plugin-checker', () => ({ default: vi.fn() }))

describe('development public settings injection', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('keeps contact text inside the settings script and preserves its value', async () => {
    const settings = {
      billing_default_display_currency: 'CNY',
      billing_usd_to_cny_rate: 7.23456789,
      contact_methods: [{ id: 'support', label: '</script><script>alert(1)</script>', text: '<!-- support -->', image_data_url: '', enabled: true }],
      home_contact_enabled: true,
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ code: 0, data: settings }) }))
    const hook = injectPublicSettings('http://localhost').transformIndexHtml
    if (!hook || typeof hook !== 'object' || !('handler' in hook)) throw new Error('Missing HTML injection hook')
    const result = await hook.handler('<html><head></head><body></body></html>', { path: '/', filename: 'index.html' })
    expect(typeof result).toBe('string')
    const parsed = new DOMParser().parseFromString(String(result), 'text/html')
    const scripts = parsed.querySelectorAll('script')
    expect(scripts).toHaveLength(1)
    const payload = scripts[0].textContent!.replace('window.__APP_CONFIG__=', '').replace(/;$/, '')
    expect(JSON.parse(payload)).toEqual(settings)
  })
})
