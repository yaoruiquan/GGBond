import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import HomeContactSection from '../HomeContactSection.vue'
import type { ContactMethod } from '@/types'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string, values?: Record<string, unknown>) => values ? `${key}:${values.label}` : key }) }))
const { copyToClipboard } = vi.hoisted(() => ({ copyToClipboard: vi.fn() }))
vi.mock('@/composables/useClipboard', () => ({ useClipboard: () => ({ copyToClipboard }) }))
vi.mock('@/components/icons/Icon.vue', () => ({ default: { template: '<i />' } }))
enableAutoUnmount(afterEach)

const methods: ContactMethod[] = [
  { id: 'visible', label: 'WeChat', text: 'support-id', image_data_url: 'data:image/png;base64,AA==', enabled: true },
  { id: 'disabled', label: 'Hidden', text: 'hidden', image_data_url: '', enabled: false },
]
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')
function setup(items = methods) {
  const wrapper = mount(HomeContactSection, { props: { methods: items }, attachTo: document.body })
  const trigger = () => wrapper.get<HTMLButtonElement>('button[aria-haspopup="dialog"]')
  return { wrapper, trigger }
}
beforeEach(() => { vi.useFakeTimers(); copyToClipboard.mockReset() })
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('Home contact floating preview', () => {
  it('shows compact text with no QR image until requested', async () => {
    const { wrapper } = setup()
    expect(wrapper.text()).toContain('support-id')
    expect(wrapper.text()).not.toContain('Hidden')
    expect(dialog()).toBeNull()
    expect(wrapper.find('img').exists()).toBe(false)
    await wrapper.get('button').trigger('click')
    expect(copyToClipboard).toHaveBeenCalledWith('support-id')
  })
  it('keeps hover open while entering the floating panel, and closes after leaving', async () => {
    const { trigger } = setup()
    await trigger().trigger('pointerenter', { pointerType: 'mouse' })
    expect(dialog()?.querySelector('img')?.alt).toBe('WeChat')
    await trigger().trigger('pointerleave')
    dialog()!.dispatchEvent(new Event('pointerenter'))
    await vi.advanceTimersByTimeAsync(200)
    expect(dialog()).not.toBeNull()
    dialog()!.dispatchEvent(new Event('pointerleave'))
    await vi.advanceTimersByTimeAsync(200)
    expect(dialog()).toBeNull()
  })
  it('focus then click pins the preview; second click and outside pointer close it', async () => {
    const { trigger } = setup()
    trigger().element.focus()
    await nextTick()
    expect(dialog()).not.toBeNull()
    await trigger().trigger('click')
    await trigger().trigger('pointerleave')
    await vi.advanceTimersByTimeAsync(200)
    expect(dialog()).not.toBeNull()
    await trigger().trigger('click')
    expect(dialog()).toBeNull()
    await trigger().trigger('click')
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await nextTick()
    expect(dialog()).toBeNull()
  })
  it('supports focus, Tab, Escape, and focus restoration without reopening', async () => {
    const { trigger } = setup()
    trigger().element.focus()
    await nextTick()
    expect(trigger().attributes('aria-expanded')).toBe('true')
    await trigger().trigger('keydown', { key: 'Tab' })
    expect(document.activeElement).toBe(dialog()!.querySelector('button'))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(dialog()).toBeNull()
    expect(document.activeElement).toBe(trigger().element)
    expect(trigger().attributes('aria-expanded')).toBe('false')
  })
  it('ignores touch hover and opens on tap', async () => {
    const { trigger } = setup()
    await trigger().trigger('pointerenter', { pointerType: 'touch' })
    expect(dialog()).toBeNull()
    await trigger().trigger('click')
    expect(dialog()).not.toBeNull()
  })
  it('clamps the panel to the viewport', async () => {
    const { trigger } = setup()
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this.id === 'home-contact-preview'
        ? { x: 0, y: 0, left: 0, top: 0, right: 280, bottom: 350, width: 280, height: 350, toJSON: () => ({}) }
        : { x: window.innerWidth - 10, y: window.innerHeight - 30, left: window.innerWidth - 10, top: window.innerHeight - 30, right: window.innerWidth, bottom: window.innerHeight, width: 10, height: 30, toJSON: () => ({}) }
    })
    await trigger().trigger('pointerenter', { pointerType: 'mouse' })
    await nextTick()
    expect(parseFloat(dialog()!.style.left) + 280).toBeLessThanOrEqual(window.innerWidth - 12)
    expect(parseFloat(dialog()!.style.top) + 350).toBeLessThanOrEqual(window.innerHeight - 12)
    expect(parseFloat(dialog()!.style.top)).toBeGreaterThanOrEqual(12)
  })
  it('keeps text on image failure and clears stale errors for a new source', async () => {
    const { wrapper, trigger } = setup()
    await trigger().trigger('click')
    dialog()!.querySelector('img')!.dispatchEvent(new Event('error'))
    await nextTick()
    expect(dialog()!.textContent).toContain('contactMethods.imageLoadFailed')
    expect(wrapper.text()).toContain('support-id')
    await wrapper.setProps({ methods: [{ ...methods[0], image_data_url: 'data:image/png;base64,BBBB' }] })
    expect(dialog()!.textContent).not.toContain('contactMethods.imageLoadFailed')
  })
  it('renders literal text and removes open preview when an item is unpublished', async () => {
    const { wrapper, trigger } = setup([{ ...methods[0], text: '<img src=x onerror=alert(1)>' }])
    expect(wrapper.text()).toContain('<img src=x onerror=alert(1)>')
    expect(wrapper.find('img').exists()).toBe(false)
    await trigger().trigger('click')
    await wrapper.setProps({ methods: [{ ...methods[0], enabled: false }] })
    expect(dialog()).toBeNull()
    expect(wrapper.find('section').exists()).toBe(false)
  })
  it('cleans pending timers and floating content on unmount', async () => {
    const { wrapper, trigger } = setup()
    await trigger().trigger('pointerenter', { pointerType: 'mouse' })
    await trigger().trigger('pointerleave')
    wrapper.unmount()
    await vi.advanceTimersByTimeAsync(200)
    expect(dialog()).toBeNull()
  })
})
