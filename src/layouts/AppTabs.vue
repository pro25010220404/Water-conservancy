<script setup lang="ts">
// ============================================================
// 第 3 层 — 标签页栏（固定在导航下方，不随内容上浮）
// ============================================================
import { ref, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { Close } from '@element-plus/icons-vue'
import { useTabsStore } from '@/stores/tabs'

const route = useRoute()
const tabsStore = useTabsStore()

const contextMenu = ref<{ visible: boolean; x: number; y: number; path: string }>({
  visible: false,
  x: 0,
  y: 0,
  path: '',
})

function onTabClick(path: string) {
  tabsStore.switchTab(path)
}

function onTabClose(e: Event, path: string) {
  e.stopPropagation()
  tabsStore.closeTab(path)
}

function onContextMenu(e: MouseEvent, path: string) {
  e.preventDefault()
  contextMenu.value = { visible: true, x: e.clientX, y: e.clientY, path }
}

function hideContextMenu() {
  contextMenu.value.visible = false
}

function handleRefresh() {
  tabsStore.refreshTab(contextMenu.value.path)
  hideContextMenu()
}

function handleCloseOthers() {
  tabsStore.closeOthers(contextMenu.value.path)
  hideContextMenu()
}

function handleCloseAll() {
  tabsStore.closeAll()
  hideContextMenu()
}

onMounted(() => {
  tabsStore.syncFromRoute(route)
  document.addEventListener('click', hideContextMenu)
})

onUnmounted(() => {
  document.removeEventListener('click', hideContextMenu)
})
</script>

<template>
  <div class="app-tabs">
    <div class="app-tabs__list">
      <div
        v-for="tab in tabsStore.tabs"
        :key="tab.path"
        class="app-tabs__item"
        :class="{ 'is-active': route.path === tab.path }"
        @click="onTabClick(tab.path)"
        @contextmenu="onContextMenu($event, tab.path)"
      >
        <span class="app-tabs__title">{{ tab.title }}</span>
        <button
          v-if="!tab.affix"
          class="app-tabs__close"
          type="button"
          aria-label="关闭"
          @click="onTabClose($event, tab.path)"
        >
          <el-icon><Close /></el-icon>
        </button>
      </div>
    </div>

    <Teleport to="body">
      <ul
        v-if="contextMenu.visible"
        class="app-tabs__context"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
        @click.stop
      >
        <li @click="handleRefresh">刷新</li>
        <li @click="handleCloseOthers">关闭其他</li>
        <li @click="handleCloseAll">关闭全部</li>
      </ul>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
@use '@/assets/styles/admin-glass.scss' as glass;

.app-tabs {
  position: relative;
  z-index: 1;
  height: var(--tabs-height);
  padding: 0 var(--spacing-xl);
  background: rgba(240, 247, 252, 0.6);
  overflow: hidden;

  &__list {
    display: flex;
    align-items: flex-end;
    gap: 6px;
    height: 100%;
    overflow-x: auto;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
  }

  &__item {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 40px;
    padding: 0 18px;
    margin-top: auto;
    font-size: 15px;
    color: var(--color-text-secondary);
    background: rgba(255, 255, 255, 0.85);
    border: 1px solid rgba(24, 144, 255, 0.12);
    border-bottom: none;
    border-radius: 8px 8px 0 0;
    cursor: pointer;
    white-space: nowrap;
    user-select: none;
    backdrop-filter: blur(8px);
    @include glass.btn-hover-light;

    &.is-active {
      color: var(--color-primary);
      background: #fff;
      border-color: rgba(24, 144, 255, 0.3);
      font-weight: 600;
      box-shadow: 0 -2px 8px rgba(24, 144, 255, 0.08);
      margin-bottom: -1px;
      padding-bottom: 1px;
    }
  }

  &__title {
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: inherit;
    cursor: pointer;
    opacity: 0.55;
    transition: all 0.15s;

    &:hover {
      opacity: 1;
      background: rgba(24, 144, 255, 0.15);
      color: var(--color-primary);
    }
  }

  &__context {
    position: fixed;
    z-index: 9999;
    min-width: 128px;
    padding: 4px 0;
    margin: 0;
    list-style: none;
    background: rgba(255, 255, 255, 0.98);
    border: 1px solid rgba(24, 144, 255, 0.18);
    border-radius: var(--border-radius-base);
    box-shadow: 0 8px 24px rgba(24, 144, 255, 0.12);
    backdrop-filter: blur(12px);

    li {
      padding: 9px 18px;
      font-size: var(--font-size-sm);
      color: var(--color-text);
      cursor: pointer;
      transition: background 0.15s;

      &:hover {
        background: #e6f4ff;
        color: var(--color-primary);
      }
    }
  }
}
</style>
