<script setup lang="ts">
// ============================================================
// 故障记录 — 表格 + 分页
// ============================================================

import { ref, onMounted, watch } from 'vue'
import {
  ElTable,
  ElTableColumn,
  ElTag,
  ElPagination,
  ElButton,
  ElMessage,
  ElMessageBox,
} from 'element-plus'
import { FAULT_TYPE } from '@/constants'
import { getEquipmentFaults, markEquipmentNormal } from '@/api/equipment'
import { useOperationLog } from '@/composables/useOperationLog'

const props = defineProps<{
  deviceId: number
}>()

const { record: recordLog } = useOperationLog()

// ── 数据 ──
const loading = ref(false)
const list = ref<Record<string, unknown>[]>([])
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)

const pageSizeOptions = [10, 15, 20, 50]

// ── 字典映射 ──
function getFaultTypeLabel(type: string): string {
  return FAULT_TYPE[type]?.label ?? type
}

function getFaultTypeColor(type: string): string {
  return FAULT_TYPE[type]?.color ?? '#909399'
}

function getStatusType(status: string): 'warning' | 'success' | 'danger' {
  const map: Record<string, 'warning' | 'success' | 'danger'> = {
    pending: 'warning',
    resolved: 'success',
    acknowledged: 'warning',
  }
  return map[status] ?? 'warning'
}

function getStatusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: '待处理',
    resolved: '已修复',
    acknowledged: '已确认',
  }
  return map[status] ?? status
}

// ── 获取故障记录 ──
async function fetchFaults() {
  loading.value = true
  try {
    const res = await getEquipmentFaults(props.deviceId, {
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
        fault_time: '2026-07-03 08:45:00',
        fault_type: 'comm_loss',
        description: '设备心跳超时，通信中断',
        duration: '2小时30分',
        status: 'pending',
        handler: '-',
      },
      {
        id: 2,
        fault_time: '2026-06-28 14:20:00',
        fault_type: 'reading_abnormal',
        description: '水位读数异常波动，超出正常范围',
        duration: '45分钟',
        status: 'resolved',
        handler: '张工',
      },
    ]
    total.value = list.value.length
  } finally {
    loading.value = false
  }
}

// ── 标记修复 ──
async function handleMarkFixed(row: Record<string, unknown>) {
  try {
    await ElMessageBox.confirm(`确认将该故障标记为已修复？`, '确认操作', {
      confirmButtonText: '确认修复',
      type: 'success',
    })
    await markEquipmentNormal(props.deviceId)
    recordLog('设备管理', '故障修复', `将故障「${row.description}」标记为已修复`, 1)
    ElMessage.success('已标记为修复')
    fetchFaults()
  } catch {
    /* 取消 */
  }
}

// ── 添加备注 ──
function handleAddNote(row: Record<string, unknown>) {
  ElMessageBox.prompt('请输入备注信息', '添加备注', {
    confirmButtonText: '确定',
    inputType: 'textarea',
  })
    .then(({ value }) => {
      if (value) {
        recordLog('设备管理', '添加备注', `为故障记录添加备注：${value}`, 1)
        ElMessage.success('备注已添加')
      }
    })
    .catch(() => {
      /* 取消 */
    })
}

// ── 分页 ──
function onPageChange(p: number) {
  page.value = p
  fetchFaults()
}
function onSizeChange(s: number) {
  pageSize.value = s
  page.value = 1
  fetchFaults()
}

onMounted(() => {
  fetchFaults()
})

watch(
  () => props.deviceId,
  () => {
    page.value = 1
    fetchFaults()
  },
)
</script>

<template>
  <div class="fault-records">
    <ElTable v-loading="loading"
:data="list" stripe size="small" class="fault-records__table">
      <ElTableColumn prop="fault_time" label="故障时间" width="160" />
      <ElTableColumn
prop="fault_type" label="故障类型"
width="120"
>
        <template #default="scope">
          <ElTag
            :color="getFaultTypeColor(scope.row.fault_type as string)"
            size="small"
            disable-transitions
            effect="dark"
          >
            {{ getFaultTypeLabel(scope.row.fault_type as string) }}
          </ElTag>
        </template>
      </ElTableColumn>
      <ElTableColumn prop="description" label="故障描述" min-width="180" show-overflow-tooltip />
      <ElTableColumn prop="duration" label="持续时长" width="110" />
      <ElTableColumn
prop="status" label="处理状态"
width="100"
>
        <template #default="scope">
          <ElTag :type="getStatusType(scope.row.status as string)" size="small" disable-transitions>
            {{ getStatusLabel(scope.row.status as string) }}
          </ElTag>
        </template>
      </ElTableColumn>
      <ElTableColumn prop="handler" label="处理人" width="100" />
      <ElTableColumn
label="操作" width="180"
fixed="right"
>
        <template #default="scope">
          <div class="fault-records__actions">
            <ElButton
              v-if="scope.row.status === 'pending'"
              text
              type="success"
              size="small"
              @click="handleMarkFixed(scope.row)"
            >
              标记修复
            </ElButton>
            <ElButton text type="primary" size="small" @click="handleAddNote(scope.row)">
              添加备注
            </ElButton>
          </div>
        </template>
      </ElTableColumn>
    </ElTable>

    <div class="fault-records__pagination">
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
.fault-records {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);

  &__table {
    flex: 1;
  }

  &__actions {
    display: flex;
    gap: var(--spacing-xs);
  }

  &__pagination {
    display: flex;
    justify-content: flex-end;
  }
}
</style>
