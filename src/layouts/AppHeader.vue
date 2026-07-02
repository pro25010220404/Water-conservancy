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
import logoUrl from '@/assets/images/logo.png'

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
      <img :src="logoUrl" alt="logo" class="app-header__logo" />
      <span class="app-header__brand">{{ APP_TITLE }}</span>
      <span class="app-header__divider">|</span>
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--header-height);
  padding: 0 var(--spacing-lg);
  background: rgba(13, 34, 60, 0.92);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);

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
    width: 32px;
    height: 32px;
    border: none;
    border-radius: var(--border-radius-sm);
    background: transparent;
    color: rgba(255, 255, 255, 0.55);
    cursor: pointer;
    transition: color 0.2s, background 0.2s;

    &:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #fff;
    }
  }

  &__logo {
    width: 28px;
    height: 28px;
    object-fit: contain;
  }

  &__brand {
    font-size: var(--font-size-base);
    font-weight: 600;
    color: #fff;
    white-space: nowrap;
  }

  &__divider {
    color: rgba(255, 255, 255, 0.25);
    font-weight: 300;
  }

  &__title {
    font-size: var(--font-size-base);
    font-weight: 400;
    color: rgba(255, 255, 255, 0.7);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__right {
    display: flex;
    align-items: center;
    gap: var(--spacing-lg);
  }

  &__clock {
    font-family: 'Roboto Mono', monospace;
    font-size: var(--font-size-sm);
    color: rgba(255, 255, 255, 0.5);
  }

  &__user {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    cursor: pointer;
  }

  &__name {
    font-size: var(--font-size-sm);
    color: rgba(255, 255, 255, 0.8);
  }
}
</style>
