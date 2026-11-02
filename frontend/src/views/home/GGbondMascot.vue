<template>
  <svg
    ref="svgRef"
    :viewBox="viewBox"
    class="gg-mascot"
    :class="{ 'is-happy': happy, 'is-powering': powering }"
    role="img"
    :aria-label="label"
    xmlns="http://www.w3.org/2000/svg"
    @pointerenter="happy = true"
    @pointerleave="happy = false"
    @click="powerUp"
  >
    <defs>
        <!-- 衣服、头套：深红，左上受光 -->
        <radialGradient :id="id('suit')" cx="0.38" cy="0.28" r="0.85">
          <stop offset="0" stop-color="#D8242A"/>
          <stop offset="0.55" stop-color="#B0141C"/>
          <stop offset="1" stop-color="#6E0A10"/>
        </radialGradient>
        <radialGradient :id="id('hood')" cx="0.42" cy="0.2" r="0.9">
          <stop offset="0" stop-color="#E02A2C"/>
          <stop offset="0.6" stop-color="#B8161D"/>
          <stop offset="1" stop-color="#7A0B11"/>
        </radialGradient>
        <linearGradient :id="id('mask')" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#E6312E"/>
          <stop offset="0.55" stop-color="#C51C20"/>
          <stop offset="1" stop-color="#8E0D13"/>
        </linearGradient>
        <linearGradient :id="id('leg')" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#7A0B11"/>
          <stop offset="0.45" stop-color="#C01A20"/>
          <stop offset="1" stop-color="#7A0B11"/>
        </linearGradient>
        <!-- 皮肤：脸中间亮、四周暗，做出圆脸的体积 -->
        <radialGradient :id="id('skin')" cx="0.48" cy="0.42" r="0.62">
          <stop offset="0" stop-color="#FDE6D6"/>
          <stop offset="0.6" stop-color="#F7CFB6"/>
          <stop offset="1" stop-color="#E0A488"/>
        </radialGradient>
        <radialGradient :id="id('cheek')" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stop-color="#F08C82" stop-opacity="0.5"/>
          <stop offset="1" stop-color="#F08C82" stop-opacity="0"/>
        </radialGradient>
        <radialGradient :id="id('snout')" cx="0.42" cy="0.3" r="0.8">
          <stop offset="0" stop-color="#FBD3C6"/>
          <stop offset="0.6" stop-color="#F0AE9E"/>
          <stop offset="1" stop-color="#D98878"/>
        </radialGradient>
        <radialGradient :id="id('ear')" cx="0.55" cy="0.45" r="0.65">
          <stop offset="0" stop-color="#FBD9CA"/>
          <stop offset="1" stop-color="#E2A08C"/>
        </radialGradient>
        <radialGradient :id="id('iris')" cx="0.45" cy="0.62" r="0.6">
          <stop offset="0" stop-color="#6E3E22"/>
          <stop offset="0.7" stop-color="#3A1E10"/>
          <stop offset="1" stop-color="#1C0D07"/>
        </radialGradient>
        <linearGradient :id="id('lens')" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#FFF07A"/>
          <stop offset="0.5" stop-color="#FFD60A"/>
          <stop offset="1" stop-color="#F2B300"/>
        </linearGradient>
        <linearGradient :id="id('cuff')" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#E8B400"/>
          <stop offset="0.45" stop-color="#FFE23A"/>
          <stop offset="1" stop-color="#D9A000"/>
        </linearGradient>
        <linearGradient :id="id('emblem')" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#FFE84A"/>
          <stop offset="1" stop-color="#F5C200"/>
        </linearGradient>

        <!-- 脸的轮廓，供阴影裁切 -->
        <path :id="id('face-shape')" d="M64 322 C60 280 96 248 202 242 C308 248 346 280 342 322 C346 372 328 410 292 425 C264 435 234 439 202 439 C170 439 140 435 112 425 C76 410 60 372 64 322 Z"/>
        <clipPath :id="id('clip-face')"><use :href="hrefOf('face-shape')"/></clipPath>
        <path :id="id('body-shape')" d="M114 412 C88 446 70 504 72 556 C74 610 122 640 202 640 C284 640 332 610 334 556 C336 504 318 446 292 412 C264 400 236 397 202 397 C170 397 142 400 114 412 Z"/>
        <clipPath :id="id('clip-body')"><use :href="hrefOf('body-shape')"/></clipPath>
        <clipPath :id="id('clip-eye-l')"><path d="M120 300 C124 284 140 276 154 278 C168 280 176 292 174 304 C172 318 158 326 144 324 C130 322 118 314 120 300 Z"/></clipPath>
        <clipPath :id="id('clip-eye-r')"><path d="M232 304 C234 290 248 280 262 282 C276 284 286 296 284 310 C282 322 268 330 254 328 C240 326 230 318 232 304 Z"/></clipPath>

        <filter :id="id('blob6')" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
        <filter :id="id('blob3')" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>
        <filter :id="id('hline6')" x="-15%" y="-400%" width="130%" height="900%"><feGaussianBlur stdDeviation="6"/></filter>
        <filter :id="id('hline3')" x="-15%" y="-400%" width="130%" height="900%"><feGaussianBlur stdDeviation="3"/></filter>
        <filter :id="id('vline3')" x="-400%" y="-15%" width="900%" height="130%"><feGaussianBlur stdDeviation="3"/></filter>

      <radialGradient :id="id('burst')" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#FFE45C" stop-opacity="0.9"/>
        <stop offset="0.5" stop-color="#FFB703" stop-opacity="0.35"/>
        <stop offset="1" stop-color="#FFB703" stop-opacity="0"/>
      </radialGradient>
      <filter :id="id('glow')" x="-30%" y="-80%" width="160%" height="260%">
        <feGaussianBlur stdDeviation="5" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>

    <ellipse v-if="isFull" cx="203" cy="700" rx="112" ry="10" fill="#3A0508" opacity="0.28" :filter="url('hline6')"/>

    <g class="gg-float">
      <g class="gg-jump">
        <circle v-if="powering" class="gg-burst" cx="202" cy="400" r="230" :fill="url('burst')" />

        <g v-if="isFull" class="gg-body">
          <!-- 腿：往下收，脚尖外撇 -->
          <g :id="id('leg-l')">
            <path d="M120 598 C122 630 126 656 126 676 C120 688 104 694 98 702 C96 706 104 707 112 706 L168 706 C174 704 174 698 170 690 C166 680 168 660 172 640 C175 624 178 610 182 604 Z" :fill="url('leg')"/>
            <path d="M104 703 C126 704 150 704 168 702" fill="none" stroke="#4A0508" stroke-width="3" opacity="0.5" stroke-linecap="round"/>
          </g>
          <use :href="hrefOf('leg-l')" transform="translate(406 0) scale(-1 1)"/>
          <ellipse cx="150" cy="616" rx="36" ry="14" fill="#3A0508" opacity="0.55" :filter="url('hline6')"/>
          <ellipse cx="256" cy="616" rx="36" ry="14" fill="#3A0508" opacity="0.55" :filter="url('hline6')"/>

          <!-- 手臂（左），右臂镜像 -->
          <g class="gg-arm gg-arm-left">
          <g :id="id('arm-l')">
            <path d="M118 414 C96 418 72 424 54 418 C42 426 40 442 46 452 C66 458 90 462 108 464 Z" :fill="url('suit')"/>
            <path d="M104 419 C86 418 70 419 58 421" fill="none" stroke="#FF6B5E" stroke-width="4" opacity="0.3" stroke-linecap="round" :filter="url('hline3')"/>
            <g transform="rotate(-28 40 432)">
              <path d="M28 414 C20 410 14 404 6 402 C0 401 -2 406 2 409 C-4 410 -5 416 0 418 C-5 421 -4 427 2 428 C-2 432 0 437 6 436 C12 436 18 440 22 446 L30 446 Z" :fill="url('suit')"/>
              <path d="M4 409 L15 412 M2 418 L15 419 M3 428 L15 426" stroke="#5A070C" stroke-width="1.6" opacity="0.6" stroke-linecap="round"/>
              <path d="M30 410 C40 408 50 410 54 414 C56 426 56 440 52 450 C44 454 34 454 26 450 C24 438 25 422 30 410 Z" :fill="url('cuff')"/>
              <path d="M52 414 C55 426 55 440 51 450" fill="none" stroke="#B88400" stroke-width="2.5" opacity="0.6"/>
            </g>
          </g>
          </g>
          <g class="gg-arm gg-arm-right">
            <use :href="hrefOf('arm-l')" transform="translate(405 0) scale(-1 1)"/>
          </g>

          <!-- 躯干 -->
          <use :href="hrefOf('body-shape')" :fill="url('suit')"/>
          <g :clip-path="url('clip-body')">
            <use :href="hrefOf('body-shape')" fill="none" stroke="#3A0508" stroke-width="34" opacity="0.4" :filter="url('blob6')"/>
            <ellipse cx="148" cy="472" rx="42" ry="56" fill="#fff" opacity="0.1" :filter="url('blob6')"/>
            <!-- 肚子下方鼓起的腰带：上沿暗、中间亮 -->
            <path d="M70 552 C130 578 276 578 336 552" fill="none" stroke="#3A0508" stroke-width="12" opacity="0.5" :filter="url('hline3')"/>
            <path d="M80 568 C140 592 266 592 326 568" fill="none" stroke="#F04A44" stroke-width="7" opacity="0.4" :filter="url('hline3')"/>
            <ellipse cx="203" cy="644" rx="150" ry="30" fill="#3A0508" opacity="0.4" :filter="url('blob6')"/>
            <!-- 头在身上的投影 -->
            <ellipse cx="203" cy="410" rx="124" ry="22" fill="#2A0306" opacity="0.6" :filter="url('blob6')"/>
          </g>

          <!-- 胸前猪头徽章 -->
          <g class="gg-emblem" transform="translate(-6 0)" :filter="powering ? url('glow') : undefined">
            <ellipse cx="160" cy="485" rx="8.5" ry="7.5" :fill="url('emblem')" stroke="#8E0D13" stroke-width="3" paint-order="stroke"/>
            <ellipse cx="242" cy="485" rx="8.5" ry="7.5" :fill="url('emblem')" stroke="#8E0D13" stroke-width="3" paint-order="stroke"/>
            <ellipse cx="201" cy="527" rx="47" ry="31" :fill="url('emblem')" stroke="#8E0D13" stroke-width="3.5" paint-order="stroke"/>
            <ellipse cx="196" cy="508" rx="26" ry="7" fill="#fff" opacity="0.35" :filter="url('hline3')"/>
            <rect x="175" y="510" width="14" height="34" rx="7" fill="#A8121A"/>
            <rect x="213" y="510" width="14" height="34" rx="7" fill="#A8121A"/>
          </g>
        </g>

        <g class="gg-head">
          <!-- 头套后层 -->
          <path d="M60 300 C52 226 100 162 203 156 C306 162 354 226 346 300 C344 336 336 356 324 368 L82 368 C70 356 62 336 60 300 Z" :fill="url('hood')"/>
          <path d="M66 268 C62 286 62 306 66 320" fill="none" stroke="#F3E3DC" stroke-width="7" stroke-linecap="round" opacity="0.85"/>
          <path d="M340 268 C344 286 344 306 340 320" fill="none" stroke="#F3E3DC" stroke-width="7" stroke-linecap="round" opacity="0.85"/>

          <!-- 猪耳朵：尖一点，略往上翘 -->
          <g class="gg-ear gg-ear-left">
          <g :id="id('ear-l')" transform="rotate(-24 98 220) translate(-4 10)">
            <path d="M100 192 C88 176 66 170 50 176 C44 190 48 214 62 232 C72 242 86 246 96 240 C104 226 106 206 100 192 Z" :fill="url('ear')"/>
            <path d="M92 198 C82 188 68 184 58 188 C56 202 62 220 74 230 C82 234 90 232 94 226 C98 216 98 206 92 198 Z" fill="#E59484" opacity="0.55"/>
          </g>
          </g>
          <g class="gg-ear gg-ear-right">
            <use :href="hrefOf('ear-l')" transform="translate(408 6) scale(-1 1)"/>
          </g>

          <!-- 脸 -->
          <use :href="hrefOf('face-shape')" :fill="url('skin')"/>
          <g :clip-path="url('clip-face')">
            <use :href="hrefOf('face-shape')" fill="none" stroke="#B0684E" stroke-width="30" opacity="0.42" :filter="url('blob6')"/>
            <ellipse class="gg-cheek" cx="102" cy="364" rx="36" ry="26" :fill="url('cheek')"/>
            <ellipse class="gg-cheek" cx="304" cy="364" rx="36" ry="26" :fill="url('cheek')"/>
            <!-- 眼睛下方鼓起的脸颊 -->
            <ellipse cx="140" cy="334" rx="26" ry="8" fill="#fff" opacity="0.35" :filter="url('hline3')"/>
            <ellipse cx="262" cy="338" rx="26" ry="8" fill="#fff" opacity="0.35" :filter="url('hline3')"/>
            <!-- 头套下沿在额头上的投影 -->
            <path d="M60 262 C92 248 122 252 150 258 C172 262 190 254 203 246 C216 254 234 262 256 258 C284 252 314 248 346 262" fill="none" stroke="#7A3424" stroke-width="16" opacity="0.4" :filter="url('hline6')"/>
          </g>

          <!-- 头套前沿：两块眉脊隆起，中间鼻梁凸起，下沿波浪 -->
          <path :id="id('mask')" d="M68 262 C70 214 100 176 140 168 C164 163 186 170 203 182 C220 170 242 163 266 168 C306 176 336 214 338 262 C316 248 290 244 262 250 C238 255 220 250 203 238 C186 250 168 255 144 250 C116 244 90 248 68 262 Z" :fill="url('mask')"/>
          <path d="M80 232 C96 200 122 180 150 176 C172 173 190 180 203 190 C216 180 234 173 256 176 C284 180 310 200 326 232" fill="none" stroke="#FF6A5E" stroke-width="5" opacity="0.35" :filter="url('blob3')"/>
          <path d="M203 190 C200 206 200 222 203 236" fill="none" stroke="#FF6A5E" stroke-width="6" opacity="0.3" :filter="url('vline3')"/>
          <ellipse cx="146" cy="176" rx="34" ry="8" fill="#FF8070" opacity="0.4" :filter="url('hline3')"/>
          <ellipse cx="260" cy="176" rx="34" ry="8" fill="#FF8070" opacity="0.4" :filter="url('hline3')"/>
          <path d="M74 258 C100 244 126 244 146 248 C170 252 188 246 203 234 C218 246 236 252 260 248 C280 244 306 244 332 258" fill="none" stroke="#5A070C" stroke-width="5" opacity="0.55" :filter="url('hline3')"/>

          <!-- 黄色镜片：斜杏仁形，内侧厚外侧尖，嵌在深红边框里 -->
          <g class="gg-visor" :filter="powering ? url('glow') : undefined">
          <g :id="id('lens-l')">
            <path d="M182 210 C172 194 156 178 136 176 C116 175 102 186 102 199 C102 208 110 213 122 213 C142 213 164 211 182 210 Z" fill="#6E0A10" opacity="0.6" :filter="url('blob3')"/>
            <path d="M180 208 C170 194 155 181 137 180 C119 179 106 188 106 199 C106 206 112 210 122 210 C141 210 162 209 180 208 Z" :fill="url('lens')"/>
            <path d="M106 199 C106 188 119 179 137 180 C155 181 170 194 180 208" fill="none" stroke="#7A0B11" stroke-width="4" opacity="0.5" :filter="url('blob3')"/>
            <path d="M118 190 C126 185 136 184 146 186" fill="none" stroke="#fff" stroke-width="4" opacity="0.8" stroke-linecap="round" :filter="url('hline3')"/>
          </g>
          <use :href="hrefOf('lens-l')" transform="translate(406 0) scale(-1 1)"/>
          </g>

          <!-- 眉毛：两头细中间粗 -->
          <path class="gg-brow" d="M120 270 C132 258 152 254 170 260 C162 262 146 262 132 268 C126 271 122 272 120 270 Z" fill="#5B2E18"/>
          <path class="gg-brow" d="M236 262 C254 256 274 260 286 272 C284 274 280 273 274 270 C260 264 244 264 236 262 Z" fill="#5B2E18"/>

          <!-- 眼睛 -->
          <g :id="id('eyes')">
            <path d="M120 300 C124 284 140 276 154 278 C168 280 176 292 174 304 C172 318 158 326 144 324 C130 322 118 314 120 300 Z" fill="#fff"/>
            <g :clip-path="url('clip-eye-l')">
              <g class="gg-pupil" :transform="pupilTransform">
                <circle cx="150" cy="303" r="22" :fill="url('iris')"/>
                <circle cx="150" cy="304" r="11" fill="#120804"/>
                <ellipse cx="157" cy="294" rx="7" ry="6" fill="#fff"/>
                <circle cx="143" cy="312" r="2" fill="#fff" opacity="0.7"/>
              </g>
              <path d="M116 286 C130 278 162 276 180 288 L180 268 L116 268 Z" fill="#F2C4A8"/>
              <path d="M116 286 C130 278 162 276 180 288" fill="none" stroke="#8A4A30" stroke-width="5" opacity="0.25" :filter="url('hline3')"/>
              <rect class="gg-lid" x="114" y="272" width="66" height="58" fill="#F2C4A8"/>
            </g>
            <path d="M121 288 C132 280 160 278 175 289" fill="none" stroke="#5A3020" stroke-width="1.6" opacity="0.55" stroke-linecap="round"/>

            <path d="M232 304 C234 290 248 280 262 282 C276 284 286 296 284 310 C282 322 268 330 254 328 C240 326 230 318 232 304 Z" fill="#fff"/>
            <g :clip-path="url('clip-eye-r')">
              <g class="gg-pupil" :transform="pupilTransform">
                <circle cx="256" cy="307" r="22" :fill="url('iris')"/>
                <circle cx="256" cy="308" r="11" fill="#120804"/>
                <ellipse cx="263" cy="298" rx="7" ry="6" fill="#fff"/>
                <circle cx="249" cy="316" r="2" fill="#fff" opacity="0.7"/>
              </g>
              <path d="M226 290 C240 282 272 280 290 292 L290 272 L226 272 Z" fill="#F2C4A8"/>
              <path d="M226 290 C240 282 272 280 290 292" fill="none" stroke="#8A4A30" stroke-width="5" opacity="0.25" :filter="url('hline3')"/>
              <rect class="gg-lid" x="226" y="276" width="64" height="58" fill="#F2C4A8"/>
            </g>
            <path d="M231 292 C242 284 270 282 285 293" fill="none" stroke="#5A3020" stroke-width="1.6" opacity="0.55" stroke-linecap="round"/>
          </g>

          <!-- 鼻子：有体积的鼻头，下方投影 -->
          <ellipse cx="200" cy="386" rx="46" ry="10" fill="#9A5A46" opacity="0.4" :filter="url('hline3')"/>
          <path d="M150 352 C150 330 172 318 200 318 C230 318 252 330 252 352 C252 374 230 386 200 386 C170 386 150 374 150 352 Z" :fill="url('snout')"/>
          <ellipse cx="190" cy="332" rx="26" ry="8" fill="#fff" opacity="0.45" :filter="url('hline3')"/>
          <ellipse cx="184" cy="354" rx="5" ry="11" fill="#3E1A10"/>
          <ellipse cx="216" cy="354" rx="5" ry="11" fill="#3E1A10"/>

          <!-- 嘴：右边嘴角上扬的歪嘴笑 -->
          <path class="gg-mouth" :d="mouthPath" fill="#7A3424"/>
        </g>
      </g>
    </g>
  </svg>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    /** full = 全身（首页轨道中心），head = 只有头（Logo 等小尺寸） */
    variant?: 'full' | 'head'
    label?: string
    /** 关闭指针跟随、眨眼等动效 */
    still?: boolean
  }>(),
  { variant: 'full', label: 'GGbond', still: false }
)

