<template>
  <div class="space-y-4" data-testid="contact-methods-editor">
    <article
      v-for="(method, index) in modelValue"
      :key="method.id"
      class="space-y-4 rounded-lg border border-gray-200 p-4 dark:border-dark-700"
      :data-testid="`contact-method-${index}`"
    >
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h3 class="min-w-0 max-w-full break-words text-sm font-semibold text-gray-900 dark:text-white">
          {{ method.label.trim() || t('contactMethods.item', { number: index + 1 }) }}
        </h3>
        <div class="flex items-center gap-2">
          <label class="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input v-model="method.enabled" type="checkbox" class="toggle-checkbox" :aria-label="t('contactMethods.enabled')" @change="emitUpdate" />
            {{ t('contactMethods.enabled') }}
          </label>
          <button type="button" class="btn btn-secondary btn-sm" :disabled="index === 0" :aria-label="t('contactMethods.moveUp')" @click="move(index, -1)">
            <Icon name="chevronUp" size="sm" />
          </button>
          <button type="button" class="btn btn-secondary btn-sm" :disabled="index === modelValue.length - 1" :aria-label="t('contactMethods.moveDown')" @click="move(index, 1)">
            <Icon name="chevronDown" size="sm" />
          </button>
          <button type="button" class="btn btn-secondary btn-sm text-red-600" :aria-label="t('contactMethods.remove')" @click="remove(index)">
            <Icon name="trash" size="sm" />
          </button>
        </div>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <div>
          <label class="input-label" :for="`contact-label-${method.id}`">{{ t('contactMethods.label') }}</label>
          <input :id="`contact-label-${method.id}`" v-model="method.label" class="input" maxlength="80" :placeholder="t('contactMethods.labelPlaceholder')" @input="emitUpdate" />
        </div>
        <div>
          <label class="input-label" :for="`contact-text-${method.id}`">{{ t('contactMethods.text') }}</label>
          <textarea :id="`contact-text-${method.id}`" v-model="method.text" class="input min-h-20" maxlength="1000" :placeholder="t('contactMethods.textPlaceholder')" @input="emitUpdate"></textarea>
        </div>
      </div>

      <div>
        <p class="input-label">{{ t('contactMethods.qrImage') }}</p>
        <ImageUpload
          :model-value="method.image_data_url"
          mode="image"
          :defer-update="true"
          :allowed-types="[...CONTACT_METHOD_LIMITS.imageTypes]"
          :max-size="CONTACT_METHOD_LIMITS.imageBytes"
          :disabled="busy"
          :upload-label="t('contactMethods.chooseImage')"
          :remove-label="t('contactMethods.removeImage')"
          :hint="t('contactMethods.imageHint')"
          @busy-change="setImageBusy(method.id, $event)"
          @image-read="validateCandidate(method, $event)"
          @update:model-value="removeCandidateImage(method)"
        />
        <p v-if="candidateErrors.get(method.id)" role="alert" class="mt-2 text-sm text-red-600 dark:text-red-400">{{ t(candidateErrors.get(method.id)!) }}</p>
      </div>
    </article>

    <p v-if="shapeError" role="alert" class="text-sm text-red-600 dark:text-red-400">{{ t(shapeError) }}</p>
    <p v-if="totalImageError" role="alert" class="text-sm text-red-600 dark:text-red-400">{{ t('contactMethods.errors.totalImagesTooLarge') }}</p>
    <p v-if="busy" role="status" class="text-sm text-gray-500 dark:text-gray-400">{{ t('contactMethods.validatingImages') }}</p>
    <button type="button" class="btn btn-secondary" :disabled="modelValue.length >= CONTACT_METHOD_LIMITS.count || busy" @click="add">
      <Icon name="plus" size="sm" class="mr-1.5" />{{ t('contactMethods.add') }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ContactMethod } from '@/types'
import Icon from '@/components/icons/Icon.vue'
import ImageUpload from '@/components/common/ImageUpload.vue'
import { CONTACT_METHOD_LIMITS, createContactMethod, validateContactImage, validateContactMethodShape } from '@/utils/contactMethods'

