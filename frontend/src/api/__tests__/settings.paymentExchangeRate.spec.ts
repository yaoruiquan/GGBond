import { describe, expect, it, vi } from 'vitest'

const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/api/client', () => ({ apiClient: { get } }))
import { getPaymentExchangeRate } from '@/api/admin/settings'

describe('payment exchange rate reference API', () => {
  it('reads the admin reference endpoint without updating settings', async () => {
    const quote = { usd_to_cny: 7.2, balance_recharge_multiplier: 0.13888889, stale: false }
    get.mockResolvedValueOnce({ data: quote })
    await expect(getPaymentExchangeRate()).resolves.toEqual(quote)
    expect(get).toHaveBeenCalledWith('/admin/settings/payment-exchange-rate')
  })
})
