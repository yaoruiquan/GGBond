import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { advanceFeatured, useFeaturedRotation } from '../featuredRotation'

const ids = ['claude', 'openai', 'deepseek'] as const

describe('advanceFeatured', () => {
  it('changes only one side per step, alternating left and right', () => {
    const s0 = { left: 'claude', right: 'openai', nextSide: 'left' as const }
    const s1 = advanceFeatured(s0, ids)
    expect(s1).toEqual({ left: 'deepseek', right: 'openai', nextSide: 'right' })
    const s2 = advanceFeatured(s1, ids)
    expect(s2).toEqual({ left: 'deepseek', right: 'claude', nextSide: 'left' })
  })

  it('never shows the same id on both sides', () => {
    let state = { left: 'claude', right: 'openai', nextSide: 'left' as 'left' | 'right' }
    for (let i = 0; i < 12; i++) {
      state = advanceFeatured(state, ids)
      expect(state.left).not.toBe(state.right)
    }
  })

  it('returns a new object instead of mutating the input', () => {
    const s0 = { left: 'claude', right: 'openai', nextSide: 'left' as const }
    const s1 = advanceFeatured(s0, ids)
    expect(s1).not.toBe(s0)
    expect(s0).toEqual({ left: 'claude', right: 'openai', nextSide: 'left' })
  })

  it('keeps the state unchanged when there are not enough ids to rotate', () => {
    const s0 = { left: 'claude', right: 'openai', nextSide: 'left' as const }
    expect(advanceFeatured(s0, ['claude', 'openai'])).toEqual(s0)
  })
})


describe('useFeaturedRotation lifecycle', () => {
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

  it('pauses while hovered or hidden and clears its interval on unmount', () => {
    vi.useFakeTimers()
    const paused = ref(false)
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    const wrapper = mount(defineComponent({
      setup() { return { state: useFeaturedRotation(ids, 1000, paused) } },
      template: '<span>{{ state.left }}:{{ state.right }}</span>',
    }))
    expect(wrapper.vm.state.left).toBe('claude')
    vi.advanceTimersByTime(1000)
    expect(wrapper.vm.state.left).toBe('deepseek')
    paused.value = true
    vi.advanceTimersByTime(1000)
    expect(wrapper.vm.state.right).toBe('openai')
    paused.value = false
    hidden.mockReturnValue(true)
    vi.advanceTimersByTime(1000)
    expect(wrapper.vm.state.right).toBe('openai')
    hidden.mockReturnValue(false)
    vi.advanceTimersByTime(1000)
    expect(wrapper.vm.state.right).toBe('claude')
    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('uses the only provider on both sides without attempting a replacement', () => {
    vi.useFakeTimers()
    const wrapper = mount(defineComponent({
      setup() { return { state: useFeaturedRotation(['solo'], 1000, ref(false)) } },
      template: '<span />',
    }))
    expect(wrapper.vm.state).toEqual({ left: 'solo', right: 'solo', nextSide: 'left' })
    wrapper.unmount()
  })
})
