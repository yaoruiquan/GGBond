import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

type NavigationGuard = (
  to: Record<string, any>,
  from: Record<string, any>,
  next: ReturnType<typeof vi.fn>
) => Promise<void>

const routerHarness = vi.hoisted(() => ({ guard: null as NavigationGuard | null }))
const authStore = vi.hoisted(() => ({
  checkAuth: vi.fn(), isAuthenticated: false, isAdmin: false,
  isSimpleMode: false, hasPendingAuthSession: false,
}))
const appStore = vi.hoisted(() => ({
  siteName: 'GGbond AI', backendModeEnabled: false, publicSettingsLoaded: true,
  cachedPublicSettings: null as null | Record<string, unknown>,
  fetchPublicSettings: vi.fn(),
}))

vi.mock('vue-router', () => ({
  createWebHistory: vi.fn(() => ({})),
  createRouter: vi.fn(() => ({
    beforeEach: vi.fn((guard: NavigationGuard) => { routerHarness.guard = guard }),
    afterEach: vi.fn(), onError: vi.fn(),
  })),
}))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => authStore }))
vi.mock('@/stores/app', () => ({ useAppStore: () => appStore }))
vi.mock('@/stores/adminSettings', () => ({ useAdminSettingsStore: () => ({ customMenuItems: [] }) }))
vi.mock('@/stores/adminCompliance', () => ({
  useAdminComplianceStore: () => ({ initialized: true, fetchStatus: vi.fn(), requireAcknowledgement: vi.fn() }),
}))
vi.mock('@/composables/useNavigationLoading', () => ({
  useNavigationLoadingState: () => ({ startNavigation: vi.fn(), endNavigation: vi.fn(), isLoading: { value: false } }),
}))
vi.mock('@/composables/useRoutePrefetch', () => ({
  useRoutePrefetch: () => ({ triggerPrefetch: vi.fn(), cancelPendingPrefetch: vi.fn(), resetPrefetchState: vi.fn() }),
}))

async function visitModelPlaza(settings: Record<string, unknown>) {
  appStore.cachedPublicSettings = settings
  const next = vi.fn()
  await routerHarness.guard!(
    { path: '/model-plaza', fullPath: '/model-plaza', name: 'ModelPlaza', params: {}, query: {}, meta: { requiresAuth: false } },
    {}, next,
  )
  return next
}

describe('model plaza route guard', () => {
  beforeAll(async () => { await import('@/router') })
  beforeEach(() => {
    authStore.isAuthenticated = false
    authStore.isAdmin = false
    appStore.backendModeEnabled = false
    appStore.publicSettingsLoaded = true
  })

  it('sends anonymous visitors to login when the plaza requires authentication', async () => {
    const next = await visitModelPlaza({ model_plaza_enabled: true, model_plaza_require_auth: true })
    expect(next).toHaveBeenCalledWith({ path: '/login', query: { redirect: '/model-plaza' } })
  })

  it('allows anonymous visitors when authentication is not required', async () => {
    const next = await visitModelPlaza({ model_plaza_enabled: true, model_plaza_require_auth: false })
    expect(next).toHaveBeenCalledWith()
  })

  it('allows signed-in visitors when authentication is required', async () => {
    authStore.isAuthenticated = true
    const next = await visitModelPlaza({ model_plaza_enabled: true, model_plaza_require_auth: true })
    expect(next).toHaveBeenCalledWith()
  })

  it('returns visitors home when the feature is explicitly disabled', async () => {
    const next = await visitModelPlaza({ model_plaza_enabled: false, model_plaza_require_auth: false })
    expect(next).toHaveBeenCalledWith('/home')
  })
})
