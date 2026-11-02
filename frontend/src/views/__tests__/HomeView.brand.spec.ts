import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import HomeView from '../HomeView.vue'

const { appStore, authStore } = vi.hoisted(() => ({
  appStore: {
    cachedPublicSettings: {} as Record<string, unknown>,
    siteName: '', siteLogo: '', docUrl: '', publicSettingsLoaded: true,
    fetchPublicSettings: vi.fn(),
  },
  authStore: { isAuthenticated: false, isAdmin: false, checkAuth: vi.fn() },
}))
vi.mock('@/stores', () => ({ useAppStore: () => appStore, useAuthStore: () => authStore }))
vi.mock('@/stores/app', () => ({ useAppStore: () => appStore }))
vi.mock('vue-i18n', async (original) => ({
  ...await original<typeof import('vue-i18n')>(),
  useI18n: () => ({ t: (key: string) => key }),
}))

const wrappers: ReturnType<typeof mount>[] = []
function mountHome(settings: Record<string, unknown> = {}) {
  appStore.cachedPublicSettings = settings
  const wrapper = mount(HomeView, {
    global: {
      stubs: {
        RouterLink: RouterLinkStub, LocaleSwitcher: true, Icon: true,
        ModelOrbit: true, FeaturedModelCard: true,
      },
    },
  })
  wrappers.push(wrapper)
  return wrapper
}
function destinations(wrapper: ReturnType<typeof mountHome>) {
  return wrapper.findAllComponents(RouterLinkStub).map((link) => link.props('to'))
}

describe('HomeView brand landing', () => {
  beforeEach(() => {
    authStore.isAuthenticated = false
    authStore.isAdmin = false
    appStore.siteName = ''
    appStore.siteLogo = ''
    vi.clearAllMocks()
    localStorage.clear()
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList)
  })
  afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
    vi.restoreAllMocks()
  })

  it.each([
    [undefined, false, false, false],
    [false, false, false, false],
    [false, true, true, false],
    [true, false, false, true],
    [true, true, false, false],
    [true, true, true, true],
  ])('gates model plaza: enabled=%s requireAuth=%s authenticated=%s', (enabled, requireAuth, authenticated, visible) => {
    authStore.isAuthenticated = authenticated
    const wrapper = mountHome({ model_plaza_enabled: enabled, model_plaza_require_auth: requireAuth })
    expect(destinations(wrapper).includes('/model-plaza')).toBe(visible)
  })

  it('offers login and registration to anonymous visitors', () => {
    expect(destinations(mountHome())).toEqual(['/', '/login', '/register', '/register'])
    expect(authStore.checkAuth).toHaveBeenCalledOnce()
    expect(appStore.fetchPublicSettings).not.toHaveBeenCalled()
  })

  it.each([[false, '/dashboard'], [true, '/admin/dashboard']])('routes signed-in users to the correct dashboard (admin=%s)', (admin, destination) => {
    authStore.isAuthenticated = true
    authStore.isAdmin = admin
    expect(destinations(mountHome())).toEqual(['/', destination, destination])
  })

  it('uses default branding when no configuration is present', () => {
    const wrapper = mountHome()
    expect(wrapper.text()).toContain('GGbond AI')
    expect(wrapper.get('img').attributes('src')).toBe('/ggbond-logo.svg')
  })

  it('keeps custom names and logos', () => {
    const wrapper = mountHome({ site_name: 'Tenant AI', site_logo: '/tenant.svg' })
    expect(wrapper.text()).toContain('Tenant AI')
    expect(wrapper.get('img').attributes('src')).toBe('/tenant.svg')
  })

  it('renders administrator HTML instead of the brand landing', () => {
    const wrapper = mountHome({ home_content: '<section id="custom-home">Tenant home</section>' })
    expect(wrapper.get('#custom-home').text()).toBe('Tenant home')
    expect(wrapper.find('header').exists()).toBe(false)
  })

  it('renders a trimmed administrator URL in an iframe', () => {
    const wrapper = mountHome({ home_content: ' https://example.com/home ' })
    expect(wrapper.get('iframe').attributes('src')).toBe('https://example.com/home')
  })
})
