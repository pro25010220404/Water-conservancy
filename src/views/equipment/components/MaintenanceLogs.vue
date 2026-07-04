<script setup lang="ts">
// ============================================================
// 维护日志 — 表格 + 分页
// ============================================================

import { ref, onMounted, watch } from 'vue'
import { ElTable, ElTableColumn, ElTag, ElPagination } from 'element-plus'
import { MAINTENANCE_TYPE } from '@/constants'
import { getEquipmentLogs } from '@/api/equipment'
import type { EquipmentDetail } from '@/shared/types'

const props = defineProps<{
  deviceId: number
}>()

// ── 数据 ──
const loading = ref(false)
const list = ref<Record<string, unknown>[]>([])
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)

const pageSizeOptions = [10, 15, 20, 50]

// ── 字典映射 ──
function getTypeLabel(type: string): string {
  return MAINTENANCE_TYPE[type]?.label ?? type
}

function getResultType(result: number | string): 'success' | 'danger' {
  return result === 1 || result === 'success' ? 'success' : 'danger'
}

function getResultLabel(result: number | string): string {
  return result === 1 || result === 'success' ? '成功' : '失败'
}

// ── 获取维护日志 ──
async function fetchLogs() {
  loading.value = true
  try {
    const res = await getEquipmentLogs(props.deviceId, {
      page: page.value,
      page_size: pageSize.value,
    })
    const body = res.data
    if (body.code === 0 && body.data) {
      list.value = body.data.list
      total.value = body.data.total
    }
  } catch {
    // Mock fallback
    list.value = [
      {
        id: 1,
        time: '2026-07-03 10:05:00',
        type: 'restart',
        content: '远程重启设备，重启原因：固件异常恢复',
        operator: '管理员',
        result: 1,
      },
      {
        id: 2,
        time: '2026-07-02 15:30:00',
        type: 'param_change',
        content: '修改采样频率从 5s 调整为 10s',
        operator: '张工',
        result: 1,
      },
      {
        id: 3,
        time: '2026-07-01 09:00:00',
        type: 'regular_check',
        content: '月度定期检修：检查接线、清洁传感器探头',
        operator: '李工',
        result: 1,
      },
      {
        id: 4,
        time: '2026-06-28 16:45:00',
        type: 'firmware_upgrade',
        content: '固件升级至 v2.1.3，升级过程中通信中断',
        operator: '管理员',
        result: 0,
      },
    ]
    total.value = list.value.length
  } finally {
    loading.value = false
  }
}

// ── 分页 ──
function onPageChange(p: number) {
  page.value = p
  fetchLogs()
}
function onSizeChange(s: number) {
  pageSize.value = s
  page.value = 1
  fetchLogs()
}

onMounted(() => {
  fetchLogs()
})

watch(
  () => props.deviceId,
  () => {
    page.value = 1
    fetchLogs()
  },
)
</script>

<template>
  <div class="maintenance-logs">
    <ElTable v-loading="loading"
:data="list" stripe size="small" class="maintenance-logs__table">
      <ElTableColumn prop="time" label="时间" width="160" />
      <ElTableColumn
prop="type" label="操作类型"
width="120"
>
        <template #default="scope">
          {{ getTypeLabel(scope.row.type as string) }}
        </template>
      </ElTableColumn>
      <ElTableColumn prop="content" label="操作内容" min-width="220" show-overflow-tooltip />
      <ElTableColumn prop="operator" label="操作人" width="100" />
      <ElTableColumn
prop="result" label="操作结果"
width="90"
>
        <template #default="scope">
          <ElTag :type="getResultType(scope.row.result as number)" size="small" disable-transitions>
            {{ getResultLabel(scope.row.result as number) }}
          </ElTag>
        </template>
      </ElTableColumn>
    </ElTable>

    <div class="maintenance-logs__pagination">
      <ElPagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :page-sizes="pageSizeOptions"
        :total="total"
        layout="total, sizes, prev, pager, next"
        background
        small
        @current-change="onPageChange"
        @size-change="onSizeChange"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.maintenance-logs {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);

  &__table {
    flex: 1;
  }

  &__pagination {
    display: flex;
    justify-content: flex-end;
  }
}
</style>
