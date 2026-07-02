<script setup lang="ts">
// ============================================================
// 主布局 — 顶栏全宽 + 侧边栏 + 内容区
// ============================================================
import { ref } from 'vue'
import { ElAside, ElMain } from 'element-plus'
import AppHeader from './AppHeader.vue'
import AppSidebar from './AppSidebar.vue'

const collapsed = ref(false)
</script>

<template>
  <div class="main-layout">
    <!-- 页眉全宽 -->
    <AppHeader :collapsed="collapsed" @toggle-collapse="collapsed = !collapsed" />

    <!-- 下方：侧边栏 + 内容 -->
    <div class="main-layout__body">
      <el-aside :width="collapsed ? '64px' : 'var(--sider-width)'" class="main-layout__aside">
        <AppSidebar :collapsed="collapsed" />
      </el-aside>
      <el-main class="main-layout__content">
        <router-view />
      </el-main>
    </div>
  </div>
</template>

<style scoped lang="scss">
.main-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;

  &__body {
    display: flex;
    flex: 1;
    min-height: 0;
  }

  &__aside {
    overflow: hidden;
    transition: width 0.3s;
    flex-shrink: 0;
  }

  &__content {
    flex: 1;
    background: #ffffff;
    padding: var(--spacing-lg);
    overflow-y: auto;
  }
}
</style>
