import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import ModelMarketNavBar from '../ModelMarketNavBar.vue'

const { appStore, authStore } = vi.hoisted(() => ({
  appStore: {
    cachedPublicSettings: null as Record<string, unknown> | null,
    fetchPublicSettings: vi.fn(),
  },
  authStore: { isAuthenticated: false, isAdmin: false },
}))

vi.mock('@/stores/app', () => ({ useAppStore: () => appStore }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => authStore }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

const wrappers: ReturnType<typeof mount>[] = []
function mountNav() {
  const wrapper = mount(ModelMarketNavBar, { global: { stubs: { RouterLink: RouterLinkStub } } })
  wrappers.push(wrapper)
  return wrapper
}

describe('model market navigation', () => {
  beforeEach(() => {
    appStore.cachedPublicSettings = null
    authStore.isAuthenticated = false
    authStore.isAdmin = false
    vi.clearAllMocks()
  })
  afterEach(() => { wrappers.splice(0).forEach((wrapper) => wrapper.unmount()) })

  it.each([
    [undefined, false, false, false],
    [false, false, false, false],
    [false, false, true, false],
    [true, false, false, true],
    [true, true, false, false],
    [true, true, true, true],
  ])('gates the original plaza: enabled=%s requireAuth=%s authenticated=%s', (enabled, requireAuth, authenticated, visible) => {
    appStore.cachedPublicSettings = { model_plaza_enabled: enabled, model_plaza_require_auth: requireAuth }
    authStore.isAuthenticated = authenticated
    const destinations = mountNav().findAllComponents(RouterLinkStub).map((link) => link.props('to'))
    expect(destinations.includes('/model-plaza')).toBe(visible)
    expect(destinations).toContain('/model-market')
  })

  it('renders default branding and a login link without settings', () => {
    const wrapper = mountNav()
    expect(wrapper.text()).toContain('GGbond AI')
    expect(wrapper.get('img').attributes('src')).toBe('/ggbond-logo.svg')
    expect(wrapper.findAllComponents(RouterLinkStub).at(-1)?.props('to')).toEqual({
      path: '/login', query: { redirect: '/model-market' },
    })
    expect(appStore.fetchPublicSettings).toHaveBeenCalledOnce()
  })

  it.each([[false, '/dashboard'], [true, '/admin/dashboard']])('opens the correct console for signed-in visitors (admin=%s)', (admin, destination) => {
    authStore.isAuthenticated = true
    authStore.isAdmin = admin
    expect(mountNav().findAllComponents(RouterLinkStub).at(-1)?.props('to')).toBe(destination)
  })
})
