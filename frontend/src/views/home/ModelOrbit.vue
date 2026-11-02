<template>
  <div ref="stageRef" class="orbit-stage" :class="{ 'is-compact': isCompact }">
    <!-- 轨道后半圈：在猪猪侠身后 -->
    <svg class="orbit-rings orbit-rings-back" :width="size.width" :height="size.height" aria-hidden="true">
      <path v-for="(d, i) in arcs.back" :key="i" :d="d" class="orbit-arc" />
    </svg>

    <div class="orbit-mascot" :style="mascotStyle">
      <GGbondMascot class="h-full w-full" :label="mascotLabel" />
    </div>

    <!-- 轨道前半圈：压在猪猪侠身前 -->
    <svg class="orbit-rings orbit-rings-front" :width="size.width" :height="size.height" aria-hidden="true">
      <path v-for="(d, i) in arcs.front" :key="i" :d="d" class="orbit-arc" />
    </svg>

    <div aria-hidden="true">
      <div
        v-for="item in items"
        :key="item.provider.id"
        :ref="(el) => setItemRef(item.provider.id, el)"
        class="orbit-item"
        :class="{
          'is-featured': highlighted.includes(item.provider.id),
          'is-hovered': hoveredId === item.provider.id
        }"
        @pointerenter="onItemEnter(item)"
        @pointerleave="onItemLeave"
      >
        <div class="orbit-tile">
          <ModelIcon :model="item.provider.model" :size="`${iconSize}px`" />
        </div>
        <span class="orbit-label">{{ item.provider.name }}</span>
      </div>
    </div>

    <!-- 给读屏软件的厂商列表 -->
    <ul class="sr-only">
      <li v-for="provider in providers" :key="provider.id">{{ provider.name }}</li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, type ComponentPublicInstance } from 'vue'
import ModelIcon from '@/components/common/ModelIcon.vue'
import GGbondMascot from './GGbondMascot.vue'
import type { ShowcaseProvider } from './showcaseModels'
import {
  assignToRings,
  buildRingArc,
  layoutForWidth,
  pointOnRing,
  resolveRings
} from './orbitGeometry'

const props = withDefaults(
  defineProps<{
    providers: readonly ShowcaseProvider[]
    /** 当前精选卡展示的厂商，在轨道上常亮 */
    highlighted?: readonly string[]
    mascotLabel?: string
  }>(),
  { highlighted: () => [], mascotLabel: 'GGbond' }
)

interface OrbitItem {
  provider: ShowcaseProvider
  ring: number
  /** 在本圈上的初始角度 */
  angle: number
}

// 猪猪侠全身图的宽高比与肚子在图中的高度（GGbondMascot 的 full viewBox）
const MASCOT_ASPECT = 430 / 570
const MASCOT_BELLY = 0.58

const stageRef = ref<HTMLElement | null>(null)
const size = ref({ width: 0, height: 0 })
const hoveredId = ref<string | null>(null)
const pausedRing = ref<number | null>(null)

const layout = computed(() => layoutForWidth(size.value.width))
const rings = computed(() => resolveRings(layout.value, size.value.width, size.value.height))
const isCompact = computed(() => size.value.width < 480)
const iconSize = computed(() => (isCompact.value ? 20 : 24))

const items = computed<OrbitItem[]>(() =>
  assignToRings(props.providers, layout.value.capacities).flatMap((group, ring) =>
    group.map((provider, index) => ({
      provider,
      ring,
      // 每圈错开起点，避免各圈的第一个图标排成一条线
      angle: (index / group.length) * Math.PI * 2 + ring * 0.9
    }))
  )
)

const arcs = computed(() => ({
  back: rings.value.map((ring) => buildRingArc(ring, 'back')),
  front: rings.value.map((ring) => buildRingArc(ring, 'front'))
}))

const mascotStyle = computed(() => {
  const height = size.value.height * layout.value.mascotHeight
  const width = height * MASCOT_ASPECT
  const centerY = size.value.height * layout.value.centerY
  return {
    width: `${width}px`,
    height: `${height}px`,
    left: `${(size.value.width - width) / 2}px`,
    top: `${centerY - height * MASCOT_BELLY}px`
  }
})

// 图标位置每帧直接写 style，不走响应式，避免每帧重新渲染
const itemEls = new Map<string, HTMLElement>()
let offsets: number[] = []

