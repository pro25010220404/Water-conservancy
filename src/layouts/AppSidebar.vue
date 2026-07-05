<script setup lang="ts">
// ============================================================
// 侧边栏 — 九大板块导航
// ============================================================
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { ElMenu, ElMenuItem, ElSubMenu, ElIcon } from 'element-plus'
import {
  Monitor, Ship, Switch, DataAnalysis, VideoCamera,
  Clock, Warning, Operation, Cpu, SetUp, Setting, User,
} from '@element-plus/icons-vue'
import { APP_TITLE, MENU_ITEMS } from '@/constants'
import { usePermission } from '@/composables/usePermission'
import logoUrl from '@/assets/images/logo.png'

defineProps<{
  collapsed: boolean
}>()

const route = useRoute()
const { hasRoutePermission } = usePermission()

const iconMap: Record<string, any> = {
  Monitor, Ship, Switch, DataAnalysis, VideoCamera,
  Clock, Warning, Operation, Cpu, SetUp, Setting, User,
}

const visibleMenus = computed(() =>
  MENU_ITEMS.filter((item) => {
    if (item.children?.length) return item.children.some((c) => hasRoutePermission(c.path))
    return hasRoutePermission(item.path)
  }),
)
</script>

<template>
  <aside class="app-sidebar" :class="{ 'is-collapsed': collapsed }">
    <div class="app-sidebar__logo">
      <img :src="logoUrl" alt="logo" class="app-sidebar__logo-img" />
      <span v-if="!collapsed" class="app-sidebar__logo-text">{{ APP_TITLE }}</span>
    </div>
    <div class="app-sidebar__nav">
      <el-menu
        :default-active="route.path"
        :collapse="collapsed"
        :collapse-transition="false"
        background-color="transparent"
        text-color="var(--color-layout-blue-text-secondary)"
        active-text-color="var(--color-layout-blue-brand)"
        router
      >
        <template v-for="item in visibleMenus" :key="item.path">
          <el-sub-menu v-if="item.children?.length" :index="item.path">
            <template #title>
              <el-icon><component :is="iconMap[item.icon]" /></el-icon>
              <span>{{ item.title }}</span>
            </template>
            <el-menu-item v-for="c in item.children" :key="c.path" :index="c.path">
              <span>{{ c.title }}</span>
            </el-menu-item>
          </el-sub-menu>
          <el-menu-item v-else :index="item.path">
            <el-icon><component :is="iconMap[item.icon]" /></el-icon>
            <span>{{ item.title }}</span>
          </el-menu-item>
        </template>
      </el-menu>
    </div>
  </aside>
</template>

<style scoped lang="scss">
.app-sidebar {
  display: flex;
  flex-direction: column;
  width: var(--sider-width);
  height: 100%;
  background: var(--color-layout-gradient-sidebar);
  transition: width 0.3s;
  overflow: hidden;
  box-shadow: 4px 0 24px rgba(0, 0, 0, 0.2);

  &.is-collapsed {
    width: 64px;
  }

  &__logo {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    height: var(--header-height);
    padding: 0 var(--spacing-md);
  }

  &__logo-img {
    width: 34px;
    height: 34px;
    flex-shrink: 0;
    object-fit: contain;
  }

  &__logo-text {
    font-size: var(--font-size-sm);
    font-weight: 500;
    line-height: 1.4;
    color: var(--color-layout-blue-text);
    letter-spacing: 0.5px;
  }

  &__nav {
    flex: 1;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    border-right: 1px solid var(--color-layout-blue-border);
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.25) transparent;

    &::-webkit-scrollbar {
      width: 5px;
    }

    &::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.22);
      border-radius: 4px;
    }

    &::-webkit-scrollbar-track {
      background: transparent;
    }
  }

  &.is-collapsed &__logo {
    justify-content: center;
    padding: 0;
  }

  &.is-collapsed &__logo-img {
    width: 32px;
    height: 32px;
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
    transition: all 0.2s cubic-bezier(0.22, 1, 0.36, 1);
  }

  :deep(.el-menu-item.is-active) {
    background: var(--color-layout-blue-active) !important;
    color: var(--color-layout-blue-brand) !important;
    font-weight: 600;
    border-left: 3px solid var(--color-layout-blue-active-border);
    box-shadow: inset 0 0 24px rgba(110, 179, 255, 0.12);
  }

  :deep(.el-menu-item:hover) {
    background: rgba(255, 255, 255, 0.12) !important;
    color: var(--color-layout-blue-text) !important;
    transform: translateX(3px);
    box-shadow: 0 2px 12px rgba(110, 179, 255, 0.18);
  }

  :deep(.el-menu-item:active) {
    transform: translateX(1px) scale(0.98);
  }
}
</style>
