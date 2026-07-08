// ============================================================
// 会话保活 — 定时发轻量请求，防止后端 session 空闲超时
// ============================================================
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useUserStore } from '@/stores/user'
import http from '@/api/request'

/** 保活间隔（毫秒），默认 4 分钟 — 小于常见的 5-30 分钟 session 超时 */
const PING_INTERVAL = 4 * 60 * 1000

/**
 * 会话保活 composable
 * 在已登录状态下每 4 分钟向后端发一次轻量请求，
 * 重置后端的 session 空闲计时器，避免长时间不操作后 401。
 *
 * 用法：在 MainLayout 的 <script setup> 中调用 useSessionKeepAlive()
 */
export function useSessionKeepAlive() {
  const userStore = useUserStore()
  const lastPingAt = ref<number>(0)
  let timer: ReturnType<typeof setInterval> | null = null

  async function ping() {
    try {
      // 发一个极轻量的 HEAD 请求，只带 token 不拉数据
      await http.head('/v1/alarms', { timeout: 10000 })
      lastPingAt.value = Date.now()
      if (import.meta.env.DEV) {
        console.debug('[KeepAlive] ping ok', new Date().toLocaleTimeString())
      }
    } catch {
      // 网络波动或后端短暂不可用不处理，401 由拦截器统一跳登录
      if (import.meta.env.DEV) {
        console.debug('[KeepAlive] ping failed (ignored)')
      }
    }
  }

  function start() {
    if (timer) return
    // 启动后立刻发一次
    ping()
    timer = setInterval(ping, PING_INTERVAL)
  }

  function stop() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  // 监听登录状态变化
  watch(
    () => userStore.isLoggedIn,
    (loggedIn) => {
      if (loggedIn) {
        start()
      } else {
        stop()
      }
    },
    { immediate: true },
  )

  // 组件卸载时清理定时器
  onUnmounted(() => stop())

  return { lastPingAt, stop, ping }
}
