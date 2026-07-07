<script setup lang="ts">
// ============================================================
// 我的操作日志 — 对接登录日志接口 §1.3，日期筛选
// ============================================================
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import {
  ElTable, ElTableColumn, ElPagination,
  ElDatePicker, ElTag, ElMessage,
} from 'element-plus'
import { useProfileStore } from '@/stores/profile'
import { getOperationLogs } from '@/api/profile'
import { OPERATION_TYPES } from '@/constants/profile'
import type { OperationLog } from '@/shared/types'

// ── Store ──

const profileStore = useProfileStore()

// ── 状态 ──

const loading = ref(false)
const logs = ref<OperationLog[]>([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = 15

/** 取消上一次未完成的请求，避免快速翻页时并发请求打爆后端（502） */
let abortController: AbortController | null = null
/** 上次成功加载的页码，请求失败时回退到此页 */
let lastValidPage = 1
/** 请求序列号：双重保险，丢弃过时响应 */
let fetchSeq = 0

// 筛选（仅日期范围，登录日志无模块维度）
const filterDateRange = ref<[string, string] | null>(null)

// ── 种子数据（仅首次无任何数据时展示，API 不可用不替换已有数据） ──

const SEED_LOGS: OperationLog[] = [
  { id: 1, time: '2026-07-03 10:05:22', module: '登录认证', type: '登录', description: '用户 admin 登录成功', result: 1 },
  { id: 2, time: '2026-07-02 09:30:15', module: '登录认证', type: '登录', description: '用户 zhangsan 登录成功', result: 1 },
  { id: 3, time: '2026-07-01 08:00:00', module: '登录认证', type: '登录', description: '用户 admin 登录成功', result: 1 },
  { id: 4, time: '2026-06-30 17:00:00', module: '登录认证', type: '登录失败', description: '用户 lisi 登录失败（密码错误）', result: 0 },
  { id: 5, time: '2026-06-29 08:45:00', module: '登录认证', type: '登录', description: '用户 admin 登录成功', result: 1 },
]

// ── 方法 ──

async function fetchLogs() {
  // 取消上一次未完成的请求，避免并发打爆后端
  if (abortController) {
    abortController.abort()
  }
  abortController = new AbortController()
  const signal = abortController.signal

  const seq = ++fetchSeq
  const page = currentPage.value
  loading.value = true

  try {
    const res = await getOperationLogs({
      page,
      page_size: pageSize,
      start_time: filterDateRange.value?.[0] || undefined,
      end_time: filterDateRange.value?.[1] || undefined,
    }, signal)

    // 忽略过时响应
    if (seq !== fetchSeq) return

    if (res.data?.code === 0 && res.data.data) {
      logs.value = res.data.data.list
      total.value = res.data.data.total
      lastValidPage = page
      profileStore.setOperationLogs(res.data.data.list, res.data.data.total)
      return
    }
    // API 返回非 0 → 回退页码
    if (seq === fetchSeq) {
      currentPage.value = lastValidPage
      ElMessage.warning(res.data?.msg || '登录日志加载失败')
    }
  } catch (err: unknown) {
    // 请求被主动取消（AbortController）→ 静默，新请求已发出
    if (err instanceof DOMException && err.name === 'AbortError') return
    if (seq !== fetchSeq) return

    if (logs.value.length > 0) {
      // 已有真实数据 → 回退页码，保持当前数据
      currentPage.value = lastValidPage
      ElMessage.warning('网络异常，无法刷新登录日志')
    } else {
      // 首次加载且网络不通 → 种子数据兜底
      logs.value = [...SEED_LOGS]
      total.value = SEED_LOGS.length
      lastValidPage = 1
      profileStore.setOperationLogs(SEED_LOGS, SEED_LOGS.length)
      ElMessage.warning('网络不可用，展示本地示例数据')
    }
  } finally {
    if (seq === fetchSeq) {
      loading.value = false
    }
  }
}

function onFilterChange() {
  if (currentPage.value === 1) {
    fetchLogs()
  } else {
    currentPage.value = 1
  }
}

// 单一数据源：watch currentPage 驱动数据拉取
watch(currentPage, () => {
  fetchLogs()
})

onMounted(() => {
  fetchLogs()
})

onBeforeUnmount(() => {
  if (abortController) {
    abortController.abort()
  }
})
</script>

<template>
  <div class="operation-logs">
    <div class="operation-logs__filters">
      <ElDatePicker
        v-model="filterDateRange"
        type="daterange"
        range-separator="至"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        size="default"
        value-format="YYYY-MM-DD"
        @change="onFilterChange"
      />
    </div>

    <ElTable
      v-loading="loading"
      :data="logs"
      class="operation-logs__table"
      style="width: 100%; margin-top: 14px"
    >
      <ElTableColumn prop="time" label="时间" width="190" />
      <ElTableColumn prop="module" label="操作模块" width="120" />
      <ElTableColumn label="操作类型" width="130">
        <template #default="scope">
          {{ (OPERATION_TYPES as Record<string, string>)[scope.row.type] || scope.row.type }}
        </template>
      </ElTableColumn>
      <ElTableColumn prop="description" label="操作描述" min-width="220" show-overflow-tooltip />
      <ElTableColumn label="操作结果" width="100">
        <template #default="scope">
          <ElTag :type="(scope.row as OperationLog).result === 1 ? 'success' : 'danger'">
            {{ (scope.row as OperationLog).result === 1 ? '成功' : '失败' }}
          </ElTag>
        </template>
      </ElTableColumn>
    </ElTable>

    <ElPagination
      v-model:current-page="currentPage"
      :page-size="pageSize"
      :total="total"
      layout="total, prev, pager, next"
      background
      class="operation-logs__pagination"
      style="margin-top: 16px; justify-content: flex-end"
    />
  </div>
</template>

<style scoped lang="scss">
.operation-logs {
  &__filters {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;

    :deep(.el-date-editor) {
      font-size: 15px;
    }
  }

  &__table {
    :deep(.el-table__header th.el-table__cell) {
      font-size: 16px;
      font-weight: 600;
      padding: 14px 0;
    }

    :deep(.el-table__body td.el-table__cell) {
      font-size: 16px;
      padding: 14px 0;
    }

    :deep(.el-tag) {
      font-size: 14px;
      padding: 4px 10px;
    }
  }

  &__pagination {
    :deep(.el-pagination__total) { font-size: 15px; }
    :deep(.btn-prev), :deep(.btn-next), :deep(.el-pager li) {
      min-width: 36px; height: 36px; line-height: 36px; font-size: 15px;
    }
  }
}
</style>
