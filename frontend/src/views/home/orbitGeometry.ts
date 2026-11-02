/**
 * 首页模型轨道的几何计算（纯函数，便于测试）。
 * 轨道是倾斜的椭圆，模拟从斜上方看一个水平圆环：
 * 椭圆下半部分离观众近（前面），上半部分在猪猪侠身后。
 */

export interface RingSpec {
  cx: number
  cy: number
  rx: number
  ry: number
  /** 椭圆绕中心的旋转角度（度） */
  tilt: number
}

export interface RingPoint {
  x: number
  y: number
  /** -1 = 最远（正后方），1 = 最近（正前方） */
  depth: number
}

/** 一圈轨道相对舞台尺寸的比例，以及转速（弧度/秒，正负表示方向） */
export interface RingLayout {
  rx: number
  ry: number
  tilt: number
  speed: number
}

export interface OrbitLayout {
  capacities: readonly number[]
  rings: readonly RingLayout[]
  /** 轨道中心在舞台高度上的位置比例 */
  centerY: number
  /** 猪猪侠高度占舞台高度的比例 */
  mascotHeight: number
}

const DEG = Math.PI / 180

export function pointOnRing(ring: RingSpec, angle: number): RingPoint {
  const ex = ring.rx * Math.cos(angle)
  const ey = ring.ry * Math.sin(angle)
  const cos = Math.cos(ring.tilt * DEG)
  const sin = Math.sin(ring.tilt * DEG)
  return {
    x: ring.cx + ex * cos - ey * sin,
    y: ring.cy + ex * sin + ey * cos,
    depth: Math.sin(angle)
  }
}

function fmt(n: number): string {
  return String(Math.round(n * 100) / 100)
}

/** 轨道的前半圈或后半圈，作为 SVG path 的 d 属性 */
export function buildRingArc(ring: RingSpec, half: 'front' | 'back'): string {
  const right = pointOnRing(ring, 0)
  const left = pointOnRing(ring, Math.PI)
  const [from, to] = half === 'front' ? [right, left] : [left, right]
  const arc = [fmt(ring.rx), fmt(ring.ry), fmt(ring.tilt), '0', '1', fmt(to.x), fmt(to.y)]
  return `M ${fmt(from.x)} ${fmt(from.y)} A ${arc.join(' ')}`
}

/** 按顺序把条目分到各圈，超出总容量的丢弃 */
export function assignToRings<T>(items: readonly T[], capacities: readonly number[]): T[][] {
  const rings: T[][] = []
  let start = 0
  for (const capacity of capacities) {
    const slice = items.slice(start, start + capacity)
    if (slice.length === 0) break
    rings.push(slice)
    start += capacity
  }
  return rings
}

const DESKTOP: OrbitLayout = {
  capacities: [7, 9, 11],
  rings: [
    { rx: 0.25, ry: 0.13, tilt: -10, speed: 0.16 },
    { rx: 0.37, ry: 0.22, tilt: 8, speed: -0.11 },
    { rx: 0.48, ry: 0.32, tilt: -5, speed: 0.07 }
  ],
  centerY: 0.56,
  mascotHeight: 0.72
}

const TABLET: OrbitLayout = {
  capacities: [8, 12],
  rings: [
    { rx: 0.3, ry: 0.14, tilt: -9, speed: 0.14 },
    { rx: 0.46, ry: 0.26, tilt: 6, speed: -0.09 }
  ],
  centerY: 0.56,
  mascotHeight: 0.62
}

const PHONE: OrbitLayout = {
  capacities: [8],
  rings: [{ rx: 0.44, ry: 0.17, tilt: -8, speed: 0.15 }],
  centerY: 0.58,
  mascotHeight: 0.66
}

/** width 是轨道舞台本身的宽度（桌面端两侧有精选卡，舞台约 690px） */
export function layoutForWidth(width: number): OrbitLayout {
  if (width >= 640) return DESKTOP
  if (width >= 480) return TABLET
  return PHONE
}

/** 把比例布局换算成舞台上的像素轨道 */
export function resolveRings(layout: OrbitLayout, width: number, height: number): RingSpec[] {
  return layout.rings.map((ring) => ({
    cx: width / 2,
    cy: height * layout.centerY,
    rx: width * ring.rx,
    ry: height * ring.ry,
    tilt: ring.tilt
  }))
}
