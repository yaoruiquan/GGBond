<template>
  <div v-if="homeContent" class="min-h-screen">
    <iframe
      v-if="isHomeContentUrl"
      :src="homeContent.trim()"
      class="h-screen w-full border-0"
      allowfullscreen
    ></iframe>
    <div v-else v-html="homeContent"></div>
  </div>

  <div
    v-else
    class="relative flex min-h-screen flex-col overflow-hidden bg-gradient-to-b from-ggbond-skin-100 via-white to-ggbond-red-50/60 text-gray-950 dark:from-dark-950 dark:via-dark-950 dark:to-dark-900 dark:text-white"
  >
    <!-- 背景：红黄光晕 + 闪烁光点 -->
    <div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div class="absolute left-1/2 top-[38%] h-[30rem] w-[30rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-ggbond-yellow-200/50 blur-3xl dark:bg-ggbond-yellow-500/10"></div>
      <div class="absolute -left-32 top-24 h-80 w-80 rounded-full bg-primary-200/40 blur-3xl dark:bg-primary-900/20"></div>
      <div class="absolute -right-32 bottom-16 h-80 w-80 rounded-full bg-primary-200/40 blur-3xl dark:bg-primary-900/20"></div>
      <span
        v-for="(dot, i) in sparkles"
        :key="i"
        class="absolute rounded-full motion-safe:animate-twinkle"
        :class="dot.yellow ? 'bg-ggbond-yellow-400' : 'bg-primary-400'"
        :style="{ left: dot.x, top: dot.y, width: dot.size, height: dot.size, animationDelay: dot.delay }"
      ></span>
    </div>

    <header class="relative z-30">
      <nav class="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <router-link to="/" class="inline-flex items-center transition-transform hover:scale-105">
          <BrandLockup :name="siteName" :logo="siteLogo" compact />
        </router-link>

        <div class="flex items-center gap-1 sm:gap-2">
          <LocaleSwitcher />
          <a
            v-if="docUrl"
            :href="docUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="nav-icon hidden sm:inline-flex"
            :title="t('home.viewDocs')"
          >
            <Icon name="book" size="md" />
          </a>
          <button
            type="button"
            class="nav-icon"
            :title="isDark ? t('home.switchToLight') : t('home.switchToDark')"
            @click="toggleTheme"
          >
            <Icon v-if="isDark" name="sun" size="md" />
            <Icon v-else name="moon" size="md" />
          </button>
          <router-link
            v-if="!isAuthenticated"
            to="/login"
            class="hidden rounded-full px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-white hover:text-primary-600 dark:text-dark-200 dark:hover:bg-white/10 dark:hover:text-primary-300 sm:inline-flex"
          >
            {{ t('home.login') }}
          </router-link>
          <router-link
            :to="ctaPath"
            class="inline-flex items-center rounded-full bg-primary-500 px-4 py-2 text-sm font-semibold text-white shadow-glow-red transition hover:bg-primary-600 sm:px-5"
          >
            {{ isAuthenticated ? t('home.dashboard') : t('home.register') }}
          </router-link>
        </div>
      </nav>
    </header>

    <main class="relative z-10 flex flex-1 flex-col">
      <section class="mx-auto grid w-full max-w-7xl flex-1 items-center px-4 sm:px-6 lg:grid-cols-[15rem_minmax(0,1fr)_15rem] lg:gap-6 lg:px-8">
        <!-- 左侧精选卡（桌面端） -->
        <div class="hidden justify-start lg:flex" @pointerenter="cardsHovered = true" @pointerleave="cardsHovered = false">
          <Transition name="featured" mode="out-in">
            <FeaturedModelCard
              :key="leftCard.id"
              :model="leftCard.model"
              :name="leftCard.name"
              :category="leftCard.category"
              :description="leftCard.description"
              align="left"
            />
          </Transition>
        </div>

        <!-- 中间：猪猪侠 + 模型轨道 -->
        <div class="flex flex-col items-center">
          <div class="h-[min(56vh,34rem)] min-h-[20rem] w-full max-w-3xl">
            <ModelOrbit :providers="showcaseProviders" :highlighted="highlightedIds" :mascot-label="siteName" />
          </div>

          <div class="-mt-2 text-center">
            <h1 class="text-3xl font-black tracking-tight sm:text-5xl">
              <span class="hero-lead block sm:inline">{{ t('home.heroTitleLead') }}</span><span class="hero-tail block sm:inline">{{ t('home.heroTitleTail') }}</span>
            </h1>
            <p class="mx-auto mt-3 max-w-xl text-sm leading-6 text-gray-600 dark:text-dark-300 sm:text-base">
              {{ siteSubtitle }}
            </p>
            <div class="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <router-link :to="ctaPath" class="btn btn-primary btn-lg min-w-[10rem] shadow-glow-red">
                {{ isAuthenticated ? t('home.goToDashboard') : t('home.primaryCta') }}
                <Icon name="chevronRight" size="sm" :stroke-width="2" />
              </router-link>
              <a v-if="docUrl" :href="docUrl" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-lg">
                {{ t('home.viewDocs') }}
              </a>
            </div>
          </div>
        </div>

        <!-- 右侧精选卡（桌面端） -->
        <div class="hidden justify-end lg:flex" @pointerenter="cardsHovered = true" @pointerleave="cardsHovered = false">
          <Transition name="featured" mode="out-in">
            <FeaturedModelCard
              :key="rightCard.id"
              :model="rightCard.model"
              :name="rightCard.name"
              :category="rightCard.category"
              :description="rightCard.description"
              align="right"
            />
          </Transition>
        </div>
      </section>

      <!-- 平板和手机：精选卡放到下方，三张都显示 -->
      <section class="mx-auto mt-10 grid w-full max-w-3xl justify-items-center gap-8 px-4 pb-6 sm:grid-cols-3 lg:hidden">
        <FeaturedModelCard
          v-for="card in allCards"
          :key="card.id"
          :model="card.model"
          :name="card.name"
          :category="card.category"
          :description="card.description"
        />
      </section>
    </main>

    <footer class="relative z-10 py-6 text-center text-xs text-gray-500 dark:text-dark-400">
      &copy; {{ currentYear }} {{ siteName }}. {{ t('home.footer.allRightsReserved') }}
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore, useAppStore } from '@/stores'
import LocaleSwitcher from '@/components/common/LocaleSwitcher.vue'
import Icon from '@/components/icons/Icon.vue'
import BrandLockup from '@/components/brand/BrandLockup.vue'
import { sanitizeUrl } from '@/utils/url'
import ModelOrbit from './home/ModelOrbit.vue'
import FeaturedModelCard from './home/FeaturedModelCard.vue'
import { featuredProviderIds, showcaseProviders } from './home/showcaseModels'
import { useFeaturedRotation } from './home/featuredRotation'

