import { beforeEach, describe, expect, it, vi } from 'vitest'

const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/api/client', () => ({ apiClient: { get } }))

import { getOpenAIVideoContent, getOpenAIVideoTask } from '@/api/admin/accounts'

describe('admin OpenAI video task API', () => {
  beforeEach(() => get.mockReset())

  it('queries task state with abort signal', async () => {
    const signal = new AbortController().signal
    const task = { id: 'task/1', status: 'completed' }
    get.mockResolvedValueOnce({ data: task })
    await expect(getOpenAIVideoTask(12, 'task/1', { signal })).resolves.toEqual(task)
    expect(get).toHaveBeenCalledWith('/admin/accounts/12/video-tasks/task%2F1', { signal })
  })

  it('downloads video as a long timeout blob request', async () => {
    const signal = new AbortController().signal
    const blob = new Blob(['video'])
    get.mockResolvedValueOnce({ data: blob })
    await expect(getOpenAIVideoContent(12, 'task-1', { signal })).resolves.toBe(blob)
    expect(get).toHaveBeenCalledWith('/admin/accounts/12/video-tasks/task-1/content', {
      responseType: 'blob', timeout: 180000, signal
    })
  })
})
