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
      text-color="var(--color-layout-blue-text-secondary)"
      active-text-color="var(--color-layout-blue-brand)"
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
  background: linear-gradient(180deg, #0d2137 0%, #0a1628 100%);
  border-right: 1px solid var(--color-layout-blue-border);
  transition: width 0.3s;
  overflow: hidden;
  box-shadow: 4px 0 24px rgba(0, 0, 0, 0.2);

  &.is-collapsed {
    width: 64px;
  }

  &__logo {
    display: flex;
    align-items: center;
    justify-content: center;
    height: var(--header-height);
    padding: 0 var(--spacing-md);
    border-bottom: 1px solid var(--color-layout-blue-border);
    background: rgba(0, 212, 255, 0.04);
  }

  &__logo-text {
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--color-layout-blue-brand);
    text-align: center;
    line-height: 1.4;
    text-shadow: 0 0 16px rgba(0, 212, 255, 0.35);
  }

  &__logo-icon {
    font-size: var(--font-size-xl);
    font-weight: 700;
    color: var(--color-layout-blue-brand);
    text-shadow: 0 0 12px rgba(0, 212, 255, 0.4);
  }

  :deep(.el-menu) {
    border-right: none;
    background: transparent;
    padding: 8px 0;
  }

  :deep(.el-menu-item) {
    margin: 4px 8px;
    border-radius: var(--border-radius-sm);
    color: var(--color-layout-blue-text-secondary);
    transition: all 0.2s;
  }

  :deep(.el-menu-item.is-active) {
    background: var(--color-layout-blue-active) !important;
    color: var(--color-layout-blue-brand) !important;
    font-weight: 600;
    border-left: 3px solid var(--color-layout-blue-brand);
    box-shadow: inset 0 0 20px rgba(0, 212, 255, 0.06);
  }

  :deep(.el-menu-item:hover) {
    background: rgba(0, 212, 255, 0.08) !important;
    color: var(--color-layout-blue-text) !important;
  }
}
</style>
