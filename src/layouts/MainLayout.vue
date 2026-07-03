<script setup lang="ts">
// ============================================================
// 主布局 — 侧边栏 + 顶栏 + 标签栏 + 内容区
// ============================================================
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElContainer, ElAside, ElMain } from 'element-plus'
import AppHeader from './AppHeader.vue'
import AppSidebar from './AppSidebar.vue'
import AppTabs from './AppTabs.vue'
import { useTabsStore } from '@/stores/tabs'

const route = useRoute()
const tabsStore = useTabsStore()
const collapsed = ref(false)

watch(
  () => route.path,
  () => tabsStore.syncFromRoute(route),
  { immediate: true },
)
</script>

<template>
  <el-container class="main-layout">
    <el-aside :width="collapsed ? '64px' : 'var(--sider-width)'" class="main-layout__aside">
      <AppSidebar :collapsed="collapsed" />
    </el-aside>
    <el-container direction="vertical" class="main-layout__body">
      <AppHeader :collapsed="collapsed" @toggle-collapse="collapsed = !collapsed" />
      <AppTabs />
      <el-main class="main-layout__content">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped lang="scss">
.main-layout {
  height: 100vh;

  &__aside {
    overflow: hidden;
    transition: width 0.3s;
  }

  &__body {
    min-width: 0;
    flex-direction: column;
  }

  :deep(.app-tabs) {
    flex-shrink: 0;
  }

  &__content {
    flex: 1;
    min-height: 0;
    background: var(--color-bg-dark);
    padding: var(--spacing-lg);
    overflow-y: auto;
  }
}
</style>
