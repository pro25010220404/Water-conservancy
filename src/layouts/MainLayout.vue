<script setup lang="ts">
// ============================================================
// 主布局 — 侧边栏 + 顶栏 + 内容区
// ============================================================
import { ref } from 'vue'
import { ElContainer, ElAside, ElMain } from 'element-plus'
import AppHeader from './AppHeader.vue'
import AppSidebar from './AppSidebar.vue'

const collapsed = ref(false)
</script>

<template>
  <el-container class="main-layout">
    <el-aside :width="collapsed ? '64px' : 'var(--sider-width)'" class="main-layout__aside">
      <AppSidebar :collapsed="collapsed" />
    </el-aside>
    <el-container direction="vertical" class="main-layout__body">
      <AppHeader :collapsed="collapsed" @toggle-collapse="collapsed = !collapsed" />
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
  }

  &__content {
    background: #ffffff;
    padding: var(--spacing-lg);
    overflow-y: auto;
  }
}
</style>
