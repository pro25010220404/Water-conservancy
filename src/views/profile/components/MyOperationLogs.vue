<script setup lang="ts">
// ============================================================
// 我的操作日志 — 筛选器 + 表格 + 分页
// ============================================================
import { ref, reactive, computed, onMounted } from 'vue'
import {
  ElTable, ElTableColumn, ElPagination, ElSelect, ElOption,
  ElDatePicker, ElTag, ElMessage,
} from 'element-plus'
import { useProfileStore } from '@/stores/profile'
import { getOperationLogs } from '@/api/profile'
import { OPERATION_MODULES, OPERATION_MODULE_OPTIONS, OPERATION_TYPES } from '@/constants/profile'
import type { OperationLog } from '@/shared/types'

// ── Store ──

const profileStore = useProfileStore()

// ── 状态 ──

const loading = ref(false)
const logs = ref<OperationLog[]>([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = 15

// 筛选
const filterModule = ref<string>('')
const filterDateRange = ref<[string, string] | null>(null)

// ── 种子数据（API 不可用时的 fallback） ──

const SEED_LOGS: OperationLog[] = [
  { id: 1, time: '2026-07-03 10:05:22', module: '登录认证', type: '登录', description: '用户 admin 登录成功', result: 1 },
  { id: 2, time: '2026-07-03 09:30:15', module: '系统设置', type: '修改', description: '更新了上游水位告警阈值', result: 1 },
  { id: 3, time: '2026-07-02 18:20:00', module: '设备管理', type: '重启', description: '远程重启设备「水泵」', result: 1 },
  { id: 4, time: '2026-07-02 16:45:30', module: '调度决策', type: '执行', description: '手动下发闸门开度 35%', result: 1 },
  { id: 5, time: '2026-07-02 14:10:00', module: '告警处理', type: '处置', description: '处置告警 ALM-20260702-00078', result: 1 },
  { id: 6, time: '2026-07-02 11:30:00', module: '个人中心', type: '修改', description: '更新了个人资料', result: 1 },
  { id: 7, time: '2026-07-01 09:00:00', module: '登录认证', type: '登录', description: '用户 admin 登录成功', result: 1 },
  { id: 8, time: '2026-06-30 17:00:00', module: '系统设置', type: '新增', description: '创建新用户「孙七」', result: 1 },
  { id: 9, time: '2026-06-30 15:30:00', module: '设备管理', type: '状态变更', description: '设备「降压模块」标记为维护中', result: 1 },
  { id: 10, time: '2026-06-29 08:45:00', module: '登录认证', type: '登录', description: '用户 zhangsan 登录失败（密码错误）', result: 0 },
  { id: 11, time: '2026-06-28 20:12:00', module: '闸门控制', type: '急停', description: '闸门急停操作，ID: G201', result: 1 },
  { id: 12, time: '2026-06-28 14:00:00', module: '告警处理', type: '查看', description: '查看告警详情 ALM-20260628-00102', result: 1 },
  { id: 13, time: '2026-06-27 11:30:00', module: '调度决策', type: '查看', description: '查看调度方案 v3.2.1', result: 1 },
  { id: 14, time: '2026-06-27 09:00:00', module: '登录认证', type: '登录', description: '用户 admin 登录成功', result: 1 },
  { id: 15, time: '2026-06-26 16:45:00', module: '系统设置', type: '修改', description: '修改多目标权重配置（防洪优先）', result: 1 },
]

// ── 方法 ──

/** 获取日志数据（API 优先，失败则使用 local/seed 数据） */
async function fetchLogs() {
  loading.value = true
  try {
    const res = await getOperationLogs({
      page: currentPage.value,
      page_size: pageSize,
      module: filterModule.value || undefined,
      start: filterDateRange.value?.[0] || undefined,
      end: filterDateRange.value?.[1] || undefined,
    })

    if (res.data?.code === 0 && res.data.data) {
      logs.value = res.data.data.list
      total.value = res.data.data.total
      profileStore.setOperationLogs(res.data.data.list, res.data.data.total)
      return
    }
  } catch {
    // API 不可用，使用本地数据
  }

  // 降级：使用 localStorage 日志或种子数据
  let all: OperationLog[] = []

  // 优先从 composable 加载（其他模块可能写入了数据）
  const raw = localStorage.getItem('operationLogs')
  if (raw) {
    try {
      all = JSON.parse(raw)
    } catch {
      all = [...SEED_LOGS]
    }
  } else {
    all = [...SEED_LOGS]
    // 首次写入种子
    localStorage.setItem('operationLogs', JSON.stringify(SEED_LOGS))
  }

  // 按模块筛选
  if (filterModule.value) {
    const moduleLabel = OPERATION_MODULES[filterModule.value]
    all = all.filter((l) => l.module === (moduleLabel || filterModule.value))
  }

  // 按日期范围筛选
  if (filterDateRange.value) {
    const [start, end] = filterDateRange.value
    all = all.filter((l) => {
      const datePart = l.time.slice(0, 10)
      return datePart >= start && datePart <= end
    })
  }

  // 按 id 降序（时间最新在前）
  all.sort((a, b) => b.id - a.id)

  total.value = all.length
  const start = (currentPage.value - 1) * pageSize
  logs.value = all.slice(start, start + pageSize)

  profileStore.setOperationLogs(logs.value, all.length)
  loading.value = false
}

/** 筛选变更时重置页码 */
function onFilterChange() {
  currentPage.value = 1
  fetchLogs()
}

/** 分页变更 */
function onPageChange(page: number) {
  currentPage.value = page
  fetchLogs()
}

// ── 生命周期 ──

onMounted(() => {
  fetchLogs()
})
</script>

<template>
  <div class="operation-logs">
    <!-- 筛选栏 -->
    <div class="operation-logs__filters">
      <ElSelect
        v-model="filterModule"
        placeholder="操作模块"
        clearable
        style="width: 160px"
        @change="onFilterChange"
      >
        <ElOption
          v-for="m in OPERATION_MODULE_OPTIONS"
          :key="m.value"
          :label="m.label"
          :value="m.value"
        />
      </ElSelect>

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

    <!-- 表格 -->
    <ElTable
      v-loading="loading"
      :data="logs"
      class="operation-logs__table"
      style="width: 100%; margin-top: 14px"
    >
      <ElTableColumn
        prop="time"
        label="时间"
        width="190"
      />
      <ElTableColumn
        prop="module"
        label="操作模块"
        width="120"
      />
      <ElTableColumn
        label="操作类型"
        width="130"
      >
        <template #default="scope">
          {{ (OPERATION_TYPES as Record<string, string>)[scope.row.type] || scope.row.type }}
        </template>
      </ElTableColumn>
      <ElTableColumn
        prop="description"
        label="操作描述"
        min-width="220"
        show-overflow-tooltip
      />
      <ElTableColumn
        label="操作结果"
        width="100"
      >
        <template #default="scope">
          <ElTag :type="(scope.row as OperationLog).result === 1 ? 'success' : 'danger'">
            {{ (scope.row as OperationLog).result === 1 ? '成功' : '失败' }}
          </ElTag>
        </template>
      </ElTableColumn>
    </ElTable>

    <!-- 分页 -->
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

    :deep(.el-select),
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
    :deep(.el-pagination__total) {
      font-size: 15px;
    }

    :deep(.btn-prev),
    :deep(.btn-next),
    :deep(.el-pager li) {
      min-width: 36px;
      height: 36px;
      line-height: 36px;
      font-size: 15px;
    }
  }
}
</style>
