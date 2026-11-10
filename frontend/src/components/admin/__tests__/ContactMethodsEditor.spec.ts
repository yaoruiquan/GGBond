import { afterEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import ContactMethodsEditor from '../ContactMethodsEditor.vue'
import type { ContactMethod } from '@/types'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string, values?: Record<string, unknown>) => values ? `${key}:${values.number}` : key }) }))
vi.mock('@/components/icons/Icon.vue', () => ({ default: { props: ['name'], template: '<i :data-icon="name" />' } }))
const imageValidation = vi.fn<(value: string) => Promise<string | null>>()
vi.mock('@/utils/contactMethods', async () => {
  const actual = await vi.importActual<typeof import('@/utils/contactMethods')>('@/utils/contactMethods')
  return { ...actual, validateContactImage: (value: string) => imageValidation(value) }
})

enableAutoUnmount(afterEach)

const methods: ContactMethod[] = [
  { id: 'one', label: 'One', text: 'first', image_data_url: '', enabled: true },
  { id: 'two', label: 'Two', text: 'second', image_data_url: '', enabled: true },
]

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

describe('ContactMethodsEditor', () => {
  it('adds, reorders, removes methods and enforces the count cap', async () => {
    const wrapper = mount(ContactMethodsEditor, { props: { modelValue: methods } })
    await wrapper.get('[aria-label="contactMethods.moveUp"]:not([disabled])').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0][0]).toEqual([methods[1], methods[0]])
    await wrapper.get('[aria-label="contactMethods.remove"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[1][0]).toEqual([methods[1]])
    const emitted = wrapper.emitted('update:modelValue')?.[1][0] as ContactMethod[]
    await wrapper.setProps({ modelValue: emitted })
    await wrapper.get('[data-testid=contact-methods-editor] > button').trigger('click')
    const added = wrapper.emitted('update:modelValue')?.at(-1)?.[0] as ContactMethod[]
    expect(added).toHaveLength(2)
  })

  it('reports pending image reads to the parent', async () => {
    const wrapper = mount(ContactMethodsEditor, { props: { modelValue: methods.slice(0, 1) } })
    wrapper.findComponent({ name: 'ImageUpload' }).vm.$emit('busy-change', true)
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('busy-change')?.at(-1)).toEqual([true])
  })

  it('allows an unnamed image draft and keeps the prior image when candidate validation fails', async () => {
    imageValidation.mockResolvedValueOnce('contactMethods.errors.invalidImage')
    const existing = [{ ...methods[0], label: '', image_data_url: 'data:image/png;base64,AAAA' }]
    const wrapper = mount(ContactMethodsEditor, { props: { modelValue: existing } })
    wrapper.findComponent({ name: 'ImageUpload' }).vm.$emit('busy-change', true)
    wrapper.findComponent({ name: 'ImageUpload' }).vm.$emit('image-read', 'data:image/png;base64,BBBB')
    await vi.waitFor(() => expect(wrapper.text()).toContain('contactMethods.errors.invalidImage'))
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.emitted('busy-change')?.at(-1)).toEqual([false])
  })

  it('keeps saving busy until async image validation finishes', async () => {
    const pending = deferred<string | null>()
    imageValidation.mockReturnValueOnce(pending.promise)
    const wrapper = mount(ContactMethodsEditor, { props: { modelValue: methods.slice(0, 1) } })
    const uploader = wrapper.findComponent({ name: 'ImageUpload' })
    uploader.vm.$emit('busy-change', true)
    uploader.vm.$emit('image-read', 'data:image/png;base64,BBBB')
    uploader.vm.$emit('busy-change', false)
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('busy-change')?.at(-1)).toEqual([true])
    pending.resolve(null)
    await vi.waitFor(() => expect(wrapper.emitted('busy-change')?.at(-1)).toEqual([false]))
  })

  it('ignores an older candidate result after a newer file starts reading', async () => {
    const oldResult = deferred<string | null>()
    imageValidation.mockReturnValueOnce(oldResult.promise).mockResolvedValueOnce(null)
    const wrapper = mount(ContactMethodsEditor, { props: { modelValue: methods.slice(0, 1) } })
    const uploader = wrapper.findComponent({ name: 'ImageUpload' })
    uploader.vm.$emit('image-read', 'data:image/png;base64,AAAA')
    uploader.vm.$emit('busy-change', true)
    uploader.vm.$emit('image-read', 'data:image/png;base64,BBBB')
    await vi.waitFor(() => expect(wrapper.emitted('update:modelValue')).toHaveLength(1))
    oldResult.resolve('contactMethods.errors.invalidImage')
    await Promise.resolve()
    expect((wrapper.emitted('update:modelValue')?.[0][0] as ContactMethod[])[0].image_data_url).toBe('data:image/png;base64,BBBB')
    expect(wrapper.text()).not.toContain('contactMethods.errors.invalidImage')
  })

  it('disables adding at six entries and lets each item be toggled independently', async () => {
    const six = Array.from({ length: 6 }, (_, index) => ({ ...methods[0], id: `item-${index}` }))
    const wrapper = mount(ContactMethodsEditor, { props: { modelValue: six } })
    expect(wrapper.get('[data-testid=contact-methods-editor] > button').attributes('disabled')).toBeDefined()
    await wrapper.get('input[type=checkbox]').setValue(false)
    expect((wrapper.emitted('update:modelValue')?.at(-1)?.[0] as ContactMethod[])[0].enabled).toBe(false)
  })

  it('removes the current image from the editor model without deleting text', async () => {
    const withImage = [{ ...methods[0], text: 'keep this', image_data_url: 'data:image/png;base64,AAAA' }]
    const wrapper = mount(ContactMethodsEditor, { props: { modelValue: withImage } })
    const uploader = wrapper.findComponent({ name: 'ImageUpload' })
    uploader.vm.$emit('update:modelValue', '')
    expect(wrapper.emitted('update:modelValue')?.[0][0]).toEqual([{ ...withImage[0], image_data_url: '' }])
  })
})
