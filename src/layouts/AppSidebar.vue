<script setup lang="ts">
// ============================================================
// 侧边栏 — 九大板块导航（Logo 已移至 MainLayout 顶栏）
// ============================================================
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { ElMenu, ElMenuItem, ElSubMenu, ElIcon } from 'element-plus'
import {
  Monitor, Ship, Switch, DataAnalysis, VideoCamera,
  Clock, Warning, Operation, Cpu, SetUp, Setting, User,
} from '@element-plus/icons-vue'
import { MENU_ITEMS } from '@/constants'
import { usePermission } from '@/composables/usePermission'

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
  </aside>
</template>

<style scoped lang="scss">
.app-sidebar {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: var(--color-layout-gradient-sidebar);
  border-right: 1px solid var(--color-layout-blue-border);
  box-shadow: 4px 0 24px rgba(0, 0, 0, 0.2);
  overflow: hidden;

  :deep(.el-menu) {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
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
