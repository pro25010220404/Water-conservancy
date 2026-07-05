<script setup lang="ts">
// ============================================================
// 第 3 层 — 标签页栏（固定 10 格等宽，不滚动）
// ============================================================
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { Close } from '@element-plus/icons-vue'
import { useTabsStore, MAX_TABS } from '@/stores/tabs'

const route = useRoute()
const tabsStore = useTabsStore()

const { flushBelow = false } = defineProps<{
  flushBelow?: boolean
}>()

const emptySlots = computed(() => Math.max(0, MAX_TABS - tabsStore.tabs.length))

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
  <div class="app-tabs"
:class="{ 'app-tabs--flush-below': flushBelow }">
    <div class="app-tabs__bar">
      <div class="app-tabs__list">
        <div
          v-for="tab in tabsStore.tabs"
          :key="tab.path"
          class="app-tabs__item"
          :class="{ 'is-active': route.path === tab.path, 'is-affix': tab.affix }"
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
        <div
          v-for="n in emptySlots"
          :key="`empty-${n}`"
          class="app-tabs__slot"
          aria-hidden="true"
        />
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
.app-tabs {
  position: sticky;
  top: var(--header-height);
  z-index: 20;
  height: 48px;
  padding: 0 12px;
  background: linear-gradient(180deg, #eef4fa 0%, #e8f0f8 100%);
  border-bottom: 1px solid rgba(24, 144, 255, 0.1);
  flex-shrink: 0;

  &--flush-below {
    background: linear-gradient(180deg, #f0f4f8 0%, #e8f2fa 100%);
    border-bottom-color: rgba(24, 144, 255, 0.08);
  }

  &__bar {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 100%;
    max-width: 100%;
  }

  &__list {
    flex: 1;
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(10, minmax(0, 1fr));
    gap: 8px;
    height: 100%;
    padding: 6px 0;
  }

  &__item {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-width: 0;
    height: 36px;
    padding: 0 12px;
    font-size: 15px;
    line-height: 1;
    color: #64748b;
    background: rgba(255, 255, 255, 0.75);
    border: 1px solid rgba(24, 144, 255, 0.12);
    border-radius: 8px;
    cursor: pointer;
    white-space: nowrap;
    user-select: none;
    transition:
      color 0.18s ease,
      background 0.18s ease,
      border-color 0.18s ease,
      box-shadow 0.18s ease;

    &:hover:not(.is-active) {
      color: var(--color-primary);
      background: rgba(255, 255, 255, 0.95);
      border-color: rgba(24, 144, 255, 0.28);
    }

    &.is-active {
      color: #fff;
      background: linear-gradient(135deg, #1890ff 0%, #096dd9 100%);
      border-color: transparent;
      font-weight: 600;
      box-shadow: 0 2px 10px rgba(24, 144, 255, 0.35);

      .app-tabs__close {
        color: rgba(255, 255, 255, 0.85);

        &:hover {
          background: rgba(255, 255, 255, 0.22);
          color: #fff;
        }
      }
    }
  }

  &__slot {
    height: 36px;
    border: 1px dashed rgba(24, 144, 255, 0.08);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.35);
  }

  &__title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
    text-align: center;
  }

  &__close {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    padding: 0;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: inherit;
    cursor: pointer;
    opacity: 0.75;
    transition: all 0.15s;

    &:hover {
      opacity: 1;
      background: rgba(24, 144, 255, 0.12);
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
