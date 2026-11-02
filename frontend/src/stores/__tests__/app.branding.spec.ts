import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '../app'
import type { PublicSettings } from '@/types'

vi.mock('@/api/admin/system', () => ({ checkUpdates: vi.fn() }))
vi.mock('@/api/auth', () => ({ getPublicSettings: vi.fn() }))

describe('app branding defaults', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    delete window.__APP_CONFIG__
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
})
