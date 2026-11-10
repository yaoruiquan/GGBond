<template>
  <section v-if="visibleMethods.length" class="relative z-10 w-full px-4 py-6 sm:px-6" aria-labelledby="home-contact-title">
    <div class="mx-auto max-w-5xl border-t border-gray-200/70 pt-5 dark:border-dark-700">
      <h2 id="home-contact-title" class="text-center text-sm font-medium text-gray-500 dark:text-dark-400">{{ t('contactMethods.title') }}</h2>
      <div class="mt-3 flex flex-wrap justify-center gap-3">
        <article v-for="method in visibleMethods" :key="method.id" class="flex max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-xl border border-gray-200/80 bg-white/70 px-4 py-3 dark:border-dark-700 dark:bg-dark-900/70">
          <span class="min-w-0 max-w-full break-words text-sm font-medium text-gray-800 dark:text-dark-100">{{ method.label }}</span>
          <span v-if="method.text" class="max-w-full whitespace-pre-wrap break-words text-sm text-gray-500 dark:text-dark-400 sm:max-w-sm">{{ method.text }}</span>
          <div class="flex shrink-0 items-center gap-3">
            <button v-if="method.text" type="button" class="contact-action" @click="copyToClipboard(method.text)">{{ t('contactMethods.copy') }}</button>
            <button
              v-if="method.image_data_url"
              type="button"
              class="contact-action inline-flex items-center gap-1"
              :aria-label="t('contactMethods.previewImage', { label: method.label })"
              aria-haspopup="dialog"
              :aria-expanded="activeId === method.id"
              :aria-controls="activeId === method.id ? 'home-contact-preview' : undefined"
              @pointerenter="onPointerEnter(method, $event)"
              @pointerleave="scheduleClose"
              @focus="onFocus(method, $event)"
              @blur="scheduleClose"
              @click="togglePinned(method, $event)"
              @keydown.tab="focusPreview($event)"
            >
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                <path d="M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h3v3h3v3h-6zM12 3v3m0 6h3m-3 3v6m6-9h3" />
              </svg>
              {{ t('contactMethods.preview') }}
            </button>
          </div>
        </article>
      </div>
    </div>
    <Teleport to="body">
      <div
        v-if="activeMethod"
        id="home-contact-preview"
        ref="popover"
        role="dialog"
        aria-modal="false"
        aria-labelledby="home-contact-preview-label"
        class="fixed z-[60] overflow-auto rounded-2xl border border-gray-200 bg-white p-4 shadow-xl"
        :style="popoverStyle"
        @pointerenter="cancelClose"
        @pointerleave="scheduleClose"
        @focusin="cancelClose"
        @focusout="scheduleClose"
      >
        <div class="mb-3 flex items-center justify-between gap-3">
          <h3 id="home-contact-preview-label" class="min-w-0 break-words text-sm font-semibold text-gray-900">{{ activeMethod.label }}</h3>
          <button type="button" class="shrink-0 rounded-lg p-1 text-gray-500 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500" :aria-label="t('common.close')" @click="close(true)">
            <Icon name="x" size="sm" />
          </button>
        </div>
        <img :key="activeMethod.image_data_url" :src="activeMethod.image_data_url" :alt="activeMethod.label" class="aspect-square w-full bg-white p-2 object-contain" @load="imageFailed = false" @error="imageFailed = true" />
        <p v-if="imageFailed" role="status" class="mt-2 text-xs text-amber-700">{{ t('contactMethods.imageLoadFailed') }}</p>
        <p v-if="activeMethod.text" class="mt-2 max-h-20 overflow-auto whitespace-pre-wrap break-words text-center text-xs text-gray-500">{{ activeMethod.text }}</p>
      </div>
    </Teleport>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ContactMethod } from '@/types'
import Icon from '@/components/icons/Icon.vue'
import { useClipboard } from '@/composables/useClipboard'

const props = defineProps<{ methods: ContactMethod[] }>()
const { t } = useI18n()
const { copyToClipboard } = useClipboard()
const visibleMethods = computed(() => props.methods.filter(method => method.enabled && (method.text.trim() || method.image_data_url)))
const activeId = ref<string | null>(null)
const activeMethod = computed(() => visibleMethods.value.find(method => method.id === activeId.value) ?? null)
const popover = ref<HTMLElement | null>(null)
const popoverStyle = ref<Record<string, string>>({ visibility: 'hidden' })
const imageFailed = ref(false)
let trigger: HTMLElement | null = null
let pinned = false
let restoringFocus = false
let closeTimer: ReturnType<typeof setTimeout> | undefined

