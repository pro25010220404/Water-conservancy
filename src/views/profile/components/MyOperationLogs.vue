<script setup lang="ts">
// ============================================================
// 我的操作日志 — 对接登录日志接口 §1.3，日期筛选
// ============================================================
import { ref, onMounted } from 'vue'
import {
  ElTable, ElTableColumn, ElPagination,
  ElDatePicker, ElTag,
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

// 筛选（仅日期范围，登录日志无模块维度）
const filterDateRange = ref<[string, string] | null>(null)

// ── 种子数据（API 不可用时降级） ──

const SEED_LOGS: OperationLog[] = [
  { id: 1, time: '2026-07-03 10:05:22', module: '登录认证', type: '登录', description: '用户 admin 登录成功', result: 1 },
  { id: 2, time: '2026-07-02 09:30:15', module: '登录认证', type: '登录', description: '用户 zhangsan 登录成功', result: 1 },
  { id: 3, time: '2026-07-01 08:00:00', module: '登录认证', type: '登录', description: '用户 admin 登录成功', result: 1 },
  { id: 4, time: '2026-06-30 17:00:00', module: '登录认证', type: '登录失败', description: '用户 lisi 登录失败（密码错误）', result: 0 },
  { id: 5, time: '2026-06-29 08:45:00', module: '登录认证', type: '登录', description: '用户 admin 登录成功', result: 1 },
]

// ── 方法 ──

async function fetchLogs() {
  loading.value = true
  try {
    const res = await getOperationLogs({
      page: currentPage.value,
      page_size: pageSize,
      start_time: filterDateRange.value?.[0] || undefined,
      end_time: filterDateRange.value?.[1] || undefined,
    })

    if (res.data?.code === 0 && res.data.data) {
      logs.value = res.data.data.list
      total.value = res.data.data.total
      profileStore.setOperationLogs(res.data.data.list, res.data.data.total)
      loading.value = false
      return
    }
  } catch {
    /* API 不可用，降级 localStorage */
  }

  // ── 降级 ──
  let all: OperationLog[] = []
  const raw = localStorage.getItem('operationLogs')
  if (raw) {
    try { all = JSON.parse(raw) } catch { all = [...SEED_LOGS] }
  } else {
    all = [...SEED_LOGS]
    localStorage.setItem('operationLogs', JSON.stringify(SEED_LOGS))
  }

  if (filterDateRange.value) {
    const [s, e] = filterDateRange.value
    all = all.filter((l) => l.time.slice(0, 10) >= s && l.time.slice(0, 10) <= e)
  }

  all.sort((a, b) => b.id - a.id)
  total.value = all.length
  logs.value = all.slice((currentPage.value - 1) * pageSize, currentPage.value * pageSize)
  profileStore.setOperationLogs(logs.value, all.length)
  loading.value = false
}

function onFilterChange() {
  currentPage.value = 1
  fetchLogs()
}

function onPageChange(page: number) {
  currentPage.value = page
  fetchLogs()
}

onMounted(() => {
  fetchLogs()
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
      @current-change="onPageChange"
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
