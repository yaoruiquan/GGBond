import type { ContactMethod } from '@/types'

export const CONTACT_METHOD_LIMITS = {
  count: 6,
  labelCodePoints: 40,
  textCodePoints: 500,
  imageBytes: 20 * 1024 * 1024,
  totalImageBytes: 60 * 1024 * 1024,
  jsonBytes: 85 * 1024 * 1024,
  minDimension: 1,
  maxDimension: 32768,
  maxPixels: 100_000_000,
  imageTypes: ['image/png', 'image/jpeg'] as const,
  decodeTimeoutMs: 30000,
} as const

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
const DATA_URL_PATTERN = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]+={0,2})$/

function codePointLength(value: string): number {
  return [...value].length
}

function decodedBase64Bytes(value: string): number {
  const payload = value.slice(value.indexOf(',') + 1)
  return Math.floor(payload.length * 3 / 4) - (payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0)
}

function utf8Size(value: string): number {
  const goEscaped = value.replace(/[<&>\u2028\u2029]/g, character => {
    const escapes: Record<string, string> = { '<': '\\u003c', '>': '\\u003e', '&': '\\u0026', '\u2028': '\\u2028', '\u2029': '\\u2029' }
    return escapes[character]
  })
  return new TextEncoder().encode(goEscaped).length
}

export function validateContactMethodShape(methods: ContactMethod[]): string | null {
  if (!Array.isArray(methods)) return fail('invalidList')
  if (methods.length > CONTACT_METHOD_LIMITS.count) return fail('tooMany')
  const ids = new Set<string>()
  let totalImageBytes = 0
  for (const method of methods) {
    if (!method || typeof method !== 'object') return fail('invalidList')
    if (typeof method.id !== 'string' || !ID_PATTERN.test(method.id) || ids.has(method.id)) return fail('invalidId')
    ids.add(method.id)
    if (typeof method.label !== 'string' || !method.label.trim()) return fail('labelRequired')
    if (codePointLength(method.label.trim()) > CONTACT_METHOD_LIMITS.labelCodePoints) return fail('labelTooLong')
    if (typeof method.text !== 'string' || codePointLength(method.text) > CONTACT_METHOD_LIMITS.textCodePoints) return fail('textTooLong')
    if (typeof method.image_data_url !== 'string' || typeof method.enabled !== 'boolean') return fail('invalidList')
    if (method.image_data_url) {
      if (!DATA_URL_PATTERN.test(method.image_data_url)) return fail('invalidImage')
      const bytes = decodedBase64Bytes(method.image_data_url)
      if (bytes > CONTACT_METHOD_LIMITS.imageBytes) return fail('imageTooLarge')
      totalImageBytes += bytes
    } else if (!method.text.trim()) return fail('contentRequired')
  }
  if (totalImageBytes > CONTACT_METHOD_LIMITS.totalImageBytes) return fail('totalImagesTooLarge')
  if (utf8Size(JSON.stringify(methods)) > CONTACT_METHOD_LIMITS.jsonBytes) return fail('listTooLarge')
  return null
}

function fail(key: string): string {
  return `contactMethods.errors.${key}`
}

async function decodeImage(dataUrl: string): Promise<{ width: number; height: number } | null> {
  return new Promise(resolve => {
    let image: HTMLImageElement
    try {
      image = new Image()
    } catch {
      resolve(null)
      return
    }
    const timer = window.setTimeout(() => {
      image.src = ''
      resolve(null)
    }, CONTACT_METHOD_LIMITS.decodeTimeoutMs)
    image.onload = () => {
      window.clearTimeout(timer)
      resolve({ width: image.naturalWidth, height: image.naturalHeight })
    }
    image.onerror = () => {
      window.clearTimeout(timer)
      resolve(null)
    }
    image.src = dataUrl
  })
}

export async function validateContactMethods(methods: ContactMethod[]): Promise<string | null> {
  const shapeError = validateContactMethodShape(methods)
  if (shapeError) return shapeError
  for (const method of methods) {
    if (method.image_data_url) {
      const imageError = await validateContactImage(method.image_data_url)
      if (imageError) return imageError
    }
  }
  return null
}

export async function validateContactImage(dataUrl: string): Promise<string | null> {
  const match = dataUrl.match(DATA_URL_PATTERN)
  if (!match) return fail('invalidImage')
  if (decodedBase64Bytes(dataUrl) > CONTACT_METHOD_LIMITS.imageBytes) return fail('imageTooLarge')
  const dimensions = await decodeImage(dataUrl)
  if (!dimensions) return fail('invalidImage')
  const { width, height } = dimensions
  if (
    width < CONTACT_METHOD_LIMITS.minDimension || height < CONTACT_METHOD_LIMITS.minDimension ||
    width > CONTACT_METHOD_LIMITS.maxDimension || height > CONTACT_METHOD_LIMITS.maxDimension ||
    width * height > CONTACT_METHOD_LIMITS.maxPixels
  ) return fail('invalidDimensions')
  if (match[1] === 'image/png' && !isPngSignature(dataUrl)) return fail('invalidImage')
  if (match[1] === 'image/jpeg' && !isJpegSignature(dataUrl)) return fail('invalidImage')
  return null
}

function isPngSignature(dataUrl: string): boolean {
  const payload = dataUrl.slice(dataUrl.indexOf(',') + 1)
  try {
    return atob(payload.slice(0, 12)).startsWith('\x89PNG\r\n\x1a\n')
  } catch {
    return false
  }
}

function isJpegSignature(dataUrl: string): boolean {
  const payload = dataUrl.slice(dataUrl.indexOf(',') + 1)
  try {
    return atob(payload.slice(0, 4)).startsWith('\xff\xd8') && atob(payload.slice(-8)).endsWith('\xff\xd9')
  } catch {
    return false
  }
}

export function createContactMethod(): ContactMethod {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `contact-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    label: '',
    text: '',
    image_data_url: '',
    enabled: true,
  }
}