watch(() => activeMethod.value?.image_data_url, () => {
  imageFailed.value = false
  if (activeId.value && !activeMethod.value) close()
  void nextTick(positionPopover)
})

function cancelClose() {
  clearTimeout(closeTimer)
}

function scheduleClose() {
  cancelClose()
  if (pinned) return
  closeTimer = setTimeout(() => {
    if (popover.value?.contains(document.activeElement)) return
    close()
  }, 160)
}

function positionPopover() {
  if (!trigger || !popover.value || !activeMethod.value) return
  const gap = 10
  const margin = 12
  const width = Math.min(280, window.innerWidth - margin * 2)
  const rect = trigger.getBoundingClientRect()
  // Reposition after scrolling; close when the trigger is no longer on screen.
  if (rect.bottom < 0 || rect.top > window.innerHeight) { close(); return }
  const height = Math.min(popover.value.getBoundingClientRect().height, window.innerHeight - margin * 2)
  const left = Math.max(margin, Math.min(window.innerWidth - width - margin, rect.left + rect.width / 2 - width / 2))
  const preferredTop = rect.top >= height + gap + margin ? rect.top - height - gap : rect.bottom + gap
  const top = Math.max(margin, Math.min(window.innerHeight - height - margin, preferredTop))
  popoverStyle.value = { width: `${width}px`, maxHeight: `${window.innerHeight - margin * 2}px`, left: `${left}px`, top: `${top}px` }
}

function open(method: ContactMethod, element: HTMLElement) {
  if (!method.image_data_url || restoringFocus) return
  cancelClose()
  if (activeId.value !== method.id) {
    pinned = false
    popoverStyle.value = { visibility: 'hidden', width: `${Math.min(280, window.innerWidth - 24)}px` }
  }
  trigger = element
  activeId.value = method.id
  void nextTick(positionPopover)
}

function onPointerEnter(method: ContactMethod, event: PointerEvent) {
  if (event.pointerType === 'touch') return
  open(method, event.currentTarget as HTMLElement)
}

function onFocus(method: ContactMethod, event: FocusEvent) {
  open(method, event.currentTarget as HTMLElement)
}

function togglePinned(method: ContactMethod, event: MouseEvent) {
  if (activeId.value === method.id && pinned) { close(); return }
  open(method, event.currentTarget as HTMLElement)
  pinned = true
}

function close(restoreFocus = false) {
  cancelClose()
  const previousTrigger = trigger
  activeId.value = null
  pinned = false
  trigger = null
  if (restoreFocus && previousTrigger?.isConnected) {
    restoringFocus = true
    previousTrigger.focus({ preventScroll: true })
    restoringFocus = false
  }
}

function focusPreview(event: KeyboardEvent) {
  if (event.shiftKey || !activeMethod.value || !popover.value) return
  event.preventDefault()
  popover.value.querySelector<HTMLButtonElement>('button')?.focus()
}

function onDocumentPointerDown(event: PointerEvent) {
  const target = event.target
  if (target instanceof Node && !trigger?.contains(target) && !popover.value?.contains(target)) close()
}

function onDocumentKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape' && activeId.value) {
    event.preventDefault()
    close(true)
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown, true)
  document.addEventListener('keydown', onDocumentKeyDown)
  window.addEventListener('resize', positionPopover)
  window.addEventListener('scroll', positionPopover, true)
})
onBeforeUnmount(() => {
  cancelClose()
  document.removeEventListener('pointerdown', onDocumentPointerDown, true)
  document.removeEventListener('keydown', onDocumentKeyDown)
  window.removeEventListener('resize', positionPopover)
  window.removeEventListener('scroll', positionPopover, true)
})
</script>

<style scoped>
.contact-action {
  @apply rounded px-1 py-1 text-xs font-medium text-primary-600 hover:text-primary-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 dark:text-primary-400 dark:hover:text-primary-300;
}
</style>