const props = defineProps<{ modelValue: ContactMethod[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: ContactMethod[]]; 'busy-change': [busy: boolean] }>()
const { t } = useI18n()
const busyIds = ref(new Set<string>())
const busy = computed(() => busyIds.value.size > 0 || validationCount.value > 0)
const validationCount = ref(0)
const candidateTokens = new Map<string, number>()
const shapeError = computed(() => validateContactMethodShape(props.modelValue))
const imageTotal = computed(() => props.modelValue.reduce((sum, item) => sum + imageDataBytes(item.image_data_url), 0))
const totalImageError = computed(() => imageTotal.value > CONTACT_METHOD_LIMITS.totalImageBytes)
const candidateErrors = ref(new Map<string, string>())

watch(busy, value => emit('busy-change', value), { immediate: true })

function imageDataBytes(value: string): number {
  if (!value) return 0
  const payload = value.slice(value.indexOf(',') + 1)
  return Math.floor(payload.length * 3 / 4) - (payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0)
}

function setImageBusy(id: string, isBusy: boolean): void {
  if (isBusy) {
    candidateTokens.set(id, (candidateTokens.get(id) ?? 0) + 1)
    const nextBusy = new Set(busyIds.value)
    nextBusy.add(id)
    busyIds.value = nextBusy
    const nextErrors = new Map(candidateErrors.value)
    nextErrors.delete(id)
    candidateErrors.value = nextErrors
  }
  if (!isBusy) {
    const next = new Set(busyIds.value)
    next.delete(id)
    busyIds.value = next
  }
}

async function validateCandidate(method: ContactMethod, candidate: string): Promise<void> {
  const token = (candidateTokens.get(method.id) ?? 0) + 1
  candidateTokens.set(method.id, token)
  const nextBusy = new Set(busyIds.value)
  nextBusy.add(method.id)
  busyIds.value = nextBusy
  const bytes = imageDataBytes(candidate)
  const currentBytes = imageDataBytes(method.image_data_url)
  let error: string | null = bytes > CONTACT_METHOD_LIMITS.imageBytes
    ? 'contactMethods.errors.imageTooLarge'
    : imageTotal.value - currentBytes + bytes > CONTACT_METHOD_LIMITS.totalImageBytes
      ? 'contactMethods.errors.totalImagesTooLarge'
      : null
  if (!error) {
    validationCount.value += 1
    try {
      error = await validateContactImage(candidate)
    } finally {
      validationCount.value -= 1
    }
  }
  if (candidateTokens.get(method.id) !== token) return
  if (error) {
    candidateErrors.value = new Map(candidateErrors.value).set(method.id, error)
    const settledBusy = new Set(busyIds.value)
    settledBusy.delete(method.id)
    busyIds.value = settledBusy
    return
  }
  const nextErrors = new Map(candidateErrors.value)
  nextErrors.delete(method.id)
  candidateErrors.value = nextErrors
  emit('update:modelValue', props.modelValue.map(item => item.id === method.id ? { ...item, image_data_url: candidate } : { ...item }))
  const settledBusy = new Set(busyIds.value)
  settledBusy.delete(method.id)
  busyIds.value = settledBusy
}

function add(): void {
  if (props.modelValue.length >= CONTACT_METHOD_LIMITS.count) return
  emit('update:modelValue', [...props.modelValue, createContactMethod()])
}

function emitUpdate(): void {
  emit('update:modelValue', props.modelValue.map(method => ({ ...method })))
}

function removeCandidateImage(method: ContactMethod): void {
  candidateTokens.set(method.id, (candidateTokens.get(method.id) ?? 0) + 1)
  const nextErrors = new Map(candidateErrors.value)
  nextErrors.delete(method.id)
  candidateErrors.value = nextErrors
  emit('update:modelValue', props.modelValue.map(item => item.id === method.id ? { ...item, image_data_url: '' } : { ...item }))
}

function remove(index: number): void {
  emit('update:modelValue', props.modelValue.filter((_, itemIndex) => itemIndex !== index))
}

function move(index: number, offset: number): void {
  const destination = index + offset
  if (destination < 0 || destination >= props.modelValue.length) return
  const next = [...props.modelValue]
  ;[next[index], next[destination]] = [next[destination], next[index]]
  emit('update:modelValue', next)
}
</script>
