<template>
  <div class="flex justify-between gap-2">
    <span class="text-gray-500 dark:text-gray-400">{{ label }}</span>
    <span class="font-mono">{{ display }}</span>
  </div>
</template>

<script setup lang="ts">
import { useBillingCurrency } from '@/composables/useBillingCurrency'
const { formatPrice } = useBillingCurrency()
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    label: string
    value: number | null
    unit: string
    scale: number
  }>(),
  { value: null }
)

const display = computed(() =>
  props.value == null ? '-' : `${formatPrice(props.value, props.scale)} ${props.unit}`
)
</script>
