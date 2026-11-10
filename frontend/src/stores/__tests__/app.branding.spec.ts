import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '../app'
import type { PublicSettings } from '@/types'
import { getPublicSettings } from '@/api/auth'

vi.mock('@/api/admin/system', () => ({ checkUpdates: vi.fn() }))
vi.mock('@/api/auth', () => ({ getPublicSettings: vi.fn() }))

describe('app branding defaults', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    delete window.__APP_CONFIG__
    vi.mocked(getPublicSettings).mockReset()
  })

  it('starts with the GGbond name and logo before settings arrive', () => {
    const store = useAppStore()
    expect(store.siteName).toBe('GGbond AI')
    expect(store.siteLogo).toBe('/ggbond-logo.svg')
  })

  it('falls back when injected branding is empty', () => {
    window.__APP_CONFIG__ = { site_name: '', site_logo: '' } as PublicSettings
    const store = useAppStore()
    expect(store.initFromInjectedConfig()).toBe(true)
    expect(store.siteName).toBe('GGbond AI')
    expect(store.siteLogo).toBe('/ggbond-logo.svg')
  })

  it('keeps administrator-provided branding, including the former product name', () => {
    window.__APP_CONFIG__ = { site_name: 'Sub2API', site_logo: '/tenant.svg' } as PublicSettings
    const store = useAppStore()
    store.initFromInjectedConfig()
    expect(store.siteName).toBe('Sub2API')
    expect(store.siteLogo).toBe('/tenant.svg')
  })

  it('defaults old injected settings to unpublished contacts without falling back to legacy text', () => {
    window.__APP_CONFIG__ = { contact_info: 'Legacy support' } as PublicSettings
    const store = useAppStore()
    store.initFromInjectedConfig()
    expect(store.cachedPublicSettings).toMatchObject({ home_contact_enabled: false, contact_methods: [] })
    expect(window.__APP_CONFIG__).toMatchObject({ home_contact_enabled: false, contact_methods: [] })
    expect(store.contactInfo).toBe('Legacy support')
  })

  it('replaces injected contacts on forced refresh and removes unpublished entries from the cache', async () => {
    const contact = { id: 'support', label: 'Support', text: 'old', image_data_url: '', enabled: true }
    window.__APP_CONFIG__ = { home_contact_enabled: true, contact_methods: [contact] } as PublicSettings
    const store = useAppStore()
    await store.fetchPublicSettings()
    expect(store.cachedPublicSettings?.contact_methods).toEqual([contact])
    expect(getPublicSettings).not.toHaveBeenCalled()

    vi.mocked(getPublicSettings).mockResolvedValue({
      home_contact_enabled: true,
      contact_methods: [{ ...contact, text: 'new' }, { ...contact, id: 'draft', enabled: false }],
    } as PublicSettings)
    await store.fetchPublicSettings(true)
    expect(store.cachedPublicSettings?.contact_methods).toEqual([{ ...contact, text: 'new' }])
    expect(window.__APP_CONFIG__?.contact_methods).toEqual([{ ...contact, text: 'new' }])

    vi.mocked(getPublicSettings).mockResolvedValue({ home_contact_enabled: false, contact_methods: [contact] } as PublicSettings)
    await store.fetchPublicSettings(true)
    expect(store.cachedPublicSettings?.contact_methods).toEqual([])
  })
})