const emit = defineEmits<{ power: [] }>()

const VIEWBOX = { full: '-12 140 430 575', head: '22 146 362 300' } as const
const MOUTH = {
  idle: 'M160 396 C178 406 210 408 238 394 C240 392 243 393 242 396 C226 414 182 414 158 400 C155 398 157 395 160 396 Z',
  happy: 'M156 392 C176 406 214 408 244 388 C247 386 250 388 248 392 C230 420 180 420 154 398 C151 395 153 391 156 392 Z'
} as const
const PUPIL_MAX_OFFSET = 5
const BLINK_MS = 140
const POWER_MS = 1200

// 同页可能有多个实例（首页 + Logo），渐变 id 必须唯一
const uid = `gg-${Math.random().toString(36).slice(2, 9)}`
const id = (name: string) => `${uid}-${name}`
const url = (name: string) => `url(#${id(name)})`
const hrefOf = (name: string) => `#${id(name)}`

const svgRef = ref<SVGSVGElement | null>(null)
const happy = ref(false)
const powering = ref(false)
const blinking = ref(false)
const pupil = ref({ x: 0, y: 0 })

const isFull = computed(() => props.variant === 'full')
const viewBox = computed(() => VIEWBOX[props.variant])
const mouthPath = computed(() => (happy.value || powering.value ? MOUTH.happy : MOUTH.idle))
const pupilTransform = computed(() => `translate(${pupil.value.x} ${pupil.value.y})`)

