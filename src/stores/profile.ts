// ============================================================
// 个人中心 — Pinia Store
// 按需求文档 6.5 节结构
// ============================================================
import { defineStore } from 'pinia'
import { ref, reactive } from 'vue'
import type { ProfileInfo, OperationLog } from '@/shared/types'

export const useProfileStore = defineStore('profile', () => {
  // ── 用户资料 ──
  const userInfo = ref<ProfileInfo | null>(null)
  const profileLoading = ref(false)

  // ── 操作日志 ──
  const operationLogs = ref<OperationLog[]>([])
  const operationLogPagination = reactive({ page: 1, pageSize: 15, total: 0 })
  const operationLogLoading = ref(false)
  const operationLogFilters = reactive({
    module: null as string | null,
    start: null as string | null,
    end: null as string | null,
  })

  // ── Actions ──

  function setUserInfo(info: ProfileInfo) {
    userInfo.value = info
  }

  function setOperationLogs(logs: OperationLog[], total: number) {
    operationLogs.value = logs
    operationLogPagination.total = total
  }

  function setLogFilters(filters: Partial<typeof operationLogFilters>) {
    Object.assign(operationLogFilters, filters)
  }

  function reset() {
    userInfo.value = null
    operationLogs.value = []
    operationLogPagination.page = 1
    operationLogPagination.total = 0
    operationLogFilters.module = null
    operationLogFilters.start = null
    operationLogFilters.end = null
  }

  return {
    userInfo,
    profileLoading,
    operationLogs,
    operationLogPagination,
    operationLogLoading,
    operationLogFilters,
    setUserInfo,
    setOperationLogs,
    setLogFilters,
    reset,
  }
})
