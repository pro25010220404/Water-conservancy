<script setup lang="ts">
// ============================================================
// 顶栏 — 折叠 / 页面标题 / 时钟 / 急停（背景由 MainLayout 顶栏统一绘制）
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
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
  height: 100%;
  padding: 0 var(--spacing-lg);
  background: transparent;
  border-bottom: 1px solid var(--color-layout-blue-border);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);

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
    transition: all 0.2s;

    &:hover {
      background: rgba(0, 212, 255, 0.14);
      border-color: rgba(0, 212, 255, 0.4);
      box-shadow: 0 0 12px rgba(0, 212, 255, 0.2);
    }
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