const reducedMotion =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const animated = computed(() => !props.still && !reducedMotion)

function trackPointer(event: PointerEvent) {
  const rect = svgRef.value?.getBoundingClientRect()
  if (!rect || rect.width === 0) return
  const dx = event.clientX - (rect.left + rect.width / 2)
  const dy = event.clientY - (rect.top + rect.height * (isFull.value ? 0.3 : 0.5))
  const distance = Math.hypot(dx, dy) || 1
  const strength = Math.min(distance / 300, 1) * PUPIL_MAX_OFFSET
  pupil.value = { x: (dx / distance) * strength, y: (dy / distance) * strength }
}

let blinkTimer: ReturnType<typeof setTimeout> | undefined
let powerTimer: ReturnType<typeof setTimeout> | undefined

function scheduleBlink() {
  blinkTimer = setTimeout(
    () => {
      blinking.value = true
      blinkTimer = setTimeout(() => {
        blinking.value = false
        scheduleBlink()
      }, BLINK_MS)
    },
    2500 + Math.random() * 2500
  )
}

function powerUp() {
  if (powering.value) return
  emit('power')
  if (!animated.value) return
  powering.value = true
  powerTimer = setTimeout(() => (powering.value = false), POWER_MS)
}

onMounted(() => {
  if (!animated.value) return
  window.addEventListener('pointermove', trackPointer, { passive: true })
  scheduleBlink()
})

