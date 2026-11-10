import { describe, expect, it, vi } from 'vitest'
import { CONTACT_METHOD_LIMITS, validateContactMethodShape } from '../contactMethods'
import type { ContactMethod } from '@/types'

const method = (override: Partial<ContactMethod> = {}): ContactMethod => ({ id: 'support', label: 'Support', text: 'hello', image_data_url: '', enabled: true, ...override })

describe('contact method validation', () => {
  it('accepts text-only and rejects empty content', () => {
    expect(validateContactMethodShape([method()])).toBeNull()
    expect(validateContactMethodShape([method({ text: '' })])).toBe('contactMethods.errors.contentRequired')
  })

  it('enforces count, unique ids, and text limits', () => {
    expect(validateContactMethodShape(Array.from({ length: CONTACT_METHOD_LIMITS.count + 1 }, (_, index) => method({ id: `id-${index}` })))).toBe('contactMethods.errors.tooMany')
    expect(validateContactMethodShape([method(), method({ id: 'support' })])).toBe('contactMethods.errors.invalidId')
    expect(validateContactMethodShape([method({ text: 'x'.repeat(CONTACT_METHOD_LIMITS.textCodePoints + 1) })])).toBe('contactMethods.errors.textTooLong')
  })

  it('rejects unsupported image data', () => {
    expect(validateContactMethodShape([method({ text: '', image_data_url: 'data:image/gif;base64,AAAA' })])).toBe('contactMethods.errors.invalidImage')
  })
})

describe('async image validation', () => {
  it('can validate a browser-decoded image when supplied by the host', async () => {
    vi.stubGlobal('Image', class {
      naturalWidth = 64
      naturalHeight = 64
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_value: string) { queueMicrotask(() => this.onload?.()) }
    })
    const { validateContactMethods } = await import('../contactMethods')
    await expect(validateContactMethods([method()])).resolves.toBeNull()
    vi.unstubAllGlobals()
  })
})
