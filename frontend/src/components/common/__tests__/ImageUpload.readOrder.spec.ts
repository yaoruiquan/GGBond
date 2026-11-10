import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import ImageUpload from '../ImageUpload.vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

enableAutoUnmount(afterEach)

class ControlledReader {
  static instances: ControlledReader[] = []
  onload: ((event: { target: { result: string } }) => void) | null = null
  onerror: (() => void) | null = null
  aborted = false
  constructor() { ControlledReader.instances.push(this) }
  readAsText = vi.fn()
  readAsDataURL = vi.fn()
  abort() { this.aborted = true }
  complete(result: string) {
    if (!this.aborted) this.onload?.({ target: { result } })
  }
}

beforeEach(() => {
  ControlledReader.instances = []
  vi.stubGlobal('FileReader', ControlledReader)
})
afterEach(() => vi.unstubAllGlobals())

function uploader(mode: 'image' | 'svg' = 'image', props: Record<string, unknown> = {}) {
  const wrapper = mount(ImageUpload, { props: { modelValue: 'existing', mode, ...props } })
  const input = wrapper.get('input')
  return {
    wrapper,
    async choose(type = 'image/png') {
      Object.defineProperty(input.element, 'files', {
        configurable: true, value: [new File(['image'], 'upload', { type })]
      })
      await input.trigger('change')
    }
  }
}

describe('image upload read lifecycle', () => {
  it.each(['image', 'svg'] as const)('keeps the newest %s selection when reads finish out of order', async mode => {
    const { wrapper, choose } = uploader(mode)
    await choose()
    await choose()
    ControlledReader.instances[1].complete('new image')
    ControlledReader.instances[0].complete('old image')
    expect(wrapper.emitted('update:modelValue')).toEqual([['new image']])
  })

  it('does not restore an image after the remove button is clicked', async () => {
    const { wrapper, choose } = uploader()
    await choose()
    await wrapper.get('button').trigger('click')
    ControlledReader.instances[0].complete('removed image')
    expect(wrapper.emitted('update:modelValue')).toEqual([['']])
    expect(wrapper.emitted('busy-change')?.at(-1)).toEqual([false])
  })

  it('clears the reader generation when removed during a pending read', async () => {
    const { wrapper, choose } = uploader()
    await choose()
    await wrapper.get('button').trigger('click')
    ControlledReader.instances[0].complete('stale image')
    expect(wrapper.emitted('update:modelValue')).toEqual([['']])
  })

  it('does not apply a pending image after a later invalid selection', async () => {
    const { wrapper, choose } = uploader()
    await choose()
    await choose('text/plain')
    ControlledReader.instances[0].complete('old image')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.text()).toContain('common.selectImageFile')
  })

  it('aborts a pending read when the uploader unmounts', async () => {
    const { wrapper, choose } = uploader()
    await choose()
    wrapper.unmount()
    expect(ControlledReader.instances[0].aborted).toBe(true)
  })

  it('accepts a MIME allowlist, including JPEG, and defers model updates when requested', async () => {
    const { wrapper, choose } = uploader('image', { allowedTypes: ['image/png', 'image/jpeg'], deferUpdate: true })
    expect(wrapper.get('input').attributes('accept')).toBe('image/png,image/jpeg')
    await choose('image/jpeg')
    ControlledReader.instances[0].complete('data:image/jpeg;base64,valid')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.emitted('image-read')).toEqual([['data:image/jpeg;base64,valid']])
    expect(wrapper.emitted('busy-change')?.at(-1)).toEqual([false])
  })

  it('rejects a MIME type outside the allowlist and clears busy state', async () => {
    const { wrapper, choose } = uploader('image', { allowedTypes: ['image/png', 'image/jpeg'] })
    await choose('image/webp')
    expect(wrapper.text()).toContain('common.selectImageFile')
    expect(wrapper.emitted('busy-change')?.at(-1)).toEqual([false])
  })

  it('reports read failures and clears busy state', async () => {
    const { wrapper, choose } = uploader()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await choose()
    await new Promise(resolve => setTimeout(resolve, 0))
    ControlledReader.instances[0].onerror?.()
    expect(wrapper.emitted('busy-change')?.at(-1)).toEqual([false])
    errorSpy.mockRestore()
  })
})
