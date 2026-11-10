import { afterEach, describe, expect, it, vi } from 'vitest'
import { CONTACT_METHOD_LIMITS, validateContactImage, validateContactMethodShape } from '../contactMethods'
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
  afterEach(() => vi.unstubAllGlobals())

  function decodedImage(width: number, height: number) {
    vi.stubGlobal('Image', class {
      naturalWidth = width
      naturalHeight = height
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_value: string) { queueMicrotask(() => this.onload?.()) }
    })
  }

  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aI1sAAAAASUVORK5CYII='

  it.each([[1, 1], [63, 64], [2049, 64], [4096, 4096], [32768, 64], [10000, 10000]])('accepts browser-decoded images at %i × %i', async (width, height) => {
    decodedImage(width, height)
    await expect(validateContactImage(png)).resolves.toBeNull()
  })

  it.each([[0, 64], [32769, 64], [10001, 10000]])('rejects dimensions outside the expanded bounds at %i × %i', async (width, height) => {
    decodedImage(width, height)
    await expect(validateContactImage(png)).resolves.toBe('contactMethods.errors.invalidDimensions')
  })

  it('accepts a browser-decoded PNG larger than the former 100 KiB limit', async () => {
    decodedImage(4096, 4096)
    const dataUrl = `data:image/png;base64,${btoa(atob(png.split(',')[1]) + '\x00'.repeat(200 * 1024))}`
    expect(validateContactMethodShape([method({ image_data_url: dataUrl })])).toBeNull()
    await expect(validateContactImage(dataUrl)).resolves.toBeNull()
  })

  it('checks JPEG markers without decoding the entire image into a byte array', async () => {
    decodedImage(4096, 4096)
    await expect(validateContactImage(`data:image/jpeg;base64,${btoa('\xff\xd8' + '\x00'.repeat(200 * 1024) + '\xff\xd9')}`)).resolves.toBeNull()
    await expect(validateContactImage(`data:image/jpeg;base64,${btoa('\xff\xd8invalid')}`)).resolves.toBe('contactMethods.errors.invalidImage')
  })

  it('rejects an image larger than 20 MiB before browser decoding', async () => {
    const dataUrl = `data:image/png;base64,${'A'.repeat(Math.ceil((CONTACT_METHOD_LIMITS.imageBytes + 1) / 3) * 4)}`
    await expect(validateContactImage(dataUrl)).resolves.toBe('contactMethods.errors.imageTooLarge')
  })
})
