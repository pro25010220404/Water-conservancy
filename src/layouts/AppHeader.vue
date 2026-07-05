<script setup lang="ts">
// ============================================================
// 顶栏 — Logo / 折叠 / 页面标题 / 时钟 / 急停
// ============================================================
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Expand, Fold } from '@element-plus/icons-vue'
import { APP_TITLE } from '@/constants'
import GlobalEmergencyStop from '@/components/GlobalEmergencyStop.vue'

defineProps<{
  collapsed: boolean
}>()

const emit = defineEmits<{
  toggleCollapse: []
}>()

const route = useRoute()

const now = ref('')
let timer: ReturnType<typeof setInterval> | null = null

const pageTitle = computed(() => (route.meta.title as string) || APP_TITLE)

function updateClock() {
  const date = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  now.value = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

onMounted(() => {
  updateClock()
  timer = setInterval(updateClock, 1000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <header class="app-header">
    <div class="app-header__left">
      <button class="app-header__collapse" type="button" @click="emit('toggleCollapse')">
        <el-icon><Fold v-if="!collapsed" /><Expand v-else /></el-icon>
      </button>
      <span class="app-header__title">{{ pageTitle }}</span>
    </div>
    <div class="app-header__right">
      <span class="app-header__clock">{{ now }}</span>
      <GlobalEmergencyStop placement="header" />
    </div>
  </header>
</template>

<style scoped lang="scss">
.app-header {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--header-height);
  padding: 0 var(--spacing-lg);
  background: linear-gradient(90deg, #0a1628 0%, #0d2137 50%, #112a45 100%);
  border-bottom: 1px solid var(--color-layout-blue-border);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);

  &::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent 0%,
      var(--color-layout-blue-glow) 50%,
      transparent 100%
    );
    pointer-events: none;
  }

  &__left {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
    min-width: 0;
  }

  &__collapse {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border: 1px solid var(--color-layout-blue-border);
    border-radius: var(--border-radius-sm);
    background: rgba(0, 212, 255, 0.06);
    color: var(--color-layout-blue-brand);
    cursor: pointer;

  }

  &__title {
    font-size: var(--font-size-lg);
    font-weight: 500;
    color: var(--color-layout-blue-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    letter-spacing: 0.5px;
  }

  &__right {
    display: flex;
    align-items: center;
    gap: var(--spacing-lg);
  }

  &__clock {
    font-family: 'Roboto Mono', 'SF Mono', monospace;
    font-size: var(--font-size-sm);
    color: var(--color-layout-blue-brand);
    opacity: 0.85;
    letter-spacing: 0.5px;
  }
}
</style>