onUnmounted(() => {
  window.removeEventListener('pointermove', trackPointer)
  clearTimeout(blinkTimer)
  clearTimeout(powerTimer)
})
</script>

<style scoped>
.gg-mascot {
  overflow: visible;
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.gg-float {
  animation: gg-float 4.2s ease-in-out infinite;
}

.gg-jump,
.gg-arm,
.gg-ear,
.gg-lid,
.gg-cheek,
.gg-brow {
  transform-box: fill-box;
}

.gg-arm-left {
  transform-origin: 100% 55%;
  animation: gg-wave-left 3.6s ease-in-out infinite;
}

.gg-arm-right {
  transform-origin: 0% 55%;
  animation: gg-wave-right 3.6s ease-in-out infinite;
}

.gg-ear-left {
  transform-origin: 90% 65%;
}

.gg-ear-right {
  transform-origin: 10% 65%;
}

.gg-pupil {
  transition: transform 0.18s ease-out;
}

.gg-lid {
  transform-origin: 50% 0%;
  transform: scaleY(0);
  transition: transform 0.07s ease-in;
}

.gg-eyes.is-blinking .gg-lid {
  transform: scaleY(1);
}

.gg-mouth {
  transition: d 0.25s ease-out;
}

.gg-cheek {
  transform-origin: center;
  transition: transform 0.25s ease-out;
}

.gg-brow {
  transition: transform 0.25s ease-out;
}

.is-happy .gg-ear-left {
  animation: gg-ear-left 0.5s ease-in-out infinite;
}

.is-happy .gg-ear-right {
  animation: gg-ear-right 0.5s ease-in-out infinite;
}

.is-happy .gg-cheek {
  transform: scale(1.15);
}

.is-happy .gg-brow {
  transform: translateY(-3px);
}

.is-powering .gg-jump {
  transform-origin: 50% 100%;
  animation: gg-jump 1.2s cubic-bezier(0.3, 0.7, 0.4, 1);
}

.is-powering .gg-arm-left,
.is-powering .gg-arm-right {
  animation-duration: 0.4s;
}

.gg-burst {
  animation: gg-burst 1.2s ease-out forwards;
  transform-box: fill-box;
  transform-origin: center;
}

@keyframes gg-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

@keyframes gg-wave-left {
  0%, 60%, 100% { transform: rotate(0deg); }
  70% { transform: rotate(-14deg); }
  80% { transform: rotate(4deg); }
  90% { transform: rotate(-10deg); }
}

@keyframes gg-wave-right {
  0%, 10%, 100% { transform: rotate(0deg); }
  20% { transform: rotate(14deg); }
  30% { transform: rotate(-4deg); }
  40% { transform: rotate(10deg); }
  50% { transform: rotate(0deg); }
}

@keyframes gg-ear-left {
  0%, 100% { transform: rotate(0deg); }
  50% { transform: rotate(-10deg); }
}

@keyframes gg-ear-right {
  0%, 100% { transform: rotate(0deg); }
  50% { transform: rotate(10deg); }
}

@keyframes gg-jump {
  0% { transform: translateY(0) scale(1, 1); }
  15% { transform: translateY(0) scale(1.06, 0.92); }
  40% { transform: translateY(-36px) scale(0.96, 1.05); }
  65% { transform: translateY(0) scale(1.04, 0.96); }
  100% { transform: translateY(0) scale(1, 1); }
}

@keyframes gg-burst {
  0% { transform: scale(0.3); opacity: 0; }
  30% { opacity: 1; }
  100% { transform: scale(1.2); opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .gg-float,
  .gg-arm-left,
  .gg-arm-right,
  .is-happy .gg-ear-left,
  .is-happy .gg-ear-right,
  .is-powering .gg-jump,
  .gg-burst {
    animation: none;
  }
}
</style>
