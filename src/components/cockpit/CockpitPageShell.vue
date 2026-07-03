<script setup lang="ts">
// ============================================================
// 驾驶舱页面壳 — 仅用于告警 / 调度 / 数字孪生
// 内含：标签页栏（顶栏下方）
// ============================================================
import { watch } from 'vue'
import { useRoute } from 'vue-router'
import AppTabs from '@/layouts/AppTabs.vue'
import { useTabsStore } from '@/stores/tabs'

const route = useRoute()
const tabsStore = useTabsStore()

watch(
  () => route.path,
  () => tabsStore.syncFromRoute(route),
  { immediate: true },
)
</script>

<template>
  <div class="cockpit-shell">
    <div class="cockpit-shell__bridge" aria-hidden="true" />
    <div class="cockpit-shell__chrome">
      <AppTabs />
    </div>
    <div class="cockpit-shell__body">
      <slot />
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/assets/styles/cockpit.scss' as *;

.cockpit-shell {
  display: flex;
  flex-direction: column;
  min-height: calc(100vh - var(--header-height) - var(--spacing-lg) * 2);
  margin: calc(-1 * var(--spacing-lg));
  background: linear-gradient(
    180deg,
    #d6e8f5 0%,
    #e8f2fa 6%,
    #f0f7fc 18%,
    #f7fbff 100%
  );

  &__bridge {
    flex-shrink: 0;
    height: 3px;
    background: linear-gradient(
      90deg,
      #0a1628 0%,
      #1890ff 35%,
      #00d4ff 50%,
      #1890ff 65%,
      #0a1628 100%
    );
    opacity: 0.85;
  }

  &__chrome {
    flex-shrink: 0;
    position: sticky;
    top: 0;
    z-index: 50;
    background: linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.97) 0%,
      rgba(247, 251, 255, 0.94) 100%
    );
    backdrop-filter: blur(16px);
    border-bottom: 1px solid rgba(24, 144, 255, 0.14);
    box-shadow: 0 4px 20px rgba(24, 144, 255, 0.07);
  }

  &__body {
    flex: 1;
    min-height: 0;
    padding: var(--spacing-lg);
    overflow: auto;
    @include cockpit-typography;
    background: transparent;
  }
}
</style>
