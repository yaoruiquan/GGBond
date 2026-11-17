<template>
  <header class="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl dark:border-dark-700/70 dark:bg-dark-950/90">
    <div class="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-5 py-4 sm:px-8">
      <RouterLink to="/model-market" class="flex min-w-0 items-center gap-3">
        <span class="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-dark-800 dark:ring-dark-700">
          <img :src="siteLogo || DEFAULT_SITE_LOGO" alt="Logo" class="h-full w-full object-contain" />
        </span>
        <span class="min-w-0">
          <span class="block truncate text-lg font-semibold tracking-tight text-slate-950 dark:text-white">{{ siteName }}</span>
          <span class="block text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-dark-400">{{ t('modelMarket.nav.eyebrow') }}</span>
        </span>
      </RouterLink>

      <nav class="hidden items-center gap-6 text-sm font-medium text-slate-500 md:flex dark:text-dark-300">
        <RouterLink to="/model-market" class="text-emerald-700 dark:text-emerald-300">{{ t('modelMarket.nav.market') }}</RouterLink>
        <RouterLink v-if="showModelPlazaEntry" to="/model-plaza" class="transition-colors hover:text-slate-950 dark:hover:text-white">{{ t('modelMarket.nav.original') }}</RouterLink>
      </nav>

      <RouterLink
        :to="isAuthenticated ? backTarget : { path: '/login', query: { redirect: '/model-market' } }"
        class="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-emerald-300 hover:text-emerald-700 dark:border-dark-700 dark:bg-dark-900 dark:text-dark-100 dark:hover:border-emerald-500/60 dark:hover:text-emerald-300"
      >
        {{ isAuthenticated ? t('modelMarket.nav.console') : t('modelMarket.nav.login') }}
        <span aria-hidden="true">↗</span>
      </RouterLink>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { DEFAULT_SITE_LOGO, DEFAULT_SITE_NAME } from '@/constants/branding'
import { sanitizeUrl } from '@/utils/url'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { FeatureFlags, isFeatureFlagEnabled } from '@/utils/featureFlags'

const { t } = useI18n()
const appStore = useAppStore()
const authStore = useAuthStore()
const settings = computed(() => appStore.cachedPublicSettings)
const siteName = computed(() => settings.value?.site_name || DEFAULT_SITE_NAME)
const siteLogo = computed(() => sanitizeUrl(settings.value?.site_logo || '', { allowRelative: true, allowDataUrl: true }))
const isAuthenticated = computed(() => authStore.isAuthenticated)
const showModelPlazaEntry = computed(
  () => isFeatureFlagEnabled(FeatureFlags.modelPlaza) && (isAuthenticated.value || settings.value?.model_plaza_require_auth !== true)
)
const backTarget = computed(() => (authStore.isAdmin ? '/admin/dashboard' : '/dashboard'))

onMounted(() => { void appStore.fetchPublicSettings() })
</script>
