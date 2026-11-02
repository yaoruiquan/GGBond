import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import VersionBadge from '../VersionBadge.vue'

const { appStore, getRollbackVersions } = vi.hoisted(() => ({
  appStore: {
    versionLoading: false, currentVersion: '1.2.3', latestVersion: '1.2.3',
    hasUpdate: false, buildType: 'release',
    releaseInfo: { html_url: 'https://releases.example.com/dynamic-release' },
    fetchVersion: vi.fn(),
  },
  getRollbackVersions: vi.fn(),
}))
vi.mock('@/stores', () => ({ useAppStore: () => appStore, useAuthStore: () => ({ isAdmin: true }) }))
vi.mock('@/api/admin/system', () => ({
  getRollbackVersions, performUpdate: vi.fn(), restartService: vi.fn(), rollback: vi.fn(),
}))
vi.mock('@/composables/useClipboard', () => ({ useClipboard: () => ({ copied: false, copyToClipboard: vi.fn() }) }))
vi.mock('vue-i18n', async (original) => ({
  ...await original<typeof import('vue-i18n')>(), useI18n: () => ({ t: (key: string) => key }),
}))

let wrapper: ReturnType<typeof mount> | undefined
async function openRollback() {
  getRollbackVersions.mockResolvedValue({ versions: [{ version: '1.2.0', published_at: '2026-01-01T00:00:00Z' }] })
  wrapper = mount(VersionBadge, { global: { stubs: { Icon: true } } })
  await wrapper.get('button').trigger('click')
  await wrapper.findAll('button').find((button) => button.text() === 'version.rollback')!.trigger('click')
  await flushPromises()
  await wrapper.findAll('button').find((button) => button.text().includes('v1.2.0'))!.trigger('click')
  return wrapper
}
afterEach(() => { wrapper?.unmount(); vi.clearAllMocks() })

describe('VersionBadge manual rollback branding', () => {
  it('uses the GGbond repository without replacing the dynamic release link', async () => {
    const badge = await openRollback()
    expect(badge.get('code').text()).toBe('curl -sSL https://raw.githubusercontent.com/yaoruiquan/GGBond/v1.2.0/deploy/install.sh | sudo bash -s -- rollback v1.2.0')
    expect(badge.get('a').attributes('href')).toBe(appStore.releaseInfo.html_url)
  })

  it('pins the GHCR image without a v prefix in Docker commands', async () => {
    const badge = await openRollback()
    await badge.findAll('button').find((button) => button.text() === 'version.deployDocker')!.trigger('click')
    expect(badge.get('code').text()).toContain('image: ghcr.io/yaoruiquan/ggbond:1.2.0')
    expect(badge.get('code').text()).not.toContain('ggbond:v1.2.0')
  })
})
