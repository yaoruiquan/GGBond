<template>
  <div class="inline-flex items-center gap-3" :class="compact ? 'gap-2.5' : 'gap-3'">
    <!-- 猪猪侠主题 Logo 容器 -->
    <div
      class="flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-ggbond-skin-100 to-ggbond-yellow-50 shadow-lg shadow-primary-500/20 ring-1 ring-primary-500/15 dark:from-primary-900/20 dark:to-ggbond-yellow-900/20 dark:ring-primary-500/20"
      :class="compact ? 'h-10 w-10' : 'h-12 w-12'"
    >
      <img :src="resolvedLogo" :alt="name" class="h-full w-full object-contain" />
    </div>
    <div v-if="showText" class="min-w-0 text-left">
      <p
        class="truncate font-semibold tracking-tight text-gray-950 dark:text-white"
        :class="compact ? 'text-base' : 'text-xl'"
      >
        {{ name }}
      </p>
      <p
        v-if="subtitle"
        class="truncate text-xs font-medium uppercase tracking-[0.24em] text-primary-600 dark:text-primary-400"
      >
        {{ subtitle }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { sanitizeUrl } from '@/utils/url'

const props = withDefaults(
  defineProps<{
    name?: string
    logo?: string
    subtitle?: string
    compact?: boolean
    showText?: boolean
  }>(),
  {
    name: 'GGbond AI',
    logo: '',
    subtitle: '',
    compact: false,
    showText: true
  }
)

const resolvedLogo = computed(
  () => sanitizeUrl(props.logo || '/ggbond-logo.svg', { allowRelative: true, allowDataUrl: true }) || '/ggbond-logo.svg'
)
</script>
