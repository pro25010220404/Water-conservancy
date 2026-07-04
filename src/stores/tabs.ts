// ============================================================
// Pinia Store — 多标签页导航
// ============================================================
import { defineStore } from 'pinia'
import { ref, nextTick } from 'vue'
import { ElMessageBox } from 'element-plus'
import type { RouteLocationNormalized } from 'vue-router'
import router from '@/app/router'

export interface TabItem {
  path: string
  title: string
  name?: string
  affix?: boolean
}

const HOME_TAB: TabItem = {
  path: '/dashboard',
  title: '监控大屏',
  name: 'Dashboard',
  affix: true,
}

/** 最多同时打开的标签数（含固定首页） */
export const MAX_TABS = 8

export const useTabsStore = defineStore('tabs', () => {
  const tabs = ref<TabItem[]>([{ ...HOME_TAB }])
  const viewAlive = ref(true)

  function addTab(route: RouteLocationNormalized) {
    if (route.meta.requiresAuth === false || route.name === 'NotFound') return

    const path = route.path
    const existsIdx = tabs.value.findIndex((t) => t.path === path)
    if (existsIdx !== -1) {
      const [existing] = tabs.value.splice(existsIdx, 1)
      tabs.value.push(existing)
      return
    }

    if (tabs.value.length >= MAX_TABS) {
      ElMessageBox.alert(
        `标签栏最多同时打开 ${MAX_TABS} 个页面，请先关闭其他标签后再打开新页面。`,
        '标签页已满',
        { type: 'warning', confirmButtonText: '知道了' },
      )
      const fallback = tabs.value[tabs.value.length - 1]?.path ?? HOME_TAB.path
      if (router.currentRoute.value.path !== fallback) {
        router.replace(fallback)
      }
      return
    }

    tabs.value.push({
      path,
      title: (route.meta.shortTitle as string) || (route.meta.title as string) || path,
      name: route.name as string | undefined,
      affix: route.meta.affix as boolean | undefined,
    })
  }

  function switchTab(path: string) {
    if (router.currentRoute.value.path !== path) {
      router.push(path)
    }
  }

  function closeTab(path: string) {
    const tab = tabs.value.find((t) => t.path === path)
    if (!tab || tab.affix) return

    const idx = tabs.value.findIndex((t) => t.path === path)
    tabs.value.splice(idx, 1)

    if (router.currentRoute.value.path === path) {
      const next = tabs.value[idx] ?? tabs.value[idx - 1] ?? tabs.value[0]
      if (next) router.push(next.path)
    }
  }

  function closeOthers(path: string) {
    tabs.value = tabs.value.filter((t) => t.affix || t.path === path)
    if (!tabs.value.some((t) => t.path === router.currentRoute.value.path)) {
      router.push(path)
    }
  }

  function closeAll() {
    tabs.value = tabs.value.filter((t) => t.affix)
    router.push(HOME_TAB.path)
  }

  async function refreshTab(path: string) {
    if (router.currentRoute.value.path !== path) {
      await router.push(path)
    }
    viewAlive.value = false
    await nextTick()
    viewAlive.value = true
  }

  function syncFromRoute(route: RouteLocationNormalized) {
    addTab(route)
  }

  function resetTabs() {
    tabs.value = [{ ...HOME_TAB }]
    viewAlive.value = true
  }

  return {
    tabs,
    viewAlive,
    addTab,
    switchTab,
    closeTab,
    closeOthers,
    closeAll,
    refreshTab,
    syncFromRoute,
    resetTabs,
  }
})