function setItemRef(id: string, el: Element | ComponentPublicInstance | null) {
  if (el instanceof HTMLElement) itemEls.set(id, el)
  else itemEls.delete(id)
}

function render() {
  for (const item of items.value) {
    const el = itemEls.get(item.provider.id)
    const ring = rings.value[item.ring]
    if (!el || !ring) continue
    const p = pointOnRing(ring, item.angle + (offsets[item.ring] ?? 0))
    const scale = 0.78 + 0.22 * ((p.depth + 1) / 2)
    el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) translate(-50%, -50%) scale(${scale})`
    el.style.opacity = String(0.55 + 0.45 * ((p.depth + 1) / 2))
    // 前半圈的图标盖在猪猪侠（z=20）上面，后半圈的被它挡住
    el.style.zIndex = hoveredId.value === item.provider.id ? '40' : p.depth > 0 ? '30' : '10'
  }
}

let frame = 0
let lastTime = 0

function tick(time: number) {
  const dt = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 0
  lastTime = time
  offsets = layout.value.rings.map((ring, i) =>
    pausedRing.value === i ? offsets[i] ?? 0 : (offsets[i] ?? 0) + ring.speed * dt
  )
  render()
  frame = requestAnimationFrame(tick)
}

function onItemEnter(item: OrbitItem) {
  hoveredId.value = item.provider.id
  pausedRing.value = item.ring
}

function onItemLeave() {
  hoveredId.value = null
  pausedRing.value = null
}

function measure() {
  const el = stageRef.value
  if (!el) return
  size.value = { width: el.clientWidth, height: el.clientHeight }
}

const reducedMotion =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// 尺寸或布局变化后重新摆一次（减少动态效果模式下只靠这里摆放）
watch([items, rings], () => render(), { flush: 'post' })

let observer: ResizeObserver | undefined

onMounted(() => {
  measure()
  if (typeof ResizeObserver !== 'undefined' && stageRef.value) {
    observer = new ResizeObserver(measure)
    observer.observe(stageRef.value)
  } else {
    window.addEventListener('resize', measure)
  }
  if (!reducedMotion) frame = requestAnimationFrame(tick)
})

onUnmounted(() => {
  cancelAnimationFrame(frame)
  observer?.disconnect()
  window.removeEventListener('resize', measure)
})
</script>

<style scoped>
.orbit-stage {
  position: relative;
  width: 100%;
  height: 100%;
}

.orbit-rings {
  position: absolute;
  inset: 0;
  overflow: visible;
  pointer-events: none;
}

.orbit-rings-back {
  z-index: 5;
}

.orbit-rings-front {
  z-index: 25;
}

.orbit-arc {
  fill: none;
  stroke: rgb(226 35 26 / 0.22);
  stroke-width: 1.5;
  stroke-dasharray: 2 6;
  stroke-linecap: round;
}

:global(.dark) .orbit-arc {
  stroke: rgb(255 183 3 / 0.25);
}

.orbit-mascot {
  position: absolute;
  z-index: 20;
}

.orbit-item {
  position: absolute;
  left: 0;
  top: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  opacity: 0;
  will-change: transform, opacity;
}

.orbit-tile {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background: #fff;
  box-shadow:
    0 6px 16px rgb(138 15 17 / 0.12),
    0 0 0 1px rgb(226 35 26 / 0.08);
  transition:
    transform 0.2s ease-out,
    box-shadow 0.2s ease-out;
}

.orbit-label {
  margin-top: 6px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgb(255 255 255 / 0.9);
  color: #3f0506;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  opacity: 0;
  transform: translateY(-4px);
  transition:
    opacity 0.2s ease-out,
    transform 0.2s ease-out;
  pointer-events: none;
}

.is-featured .orbit-tile {
  box-shadow:
    0 6px 16px rgb(138 15 17 / 0.16),
    0 0 0 2px #ffb703,
    0 0 18px rgb(255 183 3 / 0.55);
}

.is-featured .orbit-label,
.is-hovered .orbit-label {
  opacity: 1;
  transform: translateY(0);
}

.is-hovered .orbit-tile {
  transform: scale(1.25);
}

.is-compact .orbit-tile {
  width: 36px;
  height: 36px;
  border-radius: 11px;
}

.is-compact .orbit-label {
  font-size: 11px;
}
</style>
