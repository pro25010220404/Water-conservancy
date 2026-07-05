<script setup lang="ts">
// ============================================================
// 主布局 — 侧边栏 + 顶栏 + 内容区
// ============================================================
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { ElContainer, ElAside, ElMain } from 'element-plus'
import AppHeader from './AppHeader.vue'
import AppSidebar from './AppSidebar.vue'

const route = useRoute()
const collapsed = ref(false)

/** 数字孪生等全幅驾驶舱页：内容区与顶栏无缝衔接，去掉双层边距 */
const isFlushPage = computed(() => route.path.startsWith('/simulation'))
</script>

<template>
  <el-container class="main-layout">
    <el-aside :width="collapsed ? '64px' : 'var(--sider-width)'" class="main-layout__aside">
      <AppSidebar :collapsed="collapsed" />
    </el-aside>
    <el-container direction="vertical" class="main-layout__body">
      <AppHeader :collapsed="collapsed" @toggle-collapse="collapsed = !collapsed" />
      <el-main class="main-layout__content" :class="{ 'main-layout__content--flush': isFlushPage }">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped lang="scss">
@use '@/assets/styles/cockpit.scss' as *;

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

  &__content {
    flex: 1;
    min-height: 0;
    background: var(--color-bg-dark);
    padding: var(--spacing-lg);
    overflow-y: auto;
    @include hide-scrollbar;

    &--flush {
      padding: 0;
      overflow: hidden;
      background: linear-gradient(
        180deg,
        #f0f4f8 0%,
        #e8f2fa 6%,
        #f0f7fc 18%,
        #f7fbff 100%
      );
    }
  }
}
</style>
