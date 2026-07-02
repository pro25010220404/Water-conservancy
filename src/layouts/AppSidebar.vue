<script setup lang="ts">
// ============================================================
// 侧边栏 — 九大板块导航
// ============================================================
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { ElMenu, ElMenuItem, ElIcon } from 'element-plus'
import {
  Monitor,
  Clock,
  Warning,
  Operation,
  Cpu,
  SetUp,
  Setting,
  User,
} from '@element-plus/icons-vue'
import { APP_TITLE, MENU_ITEMS } from '@/constants'
import { usePermission } from '@/composables/usePermission'

defineProps<{
  collapsed: boolean
}>()

const route = useRoute()
const { hasRoutePermission } = usePermission()

const iconMap = {
  Monitor,
  Clock,
  Warning,
  Operation,
  Cpu,
  SetUp,
  Setting,
  User,
}

const visibleMenus = computed(() => MENU_ITEMS.filter((item) => hasRoutePermission(item.path)))
</script>

<template>
  <aside class="app-sidebar" :class="{ 'is-collapsed': collapsed }">
    <div class="app-sidebar__logo">
      <span v-if="!collapsed" class="app-sidebar__logo-text">{{ APP_TITLE }}</span>
      <span v-else class="app-sidebar__logo-icon">闸</span>
    </div>
    <el-menu
      :default-active="route.path"
      :collapse="collapsed"
      :collapse-transition="false"
      background-color="transparent"
      text-color="var(--color-sidebar-text)"
      active-text-color="var(--color-primary)"
      router
    >
      <el-menu-item v-for="item in visibleMenus" :key="item.path" :index="item.path">
        <el-icon>
          <component :is="iconMap[item.icon as keyof typeof iconMap]" />
        </el-icon>
        <span>{{ item.title }}</span>
      </el-menu-item>
    </el-menu>
  </aside>
</template>

<style scoped lang="scss">
.app-sidebar {
  width: var(--sider-width);
  height: 100%;
  background: var(--color-bg-sidebar);
  border-right: 1px solid var(--color-border);
  transition: width 0.3s;
  overflow: hidden;

  &.is-collapsed {
    width: 64px;
  }

  &__logo {
    display: flex;
    align-items: center;
    justify-content: center;
    height: var(--header-height);
    padding: 0 var(--spacing-md);
    border-bottom: 1px solid var(--color-border);
  }

  &__logo-text {
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--color-primary);
    text-align: center;
    line-height: 1.4;
  }

  &__logo-icon {
    font-size: var(--font-size-xl);
    font-weight: 700;
    color: var(--color-primary);
  }

  :deep(.el-menu) {
    border-right: none;
  }

  :deep(.el-menu-item.is-active) {
    background: #e8f3ff !important;
    color: var(--color-primary) !important;
  }

  :deep(.el-menu-item:hover) {
    background: #f2f3f5 !important;
  }
}
</style>