const FEATURED_INTERVAL_MS = 4000

const { t } = useI18n()
const authStore = useAuthStore()
const appStore = useAppStore()

const siteName = computed(() => appStore.cachedPublicSettings?.site_name || appStore.siteName || 'GGbond AI')
const siteLogo = computed(() => sanitizeUrl(appStore.cachedPublicSettings?.site_logo || appStore.siteLogo || '/ggbond-logo.svg', { allowRelative: true, allowDataUrl: true }))
const siteSubtitle = computed(
  () => appStore.cachedPublicSettings?.site_subtitle || t('home.heroDescription')
)
const docUrl = computed(() => sanitizeUrl(appStore.cachedPublicSettings?.doc_url || appStore.docUrl || ''))
const homeContent = computed(() => appStore.cachedPublicSettings?.home_content || '')
const isHomeContentUrl = computed(() => {
  const content = homeContent.value.trim()
  return content.startsWith('http://') || content.startsWith('https://')
})

const isDark = ref(document.documentElement.classList.contains('dark'))
const isAuthenticated = computed(() => authStore.isAuthenticated)
const dashboardPath = computed(() => (authStore.isAdmin ? '/admin/dashboard' : '/dashboard'))
const ctaPath = computed(() => (isAuthenticated.value ? dashboardPath.value : '/register'))
const currentYear = computed(() => new Date().getFullYear())

// 精选卡：两侧交替轮换，鼠标停在卡片上时暂停
const cardsHovered = ref(false)
const featured = useFeaturedRotation(featuredProviderIds, FEATURED_INTERVAL_MS, cardsHovered)
const highlightedIds = computed(() => [featured.value.left, featured.value.right])

function featuredCard(id: string) {
  const provider = showcaseProviders.find((p) => p.id === id)
  return {
    id,
    model: provider?.model ?? id,
    name: provider?.name ?? id,
    category: t(`home.featured.${id}.category`),
    description: t(`home.featured.${id}.description`)
  }
}

const leftCard = computed(() => featuredCard(featured.value.left))
const rightCard = computed(() => featuredCard(featured.value.right))
const allCards = computed(() => featuredProviderIds.map(featuredCard))

// 背景光点：固定位置，避免每次渲染跳动
const sparkles = [
  { x: '8%', y: '18%', size: '6px', delay: '0s', yellow: true },
  { x: '18%', y: '62%', size: '4px', delay: '1.2s', yellow: false },
  { x: '28%', y: '30%', size: '5px', delay: '0.6s', yellow: false },
  { x: '72%', y: '22%', size: '5px', delay: '1.8s', yellow: true },
  { x: '84%', y: '48%', size: '6px', delay: '0.3s', yellow: false },
  { x: '92%', y: '74%', size: '4px', delay: '2.1s', yellow: true },
  { x: '62%', y: '82%', size: '4px', delay: '0.9s', yellow: false },
  { x: '40%', y: '12%', size: '4px', delay: '2.4s', yellow: true }
]

function toggleTheme() {
  isDark.value = !isDark.value
  document.documentElement.classList.toggle('dark', isDark.value)
  localStorage.setItem('theme', isDark.value ? 'dark' : 'light')
}

function initTheme() {
  const savedTheme = localStorage.getItem('theme')
  if (
    savedTheme === 'dark' ||
    (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)
  ) {
    isDark.value = true
    document.documentElement.classList.add('dark')
  }
}

onMounted(() => {
  initTheme()
  authStore.checkAuth()
  if (!appStore.publicSettingsLoaded) {
    appStore.fetchPublicSettings()
  }
})
</script>

<style scoped>
.nav-icon {
  @apply rounded-full p-2 text-gray-500 transition-colors hover:bg-white hover:text-primary-600 dark:text-dark-300 dark:hover:bg-white/10 dark:hover:text-primary-300;
}

.hero-lead {
  @apply text-primary-600 dark:text-primary-400;
}

.hero-tail {
  @apply text-gray-950 dark:text-white;
}

.featured-enter-active,
.featured-leave-active {
  transition:
    opacity 0.35s ease,
    transform 0.35s ease;
}

.featured-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.featured-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

@media (prefers-reduced-motion: reduce) {
  .featured-enter-active,
  .featured-leave-active {
    transition: none;
  }
}
</style>
