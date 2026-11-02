<template>
  <article class="featured-card" :class="align === 'right' ? 'lg:text-right' : 'lg:text-left'">
    <div
      class="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-card-ggbond ring-2 ring-ggbond-yellow-400/70"
    >
      <ModelIcon :model="model" size="30px" />
    </div>
    <p class="text-xs font-medium tracking-[0.2em] text-primary-600 dark:text-ggbond-yellow-300">
      {{ category }}
    </p>
    <h3 class="mt-2 text-2xl font-bold text-gray-950 dark:text-white">{{ name }}</h3>
    <p class="mt-2 text-sm leading-6 text-gray-600 dark:text-dark-300">{{ description }}</p>
  </article>
</template>

<script setup lang="ts">
import ModelIcon from '@/components/common/ModelIcon.vue'

withDefaults(
  defineProps<{
    model: string
    name: string
    category: string
    description: string
    align?: 'left' | 'right'
  }>(),
  { align: 'left' }
)
</script>

<style scoped>
.featured-card {
  @apply w-full max-w-[15rem] text-center;
}
</style>
