<script setup lang="ts">
// ============================================================
// 顶栏 — Logo / 折叠 / 页面标题 / 用户信息
// ============================================================
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElDropdown, ElDropdownMenu, ElDropdownItem, ElAvatar } from 'element-plus'
import { Expand, Fold } from '@element-plus/icons-vue'
import { APP_TITLE } from '@/constants'
import { useUserStore } from '@/stores/user'

defineProps<{
  collapsed: boolean
}>()

const emit = defineEmits<{
  toggleCollapse: []
}>()

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const now = ref('')
let timer: ReturnType<typeof setInterval> | null = null

const pageTitle = computed(() => (route.meta.title as string) || APP_TITLE)
const displayName = computed(
  () => userStore.userInfo?.nickname || userStore.userInfo?.username || '未登录',
)

function updateClock() {
  const date = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  now.value = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function handleLogout() {
  userStore.logout()
  router.push('/login')
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
      <el-dropdown trigger="click">
        <div class="app-header__user">
          <el-avatar :size="32">{{ displayName.charAt(0) }}</el-avatar>
          <span class="app-header__name">{{ displayName }}</span>
        </div>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item @click="router.push('/profile')">个人中心</el-dropdown-item>
            <el-dropdown-item divided @click="handleLogout">退出登录</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
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
  background: var(--color-layout-gradient-header);
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
    background: rgba(255, 255, 255, 0.1);
    color: var(--color-layout-blue-brand);
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
      background: rgba(255, 255, 255, 0.18);
      border-color: rgba(255, 255, 255, 0.35);
      box-shadow: 0 0 14px rgba(110, 179, 255, 0.25);
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
    letter-spacing: 0.5px;
  }

  &__user {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    cursor: pointer;
    padding: 4px 8px 4px 4px;
    border-radius: var(--border-radius-base);
    transition: background 0.2s;

    &:hover {
      background: rgba(255, 255, 255, 0.08);
    }
  }

  &__name {
    font-size: var(--font-size-sm);
    color: var(--color-layout-blue-text);
  }

  :deep(.el-avatar) {
    background: linear-gradient(135deg, #2e66b8, #4a90d9);
    color: #fff;
    font-weight: 600;
    border: 1px solid rgba(255, 255, 255, 0.25);
  }
}
</style>
