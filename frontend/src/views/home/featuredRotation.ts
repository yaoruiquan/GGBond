import { onMounted, onUnmounted, ref, type Ref } from 'vue'

export interface FeaturedState {
  left: string
  right: string
  /** 下一次轮换哪一侧；两侧交替换，避免同时跳变 */
  nextSide: 'left' | 'right'
}

/** 换掉 nextSide 那一侧，换成两侧都没在展示的下一个 id */
export function advanceFeatured(state: FeaturedState, ids: readonly string[]): FeaturedState {
  const candidates = ids.filter((id) => id !== state.left && id !== state.right)
  if (candidates.length === 0) return state

  const current = state[state.nextSide]
  const start = ids.indexOf(current)
  const next =
    [...ids.slice(start + 1), ...ids.slice(0, start + 1)].find((id) => candidates.includes(id)) ??
    candidates[0]

  return state.nextSide === 'left'
    ? { left: next, right: state.right, nextSide: 'right' }
    : { left: state.left, right: next, nextSide: 'left' }
}

/** 定时轮换两侧精选卡。页面隐藏或 paused 为 true 时不轮换。 */
export function useFeaturedRotation(
  ids: readonly string[],
  intervalMs: number,
  paused: Ref<boolean>
): Ref<FeaturedState> {
  const state = ref<FeaturedState>({ left: ids[0], right: ids[1] ?? ids[0], nextSide: 'left' })
  let timer: ReturnType<typeof setInterval> | undefined

  onMounted(() => {
    timer = setInterval(() => {
      if (paused.value || document.hidden) return
      state.value = advanceFeatured(state.value, ids)
    }, intervalMs)
  })

  onUnmounted(() => {
    if (timer) clearInterval(timer)
  })

  return state
}
