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
import { MENU_ITEMS } from '@/constants'
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
  background: #ffffff;
  border-right: 1px solid var(--color-border);
  transition: width 0.3s;
  overflow: hidden;

  &.is-collapsed {
    width: 64px;
  }

  :deep(.el-menu) {
    border-right: none;
  }

  :deep(.el-menu-item) {
    &.is-active {
      background: #e8f3ff !important;
      color: var(--color-primary) !important;
    }

    &:hover {
      background: #f2f3f5 !important;
    }
  }
}
</style>
